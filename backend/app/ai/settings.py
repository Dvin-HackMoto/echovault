"""AI_Config: the only place in app/ai/ that reads app.config.

Every accessor reads the attribute at call time so that
``monkeypatch.setattr(app.config, NAME, value)`` takes effect on the next read.
Missing, ``None`` or empty values fall back to the defaults below.
"""

from __future__ import annotations

import app.config

DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_LLM_MODEL = "qwen2.5:3b"
DEFAULT_WHISPER_MODEL = "small"
DEFAULT_REQUEST_TIMEOUT_S = 8.0
DEFAULT_WARMUP_TIMEOUT_S = 60.0


def _raw(name: str) -> object | None:
    """Return the config value, or None when missing, None or a blank string."""
    value = getattr(app.config, name, None)
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _str_setting(name: str, default: str) -> str:
    value = _raw(name)
    return default if value is None else str(value).strip()


def _float_setting(name: str, default: float) -> float:
    value = _raw(name)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def ollama_url() -> str:
    """Ollama base URL without a trailing slash."""
    return _str_setting("OLLAMA_URL", DEFAULT_OLLAMA_URL).rstrip("/") or DEFAULT_OLLAMA_URL


def llm_model() -> str:
    return _str_setting("LLM_MODEL", DEFAULT_LLM_MODEL)


def whisper_model() -> str:
    return _str_setting("WHISPER_MODEL", DEFAULT_WHISPER_MODEL)


def request_timeout() -> float:
    """Per-request timeout for Ollama completions, in seconds."""
    return _float_setting("LLM_TIMEOUT_S", DEFAULT_REQUEST_TIMEOUT_S)


def warmup_timeout() -> float:
    """Timeout for the startup warm-up request, in seconds."""
    return _float_setting("LLM_WARMUP_TIMEOUT_S", DEFAULT_WARMUP_TIMEOUT_S)
