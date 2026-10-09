"""Integration suite setup (Req 15.1, 15.2).

Every test under ``tests/integration/`` is marked ``integration`` (deselected by
the default ``-m "not integration"`` in pytest.ini) and ``enable_socket`` (so
pytest-socket lets it reach the real Ollama server). Run with
``pytest -m integration``.

Session fixtures skip the dependent tests with a message naming the missing
service when Ollama or the Whisper model is unavailable.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.ai import settings, stt

_INTEGRATION_DIR = Path(__file__).parent.resolve()
_PROBE_TIMEOUT_S = 2.0


@pytest.hookimpl(tryfirst=True)
def pytest_collection_modifyitems(config, items):
    """Mark tests in this directory before pytest applies ``-m`` deselection.

    A ``pytestmark`` in a conftest does not reach test modules, so the markers
    are added here. The hook sees every collected item, so filter by path.
    """
    for item in items:
        try:
            Path(item.path).resolve().relative_to(_INTEGRATION_DIR)
        except ValueError:
            continue
        item.add_marker(pytest.mark.integration)
        item.add_marker(pytest.mark.enable_socket)


def _base_name(model: str) -> str:
    """``qwen2.5:3b`` -> itself; ``foo`` and ``foo:latest`` -> ``foo``."""
    return model[: -len(":latest")] if model.endswith(":latest") else model


def _model_listed(wanted: str, tags: object) -> bool:
    """True when ``wanted`` appears in an ``/api/tags`` body (name or model)."""
    if not isinstance(tags, dict) or not isinstance(tags.get("models"), list):
        return False
    target = _base_name(wanted)
    for entry in tags["models"]:
        if not isinstance(entry, dict):
            continue
        for key in ("name", "model"):
            value = entry.get(key)
            if isinstance(value, str) and _base_name(value) == target:
                return True
    return False


@pytest.fixture(scope="session")
def ollama_ready() -> str:
    """Skip unless Ollama answers at OLLAMA_URL and LLM_MODEL is pulled.

    Returns the model name for convenience.
    """
    url = settings.ollama_url()
    model = settings.llm_model()
    message = f"Ollama not reachable at {url} or model {model} not pulled"
    try:
        response = httpx.get(f"{url}/api/tags", timeout=_PROBE_TIMEOUT_S)
        response.raise_for_status()
        tags = response.json()
    except Exception as exc:  # connection refused, timeout, bad JSON, ...
        pytest.skip(f"{message} ({type(exc).__name__}: {exc})")
    if not _model_listed(model, tags):
        pytest.skip(message)
    return model


@pytest.fixture(scope="session")
def whisper_ready():
    """Skip unless the Whisper model loads; returns the loaded model."""
    name = settings.whisper_model()
    try:
        return stt.load_model()
    except stt.STTLoadError as exc:
        pytest.skip(f"Whisper model {name} could not be loaded ({exc.__cause__!r})")
