"""Shared pytest fixtures.

Each test runs against a FRESH temp SQLite DB (a :memory: database behind a
single shared connection) that is migrated and seeded, then exposed to the app
by overriding the get_db dependency. The real storage/echovault.db is NEVER
touched.
"""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.database import connection, seed
from app.database.connection import get_db
from app.database.seed import CAREGIVER_ID
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
