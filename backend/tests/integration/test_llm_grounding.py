"""Grounding checks against the real Ollama model (Req 15.3, 15.4).

Prompts are built from the mock fixtures at ``REFERENCE_NOW`` exactly as the
assistant would build them. Uncovered questions must produce the no-data reply;
covered questions must return the fact stored in the records.

Run with ``pytest -m integration``; skipped when Ollama or the model is missing.
"""

from __future__ import annotations

import pytest

from app.ai import llm
from app.ai.prompts import build_prompt, build_system_prompt
from tests.fixtures.records import ALL_RECORDS, ANA, REFERENCE_NOW

NO_DATA_PHRASES = ("i don't have that saved", "wala pa akong naka-save")


def _ask(question: str, language: str) -> str:
    system = build_system_prompt(language, ANA)
    prompt = build_prompt(question, ALL_RECORDS, REFERENCE_NOW)
    return llm.complete(prompt, system=system)


def _normalize(text: str) -> str:
    # Models sometimes emit a typographic apostrophe ("don’t").
    return text.replace("\u2019", "'").lower()


UNCOVERED = [
    pytest.param("What is my blood type?", "en", id="en-blood-type"),
    pytest.param("What is the name of my dog?", "en", id="en-dog-name"),
    pytest.param("What is my doctor's phone number?", "en", id="en-doctor-phone"),
    pytest.param("Anong pangalan ng aso ko?", "fil", id="fil-dog-name"),
    pytest.param("Ano ang paborito kong kanta?", "fil", id="fil-favorite-song"),
    pytest.param("Saan nakatira ang kapatid kong si Rosa?", "fil", id="fil-sister-rosa"),
]


@pytest.mark.parametrize(("question", "language"), UNCOVERED)
def test_uncovered_question_gets_no_data_reply(ollama_ready, question, language):
    answer = _ask(question, language)
    normalized = _normalize(answer)
    assert any(phrase in normalized for phrase in NO_DATA_PHRASES), (
        f"Expected a no-data reply for {question!r} ({language}), got: {answer!r}"
    )


COVERED = [
    pytest.param("What is Ana's favorite flower?", "en", "sunflower", id="en-flower"),
    pytest.param("Saan ako nagsisimba tuwing Linggo?", "fil", "malolos", id="fil-sunday-mass"),
    pytest.param("Where do I go to Sunday mass?", "en", "malolos", id="en-sunday-mass"),
]


@pytest.mark.parametrize(("question", "language", "expected"), COVERED)
def test_covered_question_returns_record_fact(ollama_ready, question, language, expected):
    answer = _ask(question, language)
    assert expected in _normalize(answer), (
        f"Expected {expected!r} in the answer to {question!r} ({language}), got: {answer!r}"
    )
