"""LLM_Client: thin synchronous wrapper around Ollama's /api/generate.

Every failure to get usable text is raised as ``LLMUnavailable`` with the
original error chained in ``__cause__``. Nothing is written to disk or DB, and
logs never contain prompt or response text.
"""

from __future__ import annotations

import logging
import time

import httpx

from . import settings

logger = logging.getLogger(__name__)

WARMUP_PROMPT = "Hi"


class LLMUnavailable(Exception):
    """Ollama could not produce usable text. Original error is in __cause__."""


def _generate(prompt: str, system: str | None, timeout: float) -> str:
    """POST one non-streaming generate request and return the stripped text."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")

    model = settings.llm_model()
    base_url = settings.ollama_url()
    payload: dict[str, object] = {"model": model, "prompt": prompt, "stream": False}
    if isinstance(system, str) and system.strip():
        payload["system"] = system

    started = time.monotonic()
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout)) as client:
            resp = client.post(f"{base_url}/api/generate", json=payload)
    # TimeoutException subclasses TransportError, so it must be caught first.
    except httpx.TimeoutException as exc:
        raise LLMUnavailable(f"Ollama timed out after {timeout}s") from exc
    except httpx.TransportError as exc:
        raise LLMUnavailable(f"Cannot reach Ollama at {base_url}: {exc}") from exc
    except httpx.HTTPError as exc:
        raise LLMUnavailable(f"Ollama request failed: {exc}") from exc
    finally:
        logger.debug(
            "Ollama generate model=%s prompt_len=%d elapsed=%.3fs",
            model,
            len(prompt),
            time.monotonic() - started,
        )

    if not 200 <= resp.status_code < 300:
        raise LLMUnavailable(
            f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}"
        )

    try:
        body = resp.json()
    except ValueError as exc:
        raise LLMUnavailable(f"Ollama returned invalid JSON: {exc}") from exc

    text = body.get("response") if isinstance(body, dict) else None
    if not isinstance(text, str):
        raise LLMUnavailable("Ollama response has no text field")

    text = text.strip()
    if not text:
        raise LLMUnavailable("Ollama returned an empty response")
    return text


def complete(prompt: str, system: str | None = None) -> str:
    """Return the model's stripped answer, or raise ``LLMUnavailable``.

    Raises ``ValueError`` for a non-str or blank prompt (caller bug, not outage).
    """
    return _generate(prompt, system, settings.request_timeout())


def warm_up() -> bool:
    """Send a tiny prompt so the model is loaded. Never raises."""
    model = settings.llm_model()
    try:
        _generate(WARMUP_PROMPT, None, settings.warmup_timeout())
    except Exception as exc:  # noqa: BLE001 - warm-up must never raise
        logger.warning("Ollama warm-up for model %s failed: %s", model, exc)
        return False
    logger.info("Ollama model %s is warm", model)
    return True
