# Feature: hub-foundation, Property 10: require_caregiver matches the model and never writes
# **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7**
# require_caregiver is called directly with an in-memory database loaded from schema.sql.

import sqlite3

import pytest
from fastapi import HTTPException
from hypothesis import given
from hypothesis import strategies as st

from app.constants import ACCESS_LEVELS, ROLE_CAREGIVER, ROLE_PATIENT, ROLES
from app.database.connection import SCHEMA_PATH
from app.middleware.dependencies import require_caregiver

# NUL and lone surrogates are excluded: neither can appear in a real header or be stored as UTF-8 text.
safe_text = st.text(
    alphabet=st.characters(blacklist_categories=("Cs",), blacklist_characters="\x00"),
    max_size=20,
)

caregiver_row = st.fixed_dictionaries(
    {
        "id": safe_text.filter(bool),
        "name": safe_text,
        "relationship": st.none() | safe_text,
        "access_level": st.sampled_from(ACCESS_LEVELS),
        "is_active": st.sampled_from([0, 1]),
    }
)

caregiver_rows = st.lists(caregiver_row, max_size=5, unique_by=lambda r: r["id"])


@st.composite
def scenario(draw):
    rows = draw(caregiver_rows)
    role = draw(st.sampled_from(ROLES))
    ids = [r["id"] for r in rows]
    options = [st.none(), st.just(""), safe_text.filter(lambda s: s not in ids)]
    if ids:
        options.append(st.sampled_from(ids))
    header = draw(st.one_of(*options))
    return rows, role, header


def make_db(rows):
    conn = sqlite3.connect(":memory:", isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.executemany(
        "INSERT INTO caregivers (id, name, relationship, access_level, pin_hash, is_active) "
        "VALUES (:id, :name, :relationship, :access_level, 'hash', :is_active)",
        rows,
    )
    return conn


def snapshot(conn):
    return [tuple(r) for r in conn.execute("SELECT * FROM caregivers ORDER BY id").fetchall()]


def expected(rows, role, header):
    """The model: (status, None) for a rejection or (None, dict) for success."""
    if role == ROLE_PATIENT:
        return 403, None
    if not header:
        return 401, None
    match = next((r for r in rows if r["id"] == header), None)
    if match is None or match["is_active"] != 1:
        return 401, None
    return None, {k: match[k] for k in ("id", "name", "relationship", "access_level")}


# Feature: hub-foundation, Property 10: require_caregiver matches the model and never writes
@given(scenario())
def test_require_caregiver_matches_model_and_never_writes(case):
    rows, role, header = case
    conn = make_db(rows)
    try:
        before = snapshot(conn)
        status, result = expected(rows, role, header)
        if status is not None:
            with pytest.raises(HTTPException) as exc:
                require_caregiver(role=role, x_caregiver_id=header, db=conn)
            assert exc.value.status_code == status
        else:
            assert role == ROLE_CAREGIVER
            got = require_caregiver(role=role, x_caregiver_id=header, db=conn)
            assert got == result
            assert set(got) == {"id", "name", "relationship", "access_level"}
        assert snapshot(conn) == before
    finally:
        conn.close()
