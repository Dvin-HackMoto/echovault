"""Unit tests for app/ai/settings.py (AI_Config).

Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import app.config
from app.ai import settings

AI_DIR = Path(settings.__file__).resolve().parent

STR_SETTINGS = [
    ("OLLAMA_URL", settings.ollama_url, "http://localhost:11434"),
    ("LLM_MODEL", settings.llm_model, "qwen2.5:3b"),
    ("WHISPER_MODEL", settings.whisper_model, "small"),
]
FLOAT_SETTINGS = [
    ("LLM_TIMEOUT_S", settings.request_timeout, 8.0),
    ("LLM_WARMUP_TIMEOUT_S", settings.warmup_timeout, 60.0),
]
ALL_SETTINGS = STR_SETTINGS + FLOAT_SETTINGS


# --- Defaults (Req 1.2, 1.3) ------------------------------------------------


@pytest.mark.parametrize("name,accessor,default", ALL_SETTINGS)
def test_default_when_attribute_missing(monkeypatch, name, accessor, default):
    monkeypatch.delattr(app.config, name, raising=False)
    assert accessor() == default


@pytest.mark.parametrize("name,accessor,default", ALL_SETTINGS)
@pytest.mark.parametrize("empty", [None, "", "   "])
def test_default_when_attribute_none_or_empty(monkeypatch, name, accessor, default, empty):
    monkeypatch.setattr(app.config, name, empty, raising=False)
    assert accessor() == default


@pytest.mark.parametrize("name,accessor,default", FLOAT_SETTINGS)
def test_float_default_when_value_not_numeric(monkeypatch, name, accessor, default):
    monkeypatch.setattr(app.config, name, "not-a-number", raising=False)
    assert accessor() == default


def test_timeout_defaults_are_8_and_60(monkeypatch):
    monkeypatch.delattr(app.config, "LLM_TIMEOUT_S", raising=False)
    monkeypatch.delattr(app.config, "LLM_WARMUP_TIMEOUT_S", raising=False)
    assert settings.request_timeout() == 8.0
    assert settings.warmup_timeout() == 60.0


# --- Overrides take effect on the next read (Req 1.1, 1.2, 1.5) -------------


@pytest.mark.parametrize(
    "name,accessor,value,expected",
    [
        ("OLLAMA_URL", settings.ollama_url, "http://ollama.test:9999", "http://ollama.test:9999"),
        ("LLM_MODEL", settings.llm_model, "llama3.2:1b", "llama3.2:1b"),
        ("WHISPER_MODEL", settings.whisper_model, "base", "base"),
        ("LLM_TIMEOUT_S", settings.request_timeout, 2.5, 2.5),
        ("LLM_WARMUP_TIMEOUT_S", settings.warmup_timeout, 15, 15.0),
        ("LLM_TIMEOUT_S", settings.request_timeout, "3", 3.0),
    ],
)
def test_monkeypatch_override_read_on_next_call(monkeypatch, name, accessor, value, expected):
    monkeypatch.setattr(app.config, name, value, raising=False)
    assert accessor() == expected
    # A second override is also picked up immediately (no caching).
    defaults = {n: d for n, _, d in ALL_SETTINGS}
    monkeypatch.setattr(app.config, name, None, raising=False)
    assert accessor() == defaults[name]


def test_override_without_prior_attribute(monkeypatch):
    monkeypatch.delattr(app.config, "LLM_MODEL", raising=False)
    assert settings.llm_model() == "qwen2.5:3b"
    monkeypatch.setattr(app.config, "LLM_MODEL", "phi3:mini", raising=False)
    assert settings.llm_model() == "phi3:mini"


# --- Trailing slash ---------------------------------------------------------


@pytest.mark.parametrize(
    "value,expected",
    [
        ("http://localhost:11434/", "http://localhost:11434"),
        ("http://ollama.test:9999///", "http://ollama.test:9999"),
        ("  http://ollama.test/  ", "http://ollama.test"),
        ("http://localhost:11434", "http://localhost:11434"),
    ],
)
def test_ollama_url_trailing_slash_stripped(monkeypatch, value, expected):
    monkeypatch.setattr(app.config, "OLLAMA_URL", value, raising=False)
    assert settings.ollama_url() == expected


def test_ollama_url_only_slashes_falls_back_to_default(monkeypatch):
    monkeypatch.setattr(app.config, "OLLAMA_URL", "///", raising=False)
    assert settings.ollama_url() == "http://localhost:11434"


# --- Static check: only settings.py imports app.config (Req 1.4) ------------


def _imports_app_config(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(a.name == "app.config" or a.name.startswith("app.config.") for a in node.names):
                return True
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            names = {a.name for a in node.names}
            if node.level == 0:
                if module == "app.config" or module.startswith("app.config."):
                    return True
                if module == "app" and "config" in names:
                    return True
            else:
                # Relative imports from inside app/ai/ (level 2 reaches app/).
                if node.level == 2 and (module == "config" or module.startswith("config.")):
                    return True
                if node.level == 2 and module == "" and "config" in names:
                    return True
        elif isinstance(node, ast.Call):
            # importlib.import_module("app.config") / __import__("app.config")
            if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == "app.config":
                return True
    return False


def test_import_detector_recognises_import_forms():
    for src in (
        "import app.config",
        "from app import config",
        "from app.config import OLLAMA_URL",
        "from .. import config",
        "from ..config import LLM_MODEL",
        "import importlib\nimportlib.import_module('app.config')",
    ):
        assert _imports_app_config(ast.parse(src)), src
    for src in ("from app.ai import settings", "from . import settings", "import os"):
        assert not _imports_app_config(ast.parse(src)), src


def test_only_settings_module_imports_app_config():
    files = sorted(AI_DIR.rglob("*.py"))
    assert files, f"no Python files found in {AI_DIR}"
    offenders = [
        str(path.relative_to(AI_DIR))
        for path in files
        if path.name != "settings.py" or path.parent != AI_DIR
        if _imports_app_config(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
    ]
    assert offenders == [], f"files in app/ai/ importing app.config directly: {offenders}"
    assert _imports_app_config(ast.parse((AI_DIR / "settings.py").read_text(encoding="utf-8")))
