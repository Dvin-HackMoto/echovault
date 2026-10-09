# smoke test: backend/README.md documents setup, run, demo and test steps (Requirement 11)
import re

import pytest

from app import config
from app.database.seed import CAREGIVERS, DEMO_PINS

README = (config.BACKEND_DIR / "README.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("snippet", [
    "ollama pull qwen2.5:3b",  # 11.1
    "LLM_MODEL",  # 11.2
    "uvicorn app.main:app --host 0.0.0.0",  # 11.4
    "python -m pytest",  # 11.5
    "DEMO_MODE=true",  # 11.8
    "DEMO_MODE=false",  # 11.8
    "python -m app.database.seed --clear",
    "tests/factories.py",
])
def test_readme_contains(snippet):
    assert snippet in README


@pytest.mark.parametrize("size", ["tiny", "base", "small", "medium"])
def test_readme_lists_whisper_sizes(size):
    # 11.3: each size appears as inline code
    assert f"`{size}`" in README


def _table_rows() -> list[list[str]]:
    rows = []
    for line in README.splitlines():
        line = line.strip()
        if line.startswith("|") and line.endswith("|") and not re.fullmatch(r"[|\-\s:]+", line):
            rows.append([cell.strip() for cell in line.strip("|").split("|")])
    return rows


@pytest.mark.parametrize("caregiver", CAREGIVERS, ids=lambda c: c["id"])
def test_readme_pin_table_matches_seed(caregiver):
    # 11.9: name, access level and demo PIN for every seeded caregiver
    expected = [caregiver["name"], caregiver["access_level"], DEMO_PINS[caregiver["id"]]]
    assert expected in _table_rows()
