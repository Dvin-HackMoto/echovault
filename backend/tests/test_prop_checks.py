# Feature: hub-foundation, Property 5: CHECK constraints reject out-of-set values
import sqlite3

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.database.connection import SCHEMA_PATH
from test_constants import CHECKS, schema_checks

# Parent rows referenced by foreign keys, inserted once per example.
PARENTS = [
    ("caregivers", {"id": "cg-parent", "name": "Ana", "pin_hash": "x"}),
    ("people", {"id": "person-parent", "name": "Ana", "relationship": "daughter"}),
    ("places", {"id": "place-parent", "name": "Home"}),
    ("memories", {"id": "mem-parent", "content": "Ana loves sunflowers.", "category": "identity"}),
    ("schedule_items", {"id": "sched-parent", "title": "Lunch", "kind": "meal", "starts_at": "2024-01-01 12:00"}),
    ("medications", {"id": "med-parent", "name": "Aspirin", "dose": "1 tablet"}),
]

# Required, non-CHECK columns of a minimal valid row for each checked table.
BASE_ROWS = {
    "caregivers": {"name": "Ben", "pin_hash": "y"},
    "people": {"name": "Ben", "relationship": "grandson", "created_by": "cg-parent"},
    "places": {"name": "Church"},
    "memories": {
        "content": "Ben plays guitar.",
        "person_id": "person-parent",
        "place_id": "place-parent",
        "conflicts_with": "mem-parent",
        "verified_by": "cg-parent",
    },
    "schedule_items": {
        "title": "Visit",
        "starts_at": "2024-01-02 10:00",
        "person_id": "person-parent",
        "place_id": "place-parent",
    },
    "schedule_acks": {"schedule_item_id": "sched-parent", "occurrence_at": "2024-01-01 12:00"},
    "medication_logs": {"medication_id": "med-parent", "due_at": "2024-01-01 08:00"},
    "trivia_questions": {"question": "Who loves sunflowers?", "answer": "Ana", "memory_id": "mem-parent"},
    "activity_log": {},
    "assistant_log": {"question": "Who is Ana?", "answer": "Your daughter."},
}

PAIRS = sorted(CHECKS)


def insert(conn, table, row):
    cols = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(row.values()))


def valid_row(table):
    row = {"id": "target", **BASE_ROWS[table]}
    for (t, column), allowed in CHECKS.items():
        if t == table:
            row[column] = allowed[0]
    return row


def fresh_db():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.execute("PRAGMA foreign_keys = ON")
    for table, row in PARENTS:
        insert(conn, table, row)
    conn.commit()
    return conn


def snapshot(conn, table):
    return conn.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall()


def test_builders_cover_every_check():
    # the mapping used below is the one the schema actually declares
    assert set(schema_checks()) == set(CHECKS)
    assert {table for table, _ in CHECKS} == set(BASE_ROWS)


@pytest.mark.parametrize("table", sorted(BASE_ROWS))
def test_valid_rows_are_accepted(table):
    conn = fresh_db()
    try:
        insert(conn, table, valid_row(table))
        assert len(snapshot(conn, table)) == 1 + sum(1 for t, _ in PARENTS if t == table)
    finally:
        conn.close()


@st.composite
def bad_cases(draw):
    table, column = draw(st.sampled_from(PAIRS))
    allowed = CHECKS[(table, column)]
    value = draw(
        st.one_of(
            st.text(),
            # near-misses of allowed values: case changes, padding, prefixes
            st.sampled_from(allowed).flatmap(
                lambda a: st.sampled_from([a.upper(), a.title(), f" {a}", f"{a} ", a[:-1], a + "x"])
            ),
        ).filter(lambda v: v not in allowed)
    )
    mode = draw(st.sampled_from(["insert", "update"]))
    return table, column, value, mode


@given(case=bad_cases())
def test_check_constraints_reject_out_of_set_values(case):
    """**Validates: Requirements 4.7**"""
    table, column, value, mode = case
    conn = fresh_db()
    try:
        if mode == "update":
            insert(conn, table, valid_row(table))
            conn.commit()
        before = snapshot(conn, table)

        with pytest.raises(sqlite3.IntegrityError):
            if mode == "insert":
                insert(conn, table, {**valid_row(table), column: value})
            else:
                conn.execute(f"UPDATE {table} SET {column} = ? WHERE id = 'target'", (value,))

        assert snapshot(conn, table) == before
    finally:
        conn.close()
