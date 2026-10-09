# Property test: the memories_fts triggers keep the keyword index in step with memories.

import sqlite3

from hypothesis import given, strategies as st

from app.constants import CATEGORY_IDENTITY
from app.database.connection import SCHEMA_PATH

WORD = st.text(alphabet="abcdefghijklmnopqrstuvwxyz", min_size=1, max_size=6)


def fresh_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def text_from(vocab):
    # a list of vocabulary words joined by spaces (possibly empty)
    return st.lists(st.sampled_from(vocab), max_size=4).map(" ".join)


def fts_ids(conn, word) -> set:
    rows = conn.execute(
        "SELECT m.id FROM memories_fts JOIN memories m ON m.rowid = memories_fts.rowid "
        "WHERE memories_fts MATCH ?",
        (f'"{word}"',),
    ).fetchall()
    return {row["id"] for row in rows}


def model_ids(model, word) -> set:
    return {
        mid for mid, (title, content) in model.items()
        if word in (title or "").split() or word in content.split()
    }


# Feature: hub-foundation, Property 4: FTS index tracks memories (model-based)
@given(data=st.data(), vocab=st.lists(WORD, min_size=1, max_size=6, unique=True))
def test_fts_index_tracks_memories(data, vocab):
    """**Validates: Requirements 4.4, 4.5, 4.6**"""
    conn = fresh_db()
    model: dict[str, tuple] = {}
    next_id = 0
    try:
        for _ in range(data.draw(st.integers(min_value=1, max_value=12), label="steps")):
            ops = ["insert"] + (["update", "delete"] if model else [])
            op = data.draw(st.sampled_from(ops), label="op")

            if op == "insert":
                mid = f"m{next_id}"
                next_id += 1
                title = data.draw(st.none() | text_from(vocab), label="title")
                content = data.draw(text_from(vocab), label="content")
                conn.execute(
                    "INSERT INTO memories (id, title, content, category) VALUES (?, ?, ?, ?)",
                    (mid, title, content, CATEGORY_IDENTITY),
                )
                model[mid] = (title, content)

            elif op == "update":
                mid = data.draw(st.sampled_from(sorted(model)), label="update id")
                title, content = model[mid]
                field = data.draw(st.sampled_from(["title", "content", "both"]), label="field")
                if field in ("title", "both"):
                    title = data.draw(st.none() | text_from(vocab), label="new title")
                if field in ("content", "both"):
                    content = data.draw(text_from(vocab), label="new content")
                conn.execute("UPDATE memories SET title = ?, content = ? WHERE id = ?", (title, content, mid))
                model[mid] = (title, content)

            else:
                mid = data.draw(st.sampled_from(sorted(model)), label="delete id")
                conn.execute("DELETE FROM memories WHERE id = ?", (mid,))
                del model[mid]

            for word in vocab:
                assert fts_ids(conn, word) == model_ids(model, word), (op, word)
    finally:
        conn.close()
