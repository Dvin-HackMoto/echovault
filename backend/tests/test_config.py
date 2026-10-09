# HUB-1: config
import importlib
import os
import re
from pathlib import Path

import dotenv
import pytest

from app import config

ENV_KEYS = ("DB_PATH", "PHOTO_DIR", "OLLAMA_URL", "LLM_MODEL", "WHISPER_MODEL", "DEMO_MODE")

# Requirement 1.2 defaults, as written in .env.example
DEFAULTS = {
    "DB_PATH": "storage/echovault.db",
    "PHOTO_DIR": "storage/photos",
    "OLLAMA_URL": "http://localhost:11434",
    "LLM_MODEL": "qwen2.5:3b",
    "WHISPER_MODEL": "small",
    "DEMO_MODE": "false",
}

REAL_LOAD_DOTENV = dotenv.load_dotenv


@pytest.fixture
def reload_config(monkeypatch):
    # ignore any real backend/.env so only the test's environment counts
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: False)
    # delenv records each key, so undo also removes values a test's .env loaded
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    yield lambda: importlib.reload(config)
    monkeypatch.undo()
    importlib.reload(config)


def _env_example_lines():
    text = (config.BACKEND_DIR / ".env.example").read_text(encoding="utf-8")
    return text.splitlines()


def test_every_env_example_value_is_in_config():
    keys = [m.group(1) for line in _env_example_lines() if (m := re.match(r"^([A-Z_]+)=", line))]
    assert sorted(keys) == sorted(ENV_KEYS)
    for key in keys:
        assert hasattr(config, key)


def test_defaults_work_without_env_file(reload_config):
    cfg = reload_config()
    assert cfg.DB_PATH == cfg.BACKEND_DIR / "storage" / "echovault.db"
    assert cfg.PHOTO_DIR == cfg.BACKEND_DIR / "storage" / "photos"
    assert cfg.OLLAMA_URL == "http://localhost:11434"
    assert cfg.LLM_MODEL == "qwen2.5:3b"
    assert cfg.WHISPER_MODEL == "small"
    assert cfg.DEMO_MODE is False


def test_env_values_override_defaults(reload_config, monkeypatch, tmp_path):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "other.db"))
    monkeypatch.setenv("PHOTO_DIR", "elsewhere/photos")
    monkeypatch.setenv("LLM_MODEL", "gemma3:4b")
    monkeypatch.setenv("DEMO_MODE", "True")
    cfg = reload_config()
    assert cfg.DB_PATH == tmp_path / "other.db"
    assert cfg.PHOTO_DIR == cfg.BACKEND_DIR / "elsewhere" / "photos"
    assert cfg.LLM_MODEL == "gemma3:4b"
    assert cfg.DEMO_MODE is True


def test_env_file_and_paths_do_not_depend_on_working_directory(reload_config, monkeypatch, tmp_path):
    # Requirements 1.1, 2.9
    calls = []
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *args, **kwargs: calls.append(args) or False)
    backend_dir = Path(config.__file__).resolve().parent.parent

    results = []
    for cwd in (backend_dir, tmp_path):
        monkeypatch.chdir(cwd)
        cfg = reload_config()
        results.append((cfg.BACKEND_DIR, cfg.ASSETS_DIR, cfg.DB_PATH, cfg.PHOTO_DIR))

    assert [Path(args[0]) for args in calls] == [backend_dir / ".env"] * 2
    assert results[0] == results[1]
    assert results[1] == (
        backend_dir,
        backend_dir / "assets",
        backend_dir / "storage" / "echovault.db",
        backend_dir / "storage" / "photos",
    )
    assert all(path.is_absolute() for path in results[1])


def test_env_example_matches_defaults_and_every_group_has_a_comment(reload_config):
    # Requirement 1.7
    lines = _env_example_lines()
    values = {}
    for i, line in enumerate(lines):
        match = re.match(r"^([A-Z_]+)=(.*)$", line)
        if not match:
            continue
        values[match.group(1)] = match.group(2).strip()
        # walk up past the other settings of the same group to its comment
        j = i - 1
        while j >= 0 and re.match(r"^[A-Z_]+=", lines[j]):
            j -= 1
        assert j >= 0 and lines[j].startswith("#"), f"{match.group(1)} has no comment"
    assert values == DEFAULTS

    cfg = reload_config()
    assert cfg.DB_PATH == cfg.BACKEND_DIR / values["DB_PATH"]
    assert cfg.PHOTO_DIR == cfg.BACKEND_DIR / values["PHOTO_DIR"]
    assert cfg.OLLAMA_URL == values["OLLAMA_URL"]
    assert cfg.LLM_MODEL == values["LLM_MODEL"]
    assert cfg.WHISPER_MODEL == values["WHISPER_MODEL"]
    assert cfg.DEMO_MODE is False


def test_process_environment_beats_env_file(reload_config, monkeypatch, tmp_path):
    # Requirement 1.8: load a temporary .env instead of the real backend/.env
    env_file = tmp_path / ".env"
    env_file.write_text("LLM_MODEL=from-file\nWHISPER_MODEL=tiny\n", encoding="utf-8")
    monkeypatch.setattr(
        dotenv, "load_dotenv", lambda *args, **kwargs: REAL_LOAD_DOTENV(env_file, **kwargs)
    )
    monkeypatch.setenv("LLM_MODEL", "from-process")
    cfg = reload_config()
    assert cfg.LLM_MODEL == "from-process"
    assert cfg.WHISPER_MODEL == "tiny"  # the file is read for unset keys


def test_values_are_fixed_at_import(reload_config, monkeypatch):
    # Requirement 1.9
    cfg = reload_config()
    before = {key: getattr(cfg, key) for key in ENV_KEYS}
    monkeypatch.setenv("DB_PATH", "changed/other.db")
    monkeypatch.setenv("PHOTO_DIR", "changed/photos")
    monkeypatch.setenv("OLLAMA_URL", "http://example.invalid:1")
    monkeypatch.setenv("LLM_MODEL", "changed-model")
    monkeypatch.setenv("WHISPER_MODEL", "medium")
    monkeypatch.setenv("DEMO_MODE", "true")
    assert os.environ["LLM_MODEL"] == "changed-model"
    assert {key: getattr(config, key) for key in ENV_KEYS} == before
