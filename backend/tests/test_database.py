# HUB-2: connection, schema and migrate()
import re
import sqlite3

import pytest

from app import config
from app.database.connection import SCHEMA_PATH, connect, get_db, migrate

TABLES = {
    "patient", "caregivers", "settings", "people", "places", "memories", "schedule_items",
    "schedule_acks", "medications", "medication_times", "medication_logs", "trivia_questions",
    "activity_log", "assistant_log",
}
MEMORY = "INSERT INTO memories (id, title, content, category) VALUES (?, ?, ?, 'preference')"


def names(conn, kind):
    return {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = ?", (kind,))}


def search(conn, text):
    rows = conn.execute(
        "SELECT m.id FROM memories_fts f JOIN memories m ON m.rowid = f.rowid WHERE memories_fts MATCH ?", (text,)
    )
    return [row["id"] for row in rows]


def test_schema_file_matches_architecture_doc():
    doc = (config.BACKEND_DIR.parent / "docs" / "ARCHITECTURE.md").read_text(encoding="utf-8")
    block = re.search(r"```sql\n(PRAGMA foreign_keys.*?)```", doc, flags=re.DOTALL).group(1)
    assert SCHEMA_PATH.read_text(encoding="utf-8") == block


def test_migrate_creates_everything_on_an_empty_database(storage, db):
    assert config.DB_PATH.is_file() and config.DB_PATH.parent == storage
    assert TABLES <= names(db, "table")
    assert "memories_fts" in names(db, "table")
    assert {"idx_mem_lookup", "idx_mem_person", "idx_activity_time"} <= names(db, "index")
    assert names(db, "trigger") == {"mem_ai", "mem_ad", "mem_au"}


def test_migrate_twice_keeps_data(db):
    db.execute(MEMORY, ("m1", "Ana's favorite flower", "Ana loves sunflowers."))
    migrate()
    migrate()
    assert db.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 1
    assert search(db, "sunflowers") == ["m1"]


def test_memory_is_searchable_and_follows_edits(db):
    db.execute(MEMORY, ("m1", "Ana's favorite flower", "Ana loves sunflowers."))
    assert search(db, "sunflowers") == ["m1"]
    assert search(db, "flower") == ["m1"]

    db.execute("UPDATE memories SET content = 'Ana loves orchids.' WHERE id = 'm1'")
    assert search(db, "orchids") == ["m1"]
    assert search(db, "sunflowers") == []

    db.execute("DELETE FROM memories WHERE id = 'm1'")
    assert search(db, "orchids") == []


def test_foreign_keys_are_enforced(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO medication_times (id, medication_id, time_of_day) VALUES ('t1', 'missing', '08:00')")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO memories (id, content, category, person_id) VALUES ('m1', 'x', 'identity', 'missing')")


def test_check_constraints_reject_unknown_values(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO memories (id, content, category) VALUES ('m1', 'x', 'not_a_category')")
    db.execute("INSERT INTO patient (id, full_name) VALUES (1, 'A')")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO patient (id, full_name) VALUES (2, 'B')")


def test_deleting_a_person_keeps_their_memories(db):
    db.execute("INSERT INTO people (id, name, relationship) VALUES ('p1', 'Ana', 'daughter')")
    db.execute("INSERT INTO memories (id, content, category, person_id) VALUES ('m1', 'x', 'identity', 'p1')")
    db.execute("DELETE FROM people WHERE id = 'p1'")
    assert db.execute("SELECT person_id FROM memories WHERE id = 'm1'").fetchone()["person_id"] is None


def test_every_connection_has_rows_and_foreign_keys(db):
    dependency = get_db()  # keep a reference: the connection closes when the generator ends
    for conn in (connect(), next(dependency)):
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert isinstance(conn.execute("SELECT 1 AS one").fetchone(), sqlite3.Row)
        conn.close()


def test_writes_are_visible_to_other_connections_immediately(db):
    db.execute("INSERT INTO people (id, name, relationship) VALUES ('p1', 'Ana', 'daughter')")
    other = connect()
    assert other.execute("SELECT COUNT(*) FROM people").fetchone()[0] == 1
    other.close()


def test_get_db_closes_the_connection():
    migrate()
    dependency = get_db()
    conn = next(dependency)
    with pytest.raises(StopIteration):
        next(dependency)
    with pytest.raises(sqlite3.ProgrammingError):
        conn.execute("SELECT 1")


def row_counts(conn):
    return {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in sorted(TABLES)}


def test_connect_creates_nested_parent_folders(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "a" / "b" / "c" / "echovault.db")
    conn = connect()
    conn.close()
    assert config.DB_PATH.is_file()


def test_connect_leaves_existing_files_in_the_folder_unchanged(storage):
    storage.mkdir(parents=True)
    sibling = storage / "notes.txt"
    sibling.write_bytes(b"keep me")
    conn = connect()
    conn.close()
    assert sibling.read_bytes() == b"keep me"
    assert {path.name for path in storage.iterdir()} == {"notes.txt", "echovault.db"}


def test_get_db_closes_the_connection_when_the_consumer_raises():
    migrate()
    dependency = get_db()
    conn = next(dependency)
    with pytest.raises(RuntimeError, match="handler failed"):
        dependency.throw(RuntimeError("handler failed"))
    with pytest.raises(sqlite3.ProgrammingError):
        conn.execute("SELECT 1")


def test_foreign_key_violation_on_update_leaves_the_row_unchanged(db):
    db.execute("INSERT INTO memories (id, content, category) VALUES ('m1', 'x', 'identity')")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE memories SET person_id = 'missing' WHERE id = 'm1'")
    assert db.execute("SELECT person_id FROM memories WHERE id = 'm1'").fetchone()["person_id"] is None


def test_connection_works_from_a_worker_thread(db):
    from concurrent.futures import ThreadPoolExecutor

    conn = connect()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(conn.execute, "INSERT INTO people (id, name, relationship) VALUES ('p1', 'Ana', 'daughter')").result()
            count = pool.submit(lambda: conn.execute("SELECT COUNT(*) FROM people").fetchone()[0]).result()
    finally:
        conn.close()
    assert count == 1


def test_connect_raises_oserror_when_the_parent_is_a_file(tmp_path, monkeypatch):
    blocker = tmp_path / "blocker"
    blocker.write_text("not a folder")
    monkeypatch.setattr(config, "DB_PATH", blocker / "echovault.db")
    with pytest.raises(OSError):
        connect()
    assert blocker.read_text() == "not a folder"


def test_every_create_statement_uses_if_not_exists():
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    creates = re.findall(r"\bCREATE\s+(?:VIRTUAL\s+)?(?:TABLE|INDEX|UNIQUE\s+INDEX|TRIGGER)\b[^\n]*", sql, flags=re.IGNORECASE)
    assert creates
    assert len(creates) == len(re.findall(r"\bCREATE\b", sql, flags=re.IGNORECASE))
    for statement in creates:
        assert re.search(r"\bIF\s+NOT\s+EXISTS\b", statement, flags=re.IGNORECASE), statement


def test_migrate_raises_when_the_schema_file_is_missing(db, tmp_path, monkeypatch):
    db.execute(MEMORY, ("m1", "Ana's favorite flower", "Ana loves sunflowers."))
    before = row_counts(db)
    monkeypatch.setattr("app.database.connection.SCHEMA_PATH", tmp_path / "missing.sql")
    with pytest.raises(OSError):
        migrate()
    assert row_counts(db) == before


def test_migrate_raises_on_a_bad_statement_and_keeps_rows(db, tmp_path, monkeypatch):
    db.execute(MEMORY, ("m1", "Ana's favorite flower", "Ana loves sunflowers."))
    before = row_counts(db)
    broken = tmp_path / "broken.sql"
    broken.write_text(SCHEMA_PATH.read_text(encoding="utf-8") + "\nINSERT INTO no_such_table VALUES (1);\n", encoding="utf-8")
    monkeypatch.setattr("app.database.connection.SCHEMA_PATH", broken)
    with pytest.raises(sqlite3.OperationalError):
        migrate()
    assert row_counts(db) == before
    assert search(db, "sunflowers") == ["m1"]
