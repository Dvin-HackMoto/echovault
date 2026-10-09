"""Shared pytest fixtures.

Each test runs against a FRESH temp SQLite DB (a :memory: database behind a
single shared connection) that is migrated and seeded, then exposed to the app
by overriding the get_db dependency. The real storage/echovault.db is NEVER
touched.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import config
from app.database import connection, seed
from app.database.connection import get_db
from app.database.seed import CAREGIVER_ID, EDITOR_CAREGIVER_ID
from app.main import app


@pytest.fixture
def db_conn():
    """A fresh, migrated, seeded in-memory DB with foreign keys enabled."""
    # check_same_thread=False: Starlette's TestClient runs endpoints in a
    # worker thread, so the shared :memory: connection must cross threads.
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    connection.migrate(conn)
    seed.seed(conn)
    yield conn
    conn.close()


@pytest.fixture
def client(db_conn):
    """A TestClient whose get_db dependency yields the shared temp connection."""

    def _override_get_db():
        yield db_conn

    # Plain TestClient (no `with`) so the startup event — which would migrate
    # the real storage/echovault.db — does NOT fire. Tests use db_conn only.
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def patient_headers():
    return {"X-Role": "patient"}


@pytest.fixture
def caregiver_headers():
    return {"X-Role": "caregiver", "X-Caregiver-Id": CAREGIVER_ID}


@pytest.fixture
def editor_headers():
    """Headers for the seeded non-admin (editor) caregiver."""
    return {"X-Role": "caregiver", "X-Caregiver-Id": EDITOR_CAREGIVER_ID}


# ───────────── local insert helpers for Module 03/04 tests ─────────────
#
# The People/Memories tests must NOT import tests/factories.py (its top-level
# imports pull in schedule/trivia constants that are red on this base commit).
# These plain helpers insert directly into the migrated DB and return dict(row).

from uuid import uuid4  # noqa: E402

from app.database.seed import hash_pin  # noqa: E402


def make_caregiver(conn, **overrides):
    """Insert a caregiver with a real salted PIN hash; return the row as dict."""
    data = {
        "id": overrides.get("id", uuid4().hex),
        "name": overrides.get("name", "Test Caregiver"),
        "relationship": overrides.get("relationship", "nurse"),
        "access_level": overrides.get("access_level", "admin"),
        "pin_hash": overrides.get("pin_hash", hash_pin("1234")),
        "is_active": overrides.get("is_active", 1),
    }
    conn.execute(
        "INSERT INTO caregivers (id, name, relationship, access_level, pin_hash, "
        "is_active) VALUES (?, ?, ?, ?, ?, ?)",
        (
            data["id"],
            data["name"],
            data["relationship"],
            data["access_level"],
            data["pin_hash"],
            data["is_active"],
        ),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM caregivers WHERE id = ?", (data["id"],)
    ).fetchone()
    return dict(row)


def make_person(conn, **overrides):
    """Insert a person (defaults: name/relationship, trust='verified')."""
    data = {
        "id": overrides.get("id", uuid4().hex),
        "name": overrides.get("name", "Ana Santos"),
        "nickname": overrides.get("nickname"),
        "relationship": overrides.get("relationship", "daughter"),
        "photo_path": overrides.get("photo_path"),
        "notes": overrides.get("notes"),
        "is_caregiver": overrides.get("is_caregiver", 0),
        "trust": overrides.get("trust", "verified"),
        "created_by": overrides.get("created_by"),
    }
    conn.execute(
        "INSERT INTO people (id, name, nickname, relationship, photo_path, notes, "
        "is_caregiver, trust, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            data["id"],
            data["name"],
            data["nickname"],
            data["relationship"],
            data["photo_path"],
            data["notes"],
            data["is_caregiver"],
            data["trust"],
            data["created_by"],
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM people WHERE id = ?", (data["id"],)).fetchone()
    return dict(row)


def make_place(conn, **overrides):
    """Insert a place (defaults: name, trust='verified')."""
    data = {
        "id": overrides.get("id", uuid4().hex),
        "name": overrides.get("name", "Home"),
        "description": overrides.get("description"),
        "address": overrides.get("address"),
        "photo_path": overrides.get("photo_path"),
        "trust": overrides.get("trust", "verified"),
    }
    conn.execute(
        "INSERT INTO places (id, name, description, address, photo_path, trust) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            data["id"],
            data["name"],
            data["description"],
            data["address"],
            data["photo_path"],
            data["trust"],
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM places WHERE id = ?", (data["id"],)).fetchone()
    return dict(row)


def make_memory(conn, **overrides):
    """Insert a memory with sensible defaults. If trust='verified', also set a
    verified_at so the row looks genuinely verified."""
    data = {
        "id": overrides.get("id", uuid4().hex),
        "title": overrides.get("title"),
        "content": overrides.get("content", "A test memory."),
        "category": overrides.get("category", "identity"),
        "importance": overrides.get("importance", "general"),
        "trust": overrides.get("trust", "unverified"),
        "validity": overrides.get("validity", "persistent"),
        "valid_from": overrides.get("valid_from"),
        "valid_until": overrides.get("valid_until"),
        "event_date": overrides.get("event_date"),
        "person_id": overrides.get("person_id"),
        "place_id": overrides.get("place_id"),
        "photo_path": overrides.get("photo_path"),
        "source": overrides.get("source", "caregiver"),
        "conflicts_with": overrides.get("conflicts_with"),
        "verified_by": overrides.get("verified_by"),
        "verified_at": overrides.get("verified_at"),
    }
    if data["trust"] == "verified" and data["verified_at"] is None:
        data["verified_at"] = "2024-01-01 00:00:00"
    conn.execute(
        "INSERT INTO memories (id, title, content, category, importance, trust, "
        "validity, valid_from, valid_until, event_date, person_id, place_id, "
        "photo_path, source, conflicts_with, verified_by, verified_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            data["id"],
            data["title"],
            data["content"],
            data["category"],
            data["importance"],
            data["trust"],
            data["validity"],
            data["valid_from"],
            data["valid_until"],
            data["event_date"],
            data["person_id"],
            data["place_id"],
            data["photo_path"],
            data["source"],
            data["conflicts_with"],
            data["verified_by"],
            data["verified_at"],
        ),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM memories WHERE id = ?", (data["id"],)
    ).fetchone()
    return dict(row)


# ───────────── backup fixtures: real file DB on temp paths ─────────────
#
# Export/import operate on config.DB_PATH / config.PHOTO_DIR as real files on
# disk, so the shared :memory: fixtures above cannot be used. These fixtures
# point config at a temp dir (never real storage/) and open a fresh file
# connection per request — mirroring the real get_db — so the no-restart swap
# is observable in-process.


@pytest.fixture
def backup_env(monkeypatch, tmp_path):
    """Point config at a temp storage dir with a migrated+seeded file DB.

    Yields a dict with the db_path, photo_dir, and the seeded photo filenames.
    Everything lives under tmp_path; real storage/ is never touched.
    """
    storage = tmp_path / "storage"
    db_path = storage / "echovault.db"
    photo_dir = storage / "photos"
    photo_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config, "DB_PATH", str(db_path))
    monkeypatch.setattr(config, "PHOTO_DIR", str(photo_dir))

    conn = connection.connect(str(db_path))
    try:
        connection.migrate(conn)
        seed.seed(conn)
    finally:
        conn.close()

    photo_names = ["ana.jpg", "home.png"]
    for name in photo_names:
        (photo_dir / name).write_bytes(b"fake-image-bytes-" + name.encode())

    yield {
        "db_path": str(db_path),
        "photo_dir": str(photo_dir),
        "photo_names": photo_names,
    }


@pytest.fixture
def file_client(backup_env):
    """A TestClient whose get_db opens a fresh file connection per call.

    Opening per call (not a shared handle) mirrors real get_db and lets the
    import swap be observed by later requests in the SAME client — proving the
    no-restart behavior.
    """

    def _override_get_db():
        conn = connection.connect(config.DB_PATH)
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
