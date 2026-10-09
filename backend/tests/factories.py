# test data for feature owners: each call inserts one valid row and returns it as a dict
#
# Ids are fresh uuids (never "seed-..."), so tests never depend on the demo seed.
# Pass any column as a keyword to override the default.
import functools
import json
import sqlite3
from datetime import datetime
from uuid import uuid4

from app.constants import (
    ACCESS_EDITOR, CATEGORY_IDENTITY, IMPORTANCE_GENERAL, ROLE_CAREGIVER, ROLE_PATIENT,
    SCHEDULE_ACTIVITY, SOURCE_CAREGIVER, TRIVIA_GENERAL, TRIVIA_PERSONAL, TRIVIA_SOURCE_PRELOADED,
    TRUST_VERIFIED, VALIDITY_PERSISTENT,
)
from app.features.auth import service

PATIENT_HEADERS = {"X-Role": ROLE_PATIENT}

# PBKDF2 is slow, so each PIN is hashed once per test run; check_pin still works.
# Module-level so a test can monkeypatch it.
hash_pin = functools.lru_cache(maxsize=None)(service.hash_pin)


def caregiver_headers(caregiver: dict) -> dict:
    return {"X-Role": ROLE_CAREGIVER, "X-Caregiver-Id": caregiver["id"]}


def new_id() -> str:
    return uuid4().hex


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _insert(db: sqlite3.Connection, table: str, row: dict) -> dict:
    columns = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    db.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(row.values()))
    # re-read so DB defaults (timestamps, is_active...) are included
    return dict(db.execute(f"SELECT * FROM {table} WHERE id = ?", (row["id"],)).fetchone())


def make_caregiver(db: sqlite3.Connection, *, pin: str = "0000", **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {"id": row_id, "name": f"Caregiver {row_id[:6]}", "access_level": ACCESS_EDITOR, **overrides}
    if "pin_hash" not in row:
        row["pin_hash"] = hash_pin(pin)
    return _insert(db, "caregivers", row)


def make_person(db: sqlite3.Connection, **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {"id": row_id, "name": f"Person {row_id[:6]}", "relationship": "friend", "trust": TRUST_VERIFIED}
    return _insert(db, "people", {**row, **overrides})


def make_place(db: sqlite3.Connection, **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {"id": row_id, "name": f"Place {row_id[:6]}", "trust": TRUST_VERIFIED}
    return _insert(db, "places", {**row, **overrides})


def make_memory(db: sqlite3.Connection, **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {
        "id": row_id, "title": f"Memory {row_id[:6]}", "content": f"Test memory {row_id[:6]}.",
        "category": CATEGORY_IDENTITY, "importance": IMPORTANCE_GENERAL, "trust": TRUST_VERIFIED,
        "validity": VALIDITY_PERSISTENT, "source": SOURCE_CAREGIVER, **overrides,
    }
    # a verified memory records who verified it and when
    if row["trust"] == TRUST_VERIFIED:
        if "verified_by" not in row:
            row["verified_by"] = make_caregiver(db)["id"]
        row.setdefault("verified_at", _now())
    return _insert(db, "memories", row)


def make_schedule_item(db: sqlite3.Connection, **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {"id": row_id, "title": f"Item {row_id[:6]}", "kind": SCHEDULE_ACTIVITY, "starts_at": _now()}
    return _insert(db, "schedule_items", {**row, **overrides})


def make_medication(db: sqlite3.Connection, *, times=("08:00",), **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {"id": row_id, "name": f"Medicine {row_id[:6]}", "dose": "1 tablet", **overrides}
    medication = _insert(db, "medications", row)
    medication["times"] = [
        _insert(db, "medication_times", {"id": new_id(), "medication_id": row_id, "time_of_day": time})
        for time in times
    ]
    return medication


def make_trivia_question(db: sqlite3.Connection, **overrides) -> dict:
    row_id = overrides.pop("id", None) or new_id()
    row = {
        "id": row_id, "kind": TRIVIA_GENERAL, "question": f"Question {row_id[:6]}?", "answer": "Yes",
        "source": TRIVIA_SOURCE_PRELOADED, **overrides,
    }
    # personal questions must link to a verified memory
    if row["kind"] == TRIVIA_PERSONAL and "memory_id" not in row:
        row["memory_id"] = make_memory(db)["id"]
    if isinstance(row.get("choices"), (list, tuple)):
        row["choices"] = json.dumps(list(row["choices"]))
    return _insert(db, "trivia_questions", row)
