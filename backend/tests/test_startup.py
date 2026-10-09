"""Unit tests for app.ai.startup() (Requirements 12.1-12.5, 13.4).

Whisper loading is faked by patching ``stt._create_model``; the Ollama warm-up
runs for real against respx (200 ok / ConnectError). One extra case patches
``llm.warm_up`` to raise, to exercise the guard in ``startup()``.

The "import with no other setup" check runs ``from app.ai import startup`` in a
fresh subprocess (cwd=backend) so no fixture or conftest state can help it.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
import respx

import app.config
from app.ai import llm, startup, stt
from app.ai.stt import STTLoadError

BACKEND_DIR = Path(__file__).resolve().parents[1]
BASE_URL = "http://ollama.test:11434"
MODEL = "startup-model:1b"
WHISPER = "tiny-test"
GENERATE_URL = f"{BASE_URL}/api/generate"

FAKE_MODEL = object()


@pytest.fixture(autouse=True)
def reset_and_configure(monkeypatch):
    stt._reset_for_tests()
    monkeypatch.setattr(app.config, "OLLAMA_URL", BASE_URL, raising=False)
    monkeypatch.setattr(app.config, "LLM_MODEL", MODEL, raising=False)
    monkeypatch.setattr(app.config, "WHISPER_MODEL", WHISPER, raising=False)
    yield
    stt._reset_for_tests()


def _whisper_ok(name):
    return FAKE_MODEL


def _whisper_fail(name):
    raise RuntimeError("whisper files missing")


def _warnings(caplog):
    return [r for r in caplog.records if r.levelno == logging.WARNING]


@pytest.mark.parametrize("whisper_ok", [True, False], ids=["whisper-ok", "whisper-fail"])
@pytest.mark.parametrize("ollama_ok", [True, False], ids=["ollama-ok", "ollama-fail"])
def test_startup_combinations(monkeypatch, caplog, whisper_ok, ollama_ok):
    monkeypatch.setattr(stt, "_create_model", _whisper_ok if whisper_ok else _whisper_fail)
    with respx.mock(assert_all_mocked=True, assert_all_called=True) as router:
        route = router.post(GENERATE_URL)
        if ollama_ok:
            route.respond(200, json={"response": "Hello"})
        else:
            route.mock(side_effect=httpx.ConnectError("connection refused"))
        with caplog.at_level(logging.INFO):
            result = startup()

    assert result is None
    # Warm-up is attempted even when Whisper failed (Req 12.3).
    assert route.call_count == 1

    messages = [r.getMessage() for r in _warnings(caplog)]
    whisper_warned = any("Whisper" in m for m in messages)
    ollama_warned = any(MODEL in m for m in messages)
    assert whisper_warned is (not whisper_ok)
    assert ollama_warned is (not ollama_ok)

    if whisper_ok:
        assert stt._model is FAKE_MODEL
    else:
        assert stt._model is None
        assert any("whisper files missing" in m for m in messages)


def test_startup_survives_non_stt_exception_from_load_model(monkeypatch, caplog):
    def boom():
        raise KeyError("unexpected")

    monkeypatch.setattr(stt, "load_model", boom)
    monkeypatch.setattr(llm, "warm_up", lambda: True)
    with caplog.at_level(logging.WARNING):
        assert startup() is None
    assert any("Whisper" in r.getMessage() for r in _warnings(caplog))


def test_startup_guards_warm_up_that_raises(monkeypatch, caplog):
    monkeypatch.setattr(stt, "_create_model", _whisper_ok)

    def bad_warm_up():
        raise RuntimeError("warm-up exploded")

    monkeypatch.setattr(llm, "warm_up", bad_warm_up)
    with caplog.at_level(logging.WARNING):
        assert startup() is None
    assert any("warm-up exploded" in r.getMessage() for r in _warnings(caplog))


def test_whisper_failure_is_stt_load_error_and_retried_later(monkeypatch):
    monkeypatch.setattr(stt, "_create_model", _whisper_fail)
    monkeypatch.setattr(llm, "warm_up", lambda: False)
    startup()
    assert stt._model is None
    # A later voice request retries the load (Req 12.2).
    with pytest.raises(STTLoadError):
        stt.load_model()
    monkeypatch.setattr(stt, "_create_model", _whisper_ok)
    assert stt.load_model() is FAKE_MODEL


def test_import_startup_with_no_other_setup():
    proc = subprocess.run(
        [sys.executable, "-c", "from app.ai import startup; assert callable(startup)"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 0, proc.stderr
