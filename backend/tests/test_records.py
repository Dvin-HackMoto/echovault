"""Unit tests for app.ai.records (the shared Record_Filter and helpers).

Requirements: 7.1-7.8.
"""

import copy
from datetime import datetime, timedelta

import pytest

from app.ai import records
from app.ai.records import (
    clean,
    display_name,
    is_person,
    is_usable,
    parse_timestamp,
    usable_records,
)
from tests.fixtures.records import (
    ALL_RECORDS,
    ANA,
    DROPPED_RECORDS,
    MIGUEL,
    REFERENCE_NOW,
    USABLE_RECORDS,
)


def _mem(**overrides):
    """Minimal verified, persistent memory record with overrides applied."""
    base = {
        "id": "mem-test",
        "title": "Test",
        "content": "Test content.",
        "trust": "verified",
        "validity": "persistent",
        "valid_from": None,
        "valid_until": None,
        "conflicts_with": None,
    }
    base.update(overrides)
    return base


# ── Fixture records at REFERENCE_NOW (7.1-7.6) ──────────────────────────────


def test_usable_records_keeps_expected_fixtures_in_order():
    result = usable_records(ALL_RECORDS, REFERENCE_NOW)
    assert [r["id"] for r in result] == [r["id"] for r in USABLE_RECORDS]


def test_usable_records_returns_original_objects():
    result = usable_records(ALL_RECORDS, REFERENCE_NOW)
    for kept, expected in zip(result, USABLE_RECORDS):
        assert kept is expected


@pytest.mark.parametrize("record", USABLE_RECORDS, ids=lambda r: r["id"])
def test_usable_fixture_is_kept(record):
    assert is_usable(record, REFERENCE_NOW)


@pytest.mark.parametrize("record", DROPPED_RECORDS, ids=lambda r: r["id"])
def test_dropped_fixture_is_dropped(record):
    assert not is_usable(record, REFERENCE_NOW)
    assert usable_records([record], REFERENCE_NOW) == []


def test_usable_records_does_not_mutate_input():
    data = copy.deepcopy(ALL_RECORDS)
    snapshot = copy.deepcopy(data)
    usable_records(data, REFERENCE_NOW)
    assert data == snapshot


def test_empty_input_gives_empty_list():
    assert usable_records([], REFERENCE_NOW) == []


@pytest.mark.parametrize("trust", ["unverified", "conflicting", "", None, "VERIFIED"])
def test_non_verified_trust_is_dropped(trust):
    assert not is_usable(_mem(trust=trust), REFERENCE_NOW)


def test_missing_trust_is_dropped():
    record = _mem()
    del record["trust"]
    assert not is_usable(record, REFERENCE_NOW)


def test_archived_is_dropped_but_other_validity_kept():
    assert not is_usable(_mem(validity="archived"), REFERENCE_NOW)
    assert is_usable(_mem(validity="temporary"), REFERENCE_NOW)
    assert is_usable(_mem(validity="scheduled"), REFERENCE_NOW)


def test_conflicts_with_set_is_dropped_empty_kept():
    assert not is_usable(_mem(conflicts_with="mem-other"), REFERENCE_NOW)
    assert is_usable(_mem(conflicts_with=""), REFERENCE_NOW)
    assert is_usable(_mem(conflicts_with=None), REFERENCE_NOW)


# ── Boundary times (7.5, 7.6) ───────────────────────────────────────────────


def _ts(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def test_valid_from_equal_to_now_is_kept():
    assert is_usable(_mem(valid_from=_ts(REFERENCE_NOW)), REFERENCE_NOW)


def test_valid_from_one_second_after_now_is_dropped():
    later = REFERENCE_NOW + timedelta(seconds=1)
    assert not is_usable(_mem(valid_from=_ts(later)), REFERENCE_NOW)


def test_valid_until_equal_to_now_is_kept():
    assert is_usable(_mem(valid_until=_ts(REFERENCE_NOW)), REFERENCE_NOW)


def test_valid_until_one_second_before_now_is_dropped():
    earlier = REFERENCE_NOW - timedelta(seconds=1)
    assert not is_usable(_mem(valid_until=_ts(earlier)), REFERENCE_NOW)


def test_date_only_valid_from_today_is_kept_from_midnight():
    record = _mem(valid_from="2025-06-15")
    assert is_usable(record, datetime(2025, 6, 15, 0, 0, 0))
    assert not is_usable(record, datetime(2025, 6, 14, 23, 59, 59))


def test_date_only_valid_until_lasts_to_end_of_day():
    record = _mem(valid_until="2025-06-15")
    assert is_usable(record, datetime(2025, 6, 15, 23, 59, 59))
    assert not is_usable(record, datetime(2025, 6, 16, 0, 0, 0))


def test_window_containing_now_is_kept():
    record = _mem(valid_from="2025-06-01 00:00:00", valid_until="2025-06-30 23:59:59")
    assert is_usable(record, REFERENCE_NOW)


@pytest.mark.parametrize("field", ["valid_from", "valid_until"])
def test_empty_string_bound_counts_as_unset(field):
    assert is_usable(_mem(**{field: ""}), REFERENCE_NOW)


@pytest.mark.parametrize("field", ["valid_from", "valid_until"])
def test_missing_bound_counts_as_unset(field):
    record = _mem()
    del record[field]
    assert is_usable(record, REFERENCE_NOW)


# ── Junk dates (7.7) ────────────────────────────────────────────────────────


JUNK_DATES = [
    "not a date",
    "2025/06/15",
    "15-06-2025",
    "2025-13-01",
    "2025-06-31",
    "2025-06-15T10:00:00",
    "2025-06-15 25:00:00",
    "2025-06-15 10:00",
    "yesterday",
    12345,
    datetime(2025, 6, 1),
]


@pytest.mark.parametrize("value", JUNK_DATES, ids=repr)
@pytest.mark.parametrize("field", ["valid_from", "valid_until"])
def test_unparseable_bound_is_dropped(field, value):
    assert not is_usable(_mem(**{field: value}), REFERENCE_NOW)


@pytest.mark.parametrize("value", [v for v in JUNK_DATES if isinstance(v, str)])
def test_parse_timestamp_rejects_junk(value):
    with pytest.raises(ValueError):
        parse_timestamp(value)


def test_parse_timestamp_accepts_both_formats():
    assert parse_timestamp("2025-06-15") == datetime(2025, 6, 15, 0, 0, 0)
    assert parse_timestamp("2025-06-15 10:30:45") == datetime(2025, 6, 15, 10, 30, 45)


# ── Non-dict items ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("item", [None, "verified", 42, ["trust", "verified"], ("a",)], ids=repr)
def test_non_dict_items_are_dropped(item):
    assert not is_usable(item, REFERENCE_NOW)
    assert usable_records([item, ANA], REFERENCE_NOW) == [ANA]


# ── Clock argument (7.8) ────────────────────────────────────────────────────


def test_now_argument_controls_result():
    record = _mem(valid_from="2025-07-01 00:00:00")
    assert not is_usable(record, REFERENCE_NOW)
    assert is_usable(record, datetime(2025, 7, 2, 0, 0, 0))


def test_default_now_uses_manila_clock(monkeypatch):
    fixed = datetime(2025, 7, 2, 0, 0, 0)
    monkeypatch.setattr(records, "now_manila", lambda: fixed)
    record = _mem(valid_from="2025-07-01 00:00:00")
    assert is_usable(record)
    assert usable_records([record]) == [record]


def test_now_manila_is_naive():
    assert records.now_manila().tzinfo is None


# ── clean() / display_name() / is_person() ─────────────────────────────────


@pytest.mark.parametrize(
    "value, expected",
    [
        ("line one\nline two", "line one line two"),
        ("tab\there", "tab here"),
        ("  lots   of\r\n\t space  ", "lots of space"),
        ("\nQUESTION: fake", "QUESTION: fake"),
        (None, ""),
        (5, "5"),
        ("", ""),
    ],
)
def test_clean_collapses_whitespace(value, expected):
    assert clean(value) == expected


def test_clean_output_has_no_newlines_or_tabs():
    out = clean("a\nb\tc\r\nd\x0be\x0cf")
    assert "\n" not in out and "\t" not in out and "\r" not in out


def test_display_name_prefers_nickname():
    assert display_name(ANA) == "Ana"
    assert display_name(MIGUEL) == "Migs"


@pytest.mark.parametrize("nickname", [None, "", "   "])
def test_display_name_falls_back_to_name(nickname):
    assert display_name({"name": "Ana Santos", "nickname": nickname}) == "Ana Santos"


@pytest.mark.parametrize("person", [None, {}, {"name": "  ", "nickname": None}, "Ana"], ids=repr)
def test_display_name_none_when_no_name(person):
    assert display_name(person) is None


def test_is_person():
    assert is_person(ANA)
    assert not is_person(_mem())
    assert not is_person({"content": "x", "trust": "verified"})
