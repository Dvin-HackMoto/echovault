# Feature: hub-foundation, Property 12: A failing seed run leaves no rows
import sqlite3
from unittest.mock import patch

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.database import seed as seed_module
from app.database.connection import SCHEMA_PATH
from test_constants import schema_checks

SEEDED_TABLES = (
    "patient", "caregivers", "settings", "people", "places", "schedule_items",
    "medications", "medication_times", "memories", "trivia_questions",
)

# seed list name -> table it is inserted into
SEED_LISTS = {
    "PATIENT": "patient",
    "CAREGIVERS": "caregivers",
    "PEOPLE": "people",
    "PLACES": "places",
    "SCHEDULE_ITEMS": "schedule_items",
    "MEDICATIONS": "medications",
    "MEDICATION_TIMES": "medication_times",
    "MEMORIES": "memories",
    "TRIVIA_QUESTIONS": "trivia_questions",
}

CHECKS = schema_checks()


def fresh_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def not_null_columns() -> dict:
    """{table: set of NOT NULL columns}, read from the migrated schema. TEXT primary keys are
    left out: SQLite lets them hold NULL."""
    conn = fresh_db()
    try:
        return {
            table: {row["name"] for row in conn.execute(f"PRAGMA table_info({table})") if row["notnull"]}
            for table in SEEDED_TABLES
        }
    finally:
        conn.close()


NOT_NULL = not_null_columns()


def rows_of(list_name: str) -> list[dict]:
    value = getattr(seed_module, list_name)
    return [value] if isinstance(value, dict) else value


def constrained_columns(list_name: str, row: dict) -> list[tuple[str, str]]:
    """(column, kind) for every column of the seed row that a constraint can reject."""
    table = SEED_LISTS[list_name]
    found = []
    for column in row:
        if column in NOT_NULL[table]:
            found.append((column, "not_null"))
        if (table, column) in CHECKS:
            found.append((column, "check"))
    if table == "patient":
        found.append(("id", "patient_id"))  # CHECK (id = 1)
    return found


CASES = [
    (list_name, index, column, kind)
    for list_name in SEED_LISTS
    for index, row in enumerate(rows_of(list_name))
    for column, kind in constrained_columns(list_name, row)
]


@st.composite
def broken_rows(draw):
    list_name, index, column, kind = draw(st.sampled_from(CASES))
    if kind == "not_null":
        value = None
    elif kind == "check":
        allowed = CHECKS[(SEED_LISTS[list_name], column)]
        value = draw(st.text().filter(lambda v: v not in allowed))
    else:
        value = draw(st.integers(min_value=-10**6, max_value=10**6).filter(lambda v: v != 1))
    return list_name, index, column, value


def fake_hash(pin: str) -> str:
    return f"fast-hash-{pin}"


def counts(conn) -> dict:
    return {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in SEEDED_TABLES}


def test_cases_cover_every_seed_list():
    assert {case[0] for case in CASES} == set(SEED_LISTS)


def test_unmodified_seed_succeeds():
    # baseline: the failures below come from the broken value, not the setup
    conn = fresh_db()
    try:
        with patch.object(seed_module, "hash_pin", fake_hash):
            seed_module.seed(conn)
        assert all(count > 0 for count in counts(conn).values())
    finally:
        conn.close()


@given(case=broken_rows())
def test_failing_seed_run_leaves_no_rows(case):
    """**Validates: Requirements 10.4**"""
    list_name, index, column, value = case
    original = getattr(seed_module, list_name)
    if isinstance(original, dict):
        replacement = {**original, column: value}
    else:
        replacement = [dict(row) for row in original]
        replacement[index][column] = value

    conn = fresh_db()
    try:
        with patch.object(seed_module, "hash_pin", fake_hash), \
                patch.object(seed_module, list_name, replacement):
            with pytest.raises(sqlite3.Error):
                seed_module.seed(conn)
        assert not conn.in_transaction
        assert counts(conn) == dict.fromkeys(SEEDED_TABLES, 0)
    finally:
        conn.close()
