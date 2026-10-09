# sqlite3 connect, row_factory=sqlite3.Row, get_db dependency
import sqlite3
from pathlib import Path

from app import config

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None: every statement is committed as it runs, so a write is
    # visible to the other phone as soon as the request returns. Wrap multi-statement
    # changes in conn.execute("BEGIN") ... conn.execute("COMMIT") when they must be atomic.
    conn = sqlite3.connect(config.DB_PATH, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def migrate() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    finally:
        conn.close()
