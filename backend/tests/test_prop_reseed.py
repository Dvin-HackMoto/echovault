# Property test: running seed() again restores only missing seeded rows and keeps edits.
import json
import sqlite3

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.constants import (
    ACCESS_LEVELS,
    CATEGORIES,
    IMPORTANCE_LEVELS,
    SCHEDULE_KINDS,
    TRIVIA_KINDS,
    TRUST_STATUSES,
    VALIDITY_TYPES,
)
from app.database import seed as seed_module
from app.database.connection import SCHEMA_PATH


def fake_hash_pin(pin: str) -> str:
    # Fast stand-in for PBKDF2; real hashing is covered by test_seed.py.
    return f"fake${pin}"


# Seed_Id column per table (settings are keyed by name, the patient row is id 1).
PK = {
    "patient": "id", "caregivers": "id", "settings": "key", "people": "id", "places": "id",
    "schedule_items": "id", "medications": "id", "medication_times": "id", "memories": "id",
    "trivia_questions": "id",
}
TABLES = list(PK)


def expected_seed_rows() -> dict:
    """table -> {Seed_Id: column values seed() writes (columns the DB fills are absent)}."""
    s = seed_module
    rows = {
        "patient": {1: dict(s.PATIENT)},
        "caregivers": {
            c["id"]: {**c, "pin_hash": fake_hash_pin(s.DEMO_PINS[c["id"]])} for c in s.CAREGIVERS
        },
        "settings": {k: {"key": k, "value": json.dumps(v)} for k, v in s.SETTINGS.items()},
        "people": {r["id"]: dict(r) for r in s.PEOPLE},
        "places": {r["id"]: dict(r) for r in s.PLACES},
        "schedule_items": {r["id"]: dict(r) for r in s.SCHEDULE_ITEMS},
        "medications": {r["id"]: dict(r) for r in s.MEDICATIONS},
        "medication_times": {r["id"]: dict(r) for r in s.MEDICATION_TIMES},
        "memories": {r["id"]: dict(r) for r in s.MEMORIES},
        "trivia_questions": {
            q["id"]: {**q, "choices": json.dumps(q["choices"]) if q["choices"] else None}
            for q in s.TRIVIA_QUESTIONS
        },
    }
    return rows


SEED_ROWS = expected_seed_rows()
SEED_KEYS = [(t, k) for t in TABLES for k in SEED_ROWS[t]]

# Editable columns: None means free text, otherwise the permitted enum values.
EDITABLE = {
    "patient": {"full_name": None, "preferred_name": None, "language": None},
    "caregivers": {"name": None, "relationship": None, "access_level": ACCESS_LEVELS, "pin_hash": None},
    "settings": {"value": None},
    "people": {"name": None, "nickname": None, "notes": None, "trust": TRUST_STATUSES},
    "places": {"name": None, "description": None, "trust": TRUST_STATUSES},
    "schedule_items": {"title": None, "notes": None, "kind": SCHEDULE_KINDS},
    "medications": {"name": None, "dose": None, "instructions": None},
    "medication_times": {"time_of_day": None, "days": None},
    "memories": {
        "title": None, "content": None, "category": CATEGORIES, "importance": IMPORTANCE_LEVELS,
        "trust": TRUST_STATUSES, "validity": VALIDITY_TYPES,
    },
    "trivia_questions": {"question": None, "answer": None, "kind": TRIVIA_KINDS},
}
EDIT_SLOTS = [(t, k, col) for (t, k) in SEED_KEYS for col in EDITABLE[t]]

texts = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",), blacklist_characters="\x00"), max_size=20
)


def edit_value(slot):
    table, _key, column = slot
    allowed = EDITABLE[table][column]
    values = texts if allowed is None else st.sampled_from(allowed)
    return st.tuples(st.just(slot), values)


edits_strategy = st.lists(st.sampled_from(EDIT_SLOTS).flatmap(edit_value), max_size=15)
deletions_strategy = st.lists(st.sampled_from(SEED_KEYS), unique=True, max_size=25)


def snapshot(conn) -> dict:
    return {
        t: {row[PK[t]]: dict(row) for row in conn.execute(f"SELECT * FROM {t}")} for t in TABLES
    }


@pytest.fixture
def template(monkeypatch):
    """One fully seeded in-memory database per test; examples copy it with backup()."""
    monkeypatch.setattr(seed_module, "hash_pin", fake_hash_pin)
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    seed_module.seed(conn)
    yield conn
    conn.close()


# Feature: hub-foundation, Property 11: Reseeding restores only what is missing and keeps edits
@settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(edits=edits_strategy, deletions=deletions_strategy)
def test_reseed_restores_only_missing_and_keeps_edits(template, edits, deletions):
    """**Validates: Requirements 10.1, 10.2, 10.3, 10.6, 10.7**"""
    conn = sqlite3.connect(":memory:", isolation_level=None)
    try:
        template.backup(conn)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")

        for (table, key, column), value in edits:
            conn.execute(f"UPDATE {table} SET {column} = ? WHERE {PK[table]} = ?", (value, key))
        for table, key in deletions:
            try:
                conn.execute(f"DELETE FROM {table} WHERE {PK[table]} = ?", (key,))
            except sqlite3.IntegrityError:
                pass  # a foreign key still points at this row; skip the deletion

        before = snapshot(conn)
        missing = {t: set(SEED_ROWS[t]) - set(before[t]) for t in TABLES}

        result = seed_module.seed(conn)
        after = snapshot(conn)

        # mapping: exactly the ten tables, each count = number of missing Seed_Ids
        assert set(result) == set(TABLES)
        assert result == {t: len(missing[t]) for t in TABLES}

        both_school_missing = {"seed-mem-paolo-school-a", "seed-mem-paolo-school-b"} <= missing["memories"]
        for t in TABLES:
            # no other rows added; every seeded id exists exactly once (PK guarantees once)
            assert set(after[t]) == set(before[t]) | missing[t]
            # survivors are untouched, edits included
            for key, row in before[t].items():
                assert after[t][key] == row, (t, key)
            # restored rows carry the seed values
            for key in missing[t]:
                expected = dict(SEED_ROWS[t][key])
                if t == "memories" and key == "seed-mem-paolo-school-a" and both_school_missing:
                    expected["conflicts_with"] = "seed-mem-paolo-school-b"  # linked both ways in one run
                actual = after[t][key]
                assert {c: actual[c] for c in expected} == expected, (t, key)

        if not edits and not deletions:
            assert all(count == 0 for count in result.values())
            assert after == before
    finally:
        conn.close()
