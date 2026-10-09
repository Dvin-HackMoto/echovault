# TEMPORARY stand-ins for HUB-1, HUB-2 and HUB-4, used by deps.py only for names the
# real modules do not define yet. Delete this file once deps.py no longer warns.

import os
import sqlite3

from fastapi import Header, HTTPException

from .demo import seed_demo_schedule

# ─────────────────────────────── HUB-1 constants ────────────────────────────────

SCHEDULE_KINDS = ("appointment", "routine", "meal", "visit", "activity")
ACK_RESPONSES = ("acknowledged", "dismissed", "snoozed")
ROLES = ("patient", "caregiver")

# ─────────────────────────────── HUB-2 database ─────────────────────────────────

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MOCK_DB_PATH = os.path.join(BACKEND_DIR, "storage", "schedule_mock.db")
REAL_SCHEMA_PATH = os.path.join(BACKEND_DIR, "app", "database", "schema.sql")

# The tables Schedule touches, copied from ARCHITECTURE.md. Only used while
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
CREATE TABLE IF NOT EXISTS people (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    nickname        TEXT,
    relationship    TEXT NOT NULL,
    photo_path      TEXT,
    notes           TEXT,
    is_caregiver    INTEGER NOT NULL DEFAULT 0,
    trust           TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (trust IN ('verified','unverified','conflicting','outdated')),
    created_by      TEXT REFERENCES caregivers(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS places (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    address         TEXT,
    photo_path      TEXT,
    trust           TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (trust IN ('verified','unverified','conflicting','outdated')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS schedule_items (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    kind              TEXT NOT NULL
                      CHECK (kind IN ('appointment','routine','meal','visit','activity')),
    starts_at         TEXT NOT NULL,
    duration_min      INTEGER,
    recurrence        TEXT,
    ends_on           TEXT,
    person_id         TEXT REFERENCES people(id) ON DELETE SET NULL,
    place_id          TEXT REFERENCES places(id) ON DELETE SET NULL,
    notes             TEXT,
    remind_before_min INTEGER NOT NULL DEFAULT 30,
    is_quiet_period   INTEGER NOT NULL DEFAULT 0,
    is_active         INTEGER NOT NULL DEFAULT 1,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS schedule_acks (
    id               TEXT PRIMARY KEY,
    schedule_item_id TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
    occurrence_at    TEXT NOT NULL,
    response         TEXT NOT NULL CHECK (response IN ('acknowledged','dismissed','snoozed')),
    responded_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (schedule_item_id, occurrence_at)
);
"""


def schema_sql():
    """The real schema.sql once HUB-2 has written it, otherwise the copy above."""
    with open(REAL_SCHEMA_PATH, encoding="utf-8") as f:
        real = f.read()
    return real if "CREATE TABLE" in real.upper() else FALLBACK_SCHEMA


def connect(path=MOCK_DB_PATH, seed=True):
    if path != ":memory:":
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_sql())
    if seed:
        conn.execute(
            "INSERT OR IGNORE INTO people (id, name, nickname, relationship, is_caregiver, trust) "
            "VALUES ('person-ana', 'Ana Santos', 'Ana', 'daughter', 1, 'verified')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO places (id, name, address, trust) "
            "VALUES ('place-church', 'Malolos Church', 'Malolos, Bulacan', 'verified')"
        )
        seed_demo_schedule(conn, person_id="person-ana", place_id="place-church")
    return conn


_conn = None


def get_db():
    global _conn
    if _conn is None:
        _conn = connect()
    yield _conn


# ─────────────────────────────── HUB-4 role checks ──────────────────────────────


def get_role(x_role: str | None = Header(default=None)):
    if x_role not in ROLES:
        raise HTTPException(401, "X-Role header must be 'patient' or 'caregiver'")
    return x_role


def require_caregiver(x_role: str | None = Header(default=None)):
    # The real one also checks X-Caregiver-Id against the caregivers table.
    if get_role(x_role) != "caregiver":
        raise HTTPException(403, "Caregiver access required")
    return x_role
