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
