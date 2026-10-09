"""SQLite connection helpers and idempotent migration.

Every connection enables foreign keys and uses sqlite3.Row so repositories can
return ``dict(row)``. ``migrate`` applies schema.sql (all statements use
IF NOT EXISTS, so re-running is safe).
"""

import os
import sqlite3

from app import config

_SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def connect(db_path):
    """Open a SQLite connection with Row factory and foreign keys enabled."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def migrate(conn):
    """Apply schema.sql. Idempotent — safe to run on every startup."""
    with open(_SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()


def get_db():
    """FastAPI dependency: yield a connection to config.DB_PATH, then close it."""
    parent = os.path.dirname(config.DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = connect(config.DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
