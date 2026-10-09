"""Sanity checks for the seed-style mock fixtures (Requirement 14).

Column names are parsed from ``app/database/schema.sql``. While that file is
still a stub without the table, the schema block in ``docs/ARCHITECTURE.md``
is used instead.
"""

import re
from datetime import datetime
from pathlib import Path

import pytest

from tests.fixtures.records import (
    ALL_RECORDS,
    ANA,
    CARLO_UNVERIFIED,
    MEM_ARCHIVED,
    MEM_CONFLICT_A,
    MEM_CONFLICT_B,
    MEM_EXPIRED,
    MEM_MISSING_KEYS,
    MEM_NOT_YET,
    MEM_UNVERIFIED,
    MEM_VERIFIED_CHURCH,
    MEM_VERIFIED_FLOWER,
    MIGUEL,
    PATIENT,
    REFERENCE_NOW,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCHEMA_SQL = BACKEND_DIR / "app" / "database" / "schema.sql"
ARCHITECTURE_MD = BACKEND_DIR.parent / "docs" / "ARCHITECTURE.md"

PEOPLE = [ANA, MIGUEL, CARLO_UNVERIFIED]
MEMORIES = [
    MEM_VERIFIED_FLOWER,
    MEM_VERIFIED_CHURCH,
    MEM_UNVERIFIED,
    MEM_CONFLICT_A,
    MEM_CONFLICT_B,
    MEM_ARCHIVED,
    MEM_EXPIRED,
    MEM_NOT_YET,
    MEM_MISSING_KEYS,
]

# Leading words of table-constraint lines, which are not columns.
_CONSTRAINT_WORDS = {"CHECK", "PRIMARY", "FOREIGN", "UNIQUE", "CONSTRAINT"}


def _table_block(text: str, table: str) -> str | None:
    match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table}\s*\((.*?)\n\);",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return match.group(1) if match else None


def _columns(table: str) -> set[str]:
    """Column names of ``table`` from schema.sql, else ARCHITECTURE.md."""
    block = None
    for source in (SCHEMA_SQL, ARCHITECTURE_MD):
        if source.is_file():
            block = _table_block(source.read_text(encoding="utf-8"), table)
            if block is not None:
                break
    assert block is not None, f"table {table!r} not found in schema.sql or ARCHITECTURE.md"

    columns = set()
    for line in block.splitlines():
        line = line.split("--", 1)[0].strip()
        word = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s", line + " ")
        if word and word.group(1).upper() not in _CONSTRAINT_WORDS:
            columns.add(word.group(1))
    return columns


def _parse(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")


# ── Req 14.4: only real column names ────────────────────────────────────────


def test_schema_parser_finds_known_columns():
    assert {"id", "title", "content", "trust", "valid_until"} <= _columns("memories")
    assert {"id", "name", "nickname", "is_caregiver", "trust"} <= _columns("people")
    assert "CHECK" not in _columns("memories")


@pytest.mark.parametrize("person", PEOPLE, ids=lambda p: p["id"])
def test_people_fixtures_use_people_columns(person):
    assert set(person) <= _columns("people"), set(person) - _columns("people")


@pytest.mark.parametrize("memory", MEMORIES, ids=lambda m: m["id"])
def test_memory_fixtures_use_memories_columns(memory):
    assert set(memory) <= _columns("memories"), set(memory) - _columns("memories")


def test_patient_fixture_uses_patient_columns():
    assert set(PATIENT) <= _columns("patient")


def test_all_records_covers_every_person_and_memory():
    assert sorted(r["id"] for r in ALL_RECORDS) == sorted(r["id"] for r in PEOPLE + MEMORIES)


# ── Req 14.1–14.3: required fixture kinds ───────────────────────────────────


def test_patient_and_caregiver():
    assert PATIENT["preferred_name"] == "Lola Nena"
    assert ANA["relationship"] == "daughter"
    assert ANA["is_caregiver"] == 1
    assert ANA["trust"] == "verified"


def test_verified_memory_present():
    assert any(m["trust"] == "verified" and m.get("validity") == "persistent" for m in MEMORIES)


def test_unverified_memory_present():
    assert MEM_UNVERIFIED["trust"] == "unverified"


def test_conflicting_pair_present():
    assert MEM_CONFLICT_A["trust"] == MEM_CONFLICT_B["trust"] == "conflicting"
    assert MEM_CONFLICT_A["conflicts_with"] == MEM_CONFLICT_B["id"]
    assert MEM_CONFLICT_B["conflicts_with"] == MEM_CONFLICT_A["id"]


def test_archived_memory_present():
    assert MEM_ARCHIVED["validity"] == "archived"


def test_expired_memory_present():
    assert _parse(MEM_EXPIRED["valid_until"]) < REFERENCE_NOW


def test_not_yet_valid_memory_present():
    assert _parse(MEM_NOT_YET["valid_from"]) > REFERENCE_NOW


def test_verified_person_present():
    assert any(p["trust"] == "verified" for p in PEOPLE)


def test_record_with_missing_optional_keys_present():
    optional = {"title", "category", "importance", "validity", "valid_from", "valid_until"}
    assert optional.isdisjoint(MEM_MISSING_KEYS)
    assert MEM_MISSING_KEYS["content"]
