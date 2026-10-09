"""Unit tests for app.ai.fallback (template fallback answer and no-data reply).

Requirements: 8.1-8.5, 8.7-8.9, 9.1, 9.3-9.6, 13.7.
"""

import copy

import pytest
import respx

from app.ai import fallback
from app.ai.fallback import build_fallback_answer, no_data_reply, render_sentence
from tests.fixtures.records import (
    ALL_RECORDS,
    ANA,
    DROPPED_MARKERS,
    DROPPED_RECORDS,
    MEM_MISSING_KEYS,
    MEM_VERIFIED_CHURCH,
    MEM_VERIFIED_FLOWER,
    MIGUEL,
    REFERENCE_NOW,
)

EN_NO_DATA_ANA = "I don't have that saved yet. You can ask Ana."
FIL_NO_DATA_ANA = "Wala pa akong naka-save tungkol diyan. Pwede mong tanungin si Ana."
EN_NO_DATA_GENERIC = "I don't have that saved yet. You can ask your caregiver."
FIL_NO_DATA_GENERIC = (
    "Wala pa akong naka-save tungkol diyan. Pwede mong tanungin ang iyong tagapag-alaga."
)

EXPECTED_SENTENCES = {
    "en": {
        "flower": "Ana loves sunflowers.",
        "church": "Every Sunday you go to the 9 AM mass at Malolos Church.",
        "ana": "Ana Santos (Ana) is your daughter. Visits every Saturday.",
        "miguel": "Miguel Santos (Migs) is your grandson. Studies in Manila.",
        "missing": "Your favorite snack is turon.",
    },
    "fil": {
        "flower": "Ana loves sunflowers.",
        "church": "Every Sunday you go to the 9 AM mass at Malolos Church.",
        "ana": "Si Ana Santos (Ana) ay ang iyong daughter. Visits every Saturday.",
        "miguel": "Si Miguel Santos (Migs) ay ang iyong grandson. Studies in Manila.",
        "missing": "Your favorite snack is turon.",
    },
}

LANGS = ["en", "fil"]


def fresh(value):
    """Deep copy so tests cannot mutate the shared fixture dicts."""
    return copy.deepcopy(value)


def _answer(records, language, caregiver=None):
    return build_fallback_answer(fresh(records), language, fresh(caregiver), REFERENCE_NOW)


# ── fallback answer ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("lang", LANGS)
def test_one_usable_record_gives_one_sentence(lang):
    assert _answer([MEM_VERIFIED_FLOWER], lang, ANA) == EXPECTED_SENTENCES[lang]["flower"]
    assert _answer([MIGUEL], lang, ANA) == EXPECTED_SENTENCES[lang]["miguel"]


@pytest.mark.parametrize("lang", LANGS)
def test_one_usable_among_dropped_gives_one_sentence(lang):
    records = DROPPED_RECORDS + [MEM_VERIFIED_CHURCH]
    assert _answer(records, lang, ANA) == EXPECTED_SENTENCES[lang]["church"]


@pytest.mark.parametrize("lang", LANGS)
def test_several_usable_records_keep_caller_order(lang):
    s = EXPECTED_SENTENCES[lang]
    answer = _answer(ALL_RECORDS, lang, ANA)
    assert answer == " ".join([s["flower"], s["ana"], s["church"], s["miguel"], s["missing"]])

    reversed_answer = _answer(list(reversed(ALL_RECORDS)), lang, ANA)
    assert reversed_answer == " ".join(
        [s["missing"], s["miguel"], s["church"], s["ana"], s["flower"]]
    )


@pytest.mark.parametrize("lang, expected", [("en", EN_NO_DATA_ANA), ("fil", FIL_NO_DATA_ANA)])
def test_zero_usable_records_gives_no_data_reply_naming_ana(lang, expected):
    assert _answer(DROPPED_RECORDS, lang, ANA) == expected
    assert _answer([], lang, ANA) == expected


@pytest.mark.parametrize("lang", LANGS)
def test_missing_keys_memory_renders_content(lang):
    assert _answer([MEM_MISSING_KEYS], lang, ANA) == EXPECTED_SENTENCES[lang]["missing"]


@pytest.mark.parametrize("lang", LANGS)
def test_dropped_marker_words_never_appear(lang):
    answer = _answer(ALL_RECORDS, lang, ANA)
    for marker in DROPPED_MARKERS.values():
        assert marker not in answer


@pytest.mark.parametrize("lang", ["en", "fil-en", None, "xx", 42])
def test_non_filipino_languages_use_english_templates(lang):
    s = EXPECTED_SENTENCES["en"]
    assert _answer([ANA, MIGUEL], lang, ANA) == f"{s['ana']} {s['miguel']}"


def test_memory_title_used_when_content_empty_and_period_added():
    record = {"title": "Morning walk", "content": "  ", "trust": "verified"}
    assert _answer([record], "en") == "Morning walk."


def test_memory_values_copied_verbatim_after_whitespace_cleanup():
    record = {"content": "Ikaw ay\nmay  apo\tna si Migs!", "trust": "verified"}
    assert _answer([record], "fil") == "Ikaw ay may apo na si Migs!"


@pytest.mark.parametrize("lang", LANGS)
def test_values_with_braces_render_safely(lang):
    memory = {"content": "Use the {name} {0} {relationship} code {}.", "trust": "verified"}
    person = {
        "name": "Tito {who}",
        "nickname": "{notes}",
        "relationship": "uncle {text}",
        "notes": "Brace {} note.",
        "trust": "verified",
    }
    answer = _answer([memory, person], lang)
    assert "Use the {name} {0} {relationship} code {}." in answer
    assert "Tito {who} ({notes})" in answer
    assert "uncle {text}" in answer
    assert answer.endswith("Brace {} note.")


def test_render_sentence_person_without_relationship_or_notes():
    assert render_sentence({"name": "Lito", "trust": "verified"}, "en") == "Lito."
    assert render_sentence({"name": "Lito", "trust": "verified"}, "fil") == "Si Lito."


# ── no-data reply ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "language, expected",
    [
        ("en", EN_NO_DATA_ANA),
        ("fil", FIL_NO_DATA_ANA),
        ("fil-en", EN_NO_DATA_ANA),
        ("klingon", EN_NO_DATA_ANA),
        (None, EN_NO_DATA_ANA),
    ],
)
def test_no_data_reply_language(language, expected):
    assert no_data_reply(language, fresh(ANA)) == expected


@pytest.mark.parametrize(
    "caregiver, en_expected, fil_expected",
    [
        ({"name": "Ana Santos", "nickname": "Ana"}, EN_NO_DATA_ANA, FIL_NO_DATA_ANA),
        (
            {"name": "Ana Santos"},
            "I don't have that saved yet. You can ask Ana Santos.",
            "Wala pa akong naka-save tungkol diyan. Pwede mong tanungin si Ana Santos.",
        ),
        (None, EN_NO_DATA_GENERIC, FIL_NO_DATA_GENERIC),
        ({"name": "   ", "nickname": ""}, EN_NO_DATA_GENERIC, FIL_NO_DATA_GENERIC),
    ],
    ids=["nickname", "name-only", "no-caregiver", "blank-name"],
)
def test_no_data_reply_caregiver_naming(caregiver, en_expected, fil_expected):
    assert no_data_reply("en", caregiver) == en_expected
    assert no_data_reply("fil", caregiver) == fil_expected


def test_no_data_reply_does_not_mutate_caregiver():
    caregiver = fresh(ANA)
    no_data_reply("fil", caregiver)
    assert caregiver == ANA


# ── no network ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize("lang", ["en", "fil", "fil-en"])
def test_fallback_makes_no_http_call(lang):
    with respx.mock(assert_all_mocked=True) as router:
        build_fallback_answer(fresh(ALL_RECORDS), lang, fresh(ANA), REFERENCE_NOW)
        build_fallback_answer(fresh(DROPPED_RECORDS), lang, fresh(ANA), REFERENCE_NOW)
        no_data_reply(lang, fresh(ANA))
    assert len(router.calls) == 0


def test_fallback_module_does_not_import_llm_or_http_clients():
    source = open(fallback.__file__, encoding="utf-8").read()
    for forbidden in ("import httpx", "from .llm", "from . import llm", "requests"):
        assert forbidden not in source
