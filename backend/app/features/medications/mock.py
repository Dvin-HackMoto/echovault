# TEMPORARY stand-ins for HUB-1, HUB-2 and HUB-4, used by deps.py only for names the
# real modules do not define yet. They copy the interface of the hub-foundation branch
# (autocommit connection, require_caregiver returning the caregiver row) so code and
# tests behave the same before and after the merge. Delete this file once deps.py no
# longer warns. Demo rows use "mock-" ids: the hub's demo seed owns the "seed-" ones.

import sqlite3
from pathlib import Path

from fastapi import Depends, Header, HTTPException

# ─────────────────────────────── HUB-1 constants ────────────────────────────────

ROLE_PATIENT = "patient"
ROLE_CAREGIVER = "caregiver"
ROLES = (ROLE_PATIENT, ROLE_CAREGIVER)
MED_STATUSES = ("unconfirmed", "taken", "skipped")

BACKEND_DIR = Path(__file__).resolve().parents[3]
PHOTO_DIR = BACKEND_DIR / "storage" / "photos"
MOCK_DB_PATH = BACKEND_DIR / "storage" / "medications_mock.db"
REAL_SCHEMA_PATH = BACKEND_DIR / "app" / "database" / "schema.sql"

# ─────────────────────────────── HUB-2 database ─────────────────────────────────

# The tables Medications touches, copied from ARCHITECTURE.md. Only used while
# database/schema.sql is still a placeholder.
FALLBACK_SCHEMA = """
CREATE TABLE IF NOT EXISTS caregivers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    relationship    TEXT,
    access_level    TEXT NOT NULL DEFAULT 'editor'
                    CHECK (access_level IN ('admin','editor','viewer')),
    pin_hash        TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS medications (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    dose            TEXT NOT NULL,
    instructions    TEXT,
    photo_path      TEXT,
    start_date      TEXT,
    end_date        TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_by      TEXT REFERENCES caregivers(id),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS medication_times (
    id              TEXT PRIMARY KEY,
    medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    time_of_day     TEXT NOT NULL,
    days            TEXT NOT NULL DEFAULT 'daily'
);
CREATE TABLE IF NOT EXISTS medication_logs (
    id              TEXT PRIMARY KEY,
    medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    due_at          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'unconfirmed'
                    CHECK (status IN ('unconfirmed','taken','skipped')),
    confirmed_by    TEXT NOT NULL DEFAULT 'none'
                    CHECK (confirmed_by IN ('none','patient','caregiver')),
    responded_at    TEXT,
    note            TEXT,
    UNIQUE (medication_id, due_at)
);
"""


def schema_sql():
    """The real schema.sql once HUB-2 has written it, otherwise the copy above."""
    real = REAL_SCHEMA_PATH.read_text(encoding="utf-8")
    return real if "CREATE TABLE" in real.upper() else FALLBACK_SCHEMA


def connect(path=MOCK_DB_PATH, seed=True):
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    # autocommit, like the real connection: multi-statement writes use BEGIN/COMMIT
    conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_sql())
    if seed:
        _seed(conn)
    return conn


def _seed(conn):
    """A caregiver (X-Caregiver-Id: mock-cg-ana) and three medicines. Demo only, not medical advice."""
    conn.execute(
        "INSERT OR IGNORE INTO caregivers (id, name, relationship, access_level, pin_hash) "
        "VALUES ('mock-cg-ana', 'Ana Santos-Reyes', 'daughter', 'admin', 'mock')"
    )
    meds = [
        ("mock-med-losartan", "Losartan", "1 tablet", "after dinner", "2026-01-10"),
        ("mock-med-metformin", "Metformin", "1 tablet", "after breakfast", "2026-01-10"),
        ("mock-med-vitamin-b", "Vitamin B complex", "1 capsule", "after breakfast", "2026-06-01"),
    ]
    for med_id, name, dose, instructions, start in meds:
        conn.execute(
            "INSERT OR IGNORE INTO medications (id, name, dose, instructions, start_date, created_by) "
            "VALUES (?, ?, ?, ?, ?, 'mock-cg-ana')",
            (med_id, name, dose, instructions, start),
        )
    times = [
        ("mock-medtime-losartan-pm", "mock-med-losartan", "20:00", "daily"),
        ("mock-medtime-metformin-am", "mock-med-metformin", "08:00", "daily"),
        ("mock-medtime-vitamin-b-am", "mock-med-vitamin-b", "08:00", "MO,WE,FR"),
    ]
    for row in times:
        conn.execute(
            "INSERT OR IGNORE INTO medication_times (id, medication_id, time_of_day, days) VALUES (?, ?, ?, ?)",
            row,
        )


_conn = None


def get_db():
    global _conn
    if _conn is None:
        _conn = connect()
    yield _conn


# ─────────────────────────────── HUB-4 role checks ──────────────────────────────


def get_role(x_role: str | None = Header(default=None)) -> str:
    if x_role not in ROLES:
        raise HTTPException(401, f"X-Role header must be one of: {', '.join(ROLES)}")
    return x_role


def require_caregiver(
    role: str = Depends(get_role),
    x_caregiver_id: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if role != ROLE_CAREGIVER:
        raise HTTPException(403, "Caregiver access required")
    if not x_caregiver_id:
        raise HTTPException(401, "X-Caregiver-Id header is required")
    row = db.execute(
        "SELECT id, name, relationship, access_level FROM caregivers WHERE id = ? AND is_active = 1",
        (x_caregiver_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(401, "Unknown or inactive caregiver")
    return dict(row)
