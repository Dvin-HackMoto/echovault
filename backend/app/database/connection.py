# sqlite3 connect, row_factory=sqlite3.Row, get_db dependency
import sqlite3
from pathlib import Path

from app import config

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def connect(db_path: Path | str | None = None) -> sqlite3.Connection:
    """Open the hub database, or `db_path` when given (backup restore checks a file before swapping it in)."""
    db_path = Path(db_path or config.DB_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None: every statement is committed as it runs, so a write is
    # visible to the other phone as soon as the request returns. Wrap multi-statement
    # changes in conn.execute("BEGIN") ... conn.execute("COMMIT") when they must be atomic.
    conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def migrate(conn: sqlite3.Connection | None = None) -> None:
    """Apply schema.sql to the hub database, or to `conn` when given."""
    own_connection = conn is None
    conn = conn or connect()
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    finally:
        if own_connection:
            conn.close()
