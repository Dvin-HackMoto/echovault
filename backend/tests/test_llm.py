"""Unit tests for app.ai.llm (Ollama client). All HTTP is mocked with respx."""

from __future__ import annotations

import json
import logging

import httpx
import pytest
import respx

import app.config
from app.ai import llm
from app.ai.llm import LLMUnavailable

BASE_URL = "http://ollama.test:11434"
MODEL = "test-model:1b"
GENERATE_URL = f"{BASE_URL}/api/generate"


@pytest.fixture(autouse=True)
def pinned_config(monkeypatch):
    monkeypatch.setattr(app.config, "OLLAMA_URL", BASE_URL + "/", raising=False)
    monkeypatch.setattr(app.config, "LLM_MODEL", MODEL, raising=False)
    monkeypatch.setattr(app.config, "LLM_TIMEOUT_S", 8.0, raising=False)
    monkeypatch.setattr(app.config, "LLM_WARMUP_TIMEOUT_S", 60.0, raising=False)


@pytest.fixture
def mock():
    with respx.mock(assert_all_mocked=True, assert_all_called=True) as router:
        yield router


def _body(route) -> dict:
    return json.loads(route.calls.last.request.content)


# --- success and request shape ----------------------------------------------


def test_complete_returns_stripped_text(mock):
    route = mock.post(GENERATE_URL).respond(200, json={"response": "  Ana is here.\n"})
    assert llm.complete("Who is Ana?") == "Ana is here."
    assert route.call_count == 1
    body = _body(route)
    assert body == {"model": MODEL, "prompt": "Who is Ana?", "stream": False}
    assert "system" not in body


def test_complete_sends_system_when_supplied(mock):
    route = mock.post(GENERATE_URL).respond(200, json={"response": "ok"})
    llm.complete("Q?", system="Answer only from records.")
    assert _body(route)["system"] == "Answer only from records."


@pytest.mark.parametrize("system", [None, "", "   "])
def test_complete_omits_blank_system(mock, system):
    route = mock.post(GENERATE_URL).respond(200, json={"response": "ok"})
    llm.complete("Q?", system=system)
    assert "system" not in _body(route)


def test_complete_uses_request_timeout(mock, monkeypatch):
    monkeypatch.setattr(app.config, "LLM_TIMEOUT_S", 3.5, raising=False)
    route = mock.post(GENERATE_URL).respond(200, json={"response": "ok"})
    llm.complete("Q?")
    timeout = route.calls.last.request.extensions["timeout"]
    assert set(timeout.values()) == {3.5}


@pytest.mark.parametrize("prompt", ["", "   ", "\n\t", None, 42])
def test_complete_rejects_bad_prompt_without_http(prompt):
    with respx.mock(assert_all_mocked=True, assert_all_called=False) as router:
        route = router.post(GENERATE_URL).respond(200, json={"response": "ok"})
        with pytest.raises(ValueError):
            llm.complete(prompt)  # type: ignore[arg-type]
    assert route.call_count == 0


# --- failures map to LLMUnavailable -----------------------------------------


@pytest.mark.parametrize(
    "exc, fragment",
    [
        (httpx.ReadTimeout("read timed out"), "timed out"),
        (httpx.ConnectError("connection refused"), "Cannot reach Ollama"),
    ],
)
def test_transport_errors_raise_llm_unavailable(mock, exc, fragment):
    mock.post(GENERATE_URL).mock(side_effect=exc)
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert fragment in str(info.value)
    assert isinstance(info.value.__cause__, type(exc))


def test_connect_error_message_includes_cause_and_url(mock):
    mock.post(GENERATE_URL).mock(side_effect=httpx.ConnectError("connection refused"))
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert BASE_URL in str(info.value)
    assert "connection refused" in str(info.value)


@pytest.mark.parametrize("status", [500, 404])
def test_non_2xx_raises_llm_unavailable(mock, status):
    mock.post(GENERATE_URL).respond(status, text="model not found")
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert f"HTTP {status}" in str(info.value)
    assert "model not found" in str(info.value)


def test_invalid_json_raises_llm_unavailable(mock):
    mock.post(GENERATE_URL).respond(200, text="not json")
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert "invalid JSON" in str(info.value)
    assert isinstance(info.value.__cause__, ValueError)


@pytest.mark.parametrize(
    "payload, fragment",
    [
        ({}, "no text field"),
        ({"response": 5}, "no text field"),
        ([1, 2], "no text field"),
        ({"response": "   "}, "empty response"),
    ],
)
def test_bad_response_body_raises_llm_unavailable(mock, payload, fragment):
    mock.post(GENERATE_URL).respond(200, json=payload)
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert fragment in str(info.value)


def test_generic_httpx_error_is_wrapped(mock):
    mock.post(GENERATE_URL).mock(side_effect=httpx.DecodingError("bad gzip"))
    with pytest.raises(LLMUnavailable) as info:
        llm.complete("Q?")
    assert "bad gzip" in str(info.value)
    assert isinstance(info.value.__cause__, httpx.HTTPError)


# --- warm-up ------------------------------------------------------------------


def test_warm_up_success_logs_info_and_uses_warmup_timeout(mock, monkeypatch, caplog):
    monkeypatch.setattr(app.config, "LLM_WARMUP_TIMEOUT_S", 42.0, raising=False)
    route = mock.post(GENERATE_URL).respond(200, json={"response": "Hello"})
    with caplog.at_level(logging.INFO, logger=llm.__name__):
        assert llm.warm_up() is True
    assert route.call_count == 1
    assert set(route.calls.last.request.extensions["timeout"].values()) == {42.0}
    assert _body(route)["prompt"] == llm.WARMUP_PROMPT
    infos = [r for r in caplog.records if r.levelno == logging.INFO]
    assert any(MODEL in r.getMessage() for r in infos)


@pytest.mark.parametrize(
    "configure",
    [
        lambda r: r.mock(side_effect=httpx.ReadTimeout("slow")),
        lambda r: r.mock(side_effect=httpx.ConnectError("refused")),
        lambda r: r.respond(500, text="boom"),
        lambda r: r.respond(200, json={"response": ""}),
    ],
    ids=["timeout", "connect", "http500", "empty"],
)
def test_warm_up_failure_logs_warning_and_returns_false(mock, caplog, configure):
    configure(mock.post(GENERATE_URL))
    with caplog.at_level(logging.WARNING, logger=llm.__name__):
        assert llm.warm_up() is False
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert MODEL in warnings[0].getMessage()


def test_warm_up_warning_includes_cause(mock, caplog):
    mock.post(GENERATE_URL).mock(side_effect=httpx.ConnectError("refused here"))
    with caplog.at_level(logging.WARNING, logger=llm.__name__):
        llm.warm_up()
    assert "refused here" in caplog.text


def test_logs_never_contain_prompt_or_response(mock, caplog):
    mock.post(GENERATE_URL).respond(200, json={"response": "SECRET-ANSWER"})
    with caplog.at_level(logging.DEBUG, logger=llm.__name__):
        llm.complete("SECRET-PROMPT")
    assert "SECRET-PROMPT" not in caplog.text
    assert "SECRET-ANSWER" not in caplog.text
