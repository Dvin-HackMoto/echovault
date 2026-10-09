# Property test: running migrate() again never changes stored data or the FTS index.
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from hypothesis import given
from hypothesis import strategies as st

from app import config
from app.constants import (
    CATEGORIES,
    IMPORTANCE_LEVELS,
    MEMORY_SOURCES,
    SETTING_KEYS,
    TRUST_STATUSES,
    VALIDITY_TYPES,
)
from app.database.connection import connect, migrate

# Lowercase ASCII words, quoted in MATCH so FTS5 keywords (and, or, not, near) are literal.
words = st.text(alphabet="abcdefghijklmnopqrstuvwxyz", min_size=1, max_size=8)
phrases = st.lists(words, min_size=1, max_size=5).map(" ".join)

people_rows = st.lists(
    st.fixed_dictionaries(
        {
            "name": phrases,
            "nickname": st.none() | words,
            "relationship": words,
            "notes": st.none() | phrases,
            "is_caregiver": st.integers(0, 1),
            "trust": st.sampled_from(TRUST_STATUSES),
        }
    ),
    max_size=5,
)

memory_rows = st.lists(
    st.fixed_dictionaries(
        {
            "title": st.none() | phrases,
            "content": phrases,
            "category": st.sampled_from(CATEGORIES),
            "importance": st.sampled_from(IMPORTANCE_LEVELS),
            "trust": st.sampled_from(TRUST_STATUSES),
            "validity": st.sampled_from(VALIDITY_TYPES),
            "source": st.sampled_from(MEMORY_SOURCES),
            "person": st.none() | st.integers(0, 4),
        }
    ),
    max_size=8,
)

settings_rows = st.dictionaries(
    st.sampled_from(SETTING_KEYS),
    st.one_of(st.integers(-1000, 1000), phrases, st.lists(words, max_size=4)),
)


def snapshot(conn):
    # Every ordinary table (FTS virtual and shadow tables are covered by the MATCH check).
    tables = [
        r["name"]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memories_fts%' ORDER BY name"
        )
    ]
    return {
        t: sorted(tuple(row) for row in conn.execute(f'SELECT rowid, * FROM "{t}"'))
        for t in tables
    }


def match_rowids(conn, terms):
    return {
        term: sorted(
            r[0]
            for r in conn.execute(
                "SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?", (f'"{term}"',)
            )
        )
        for term in terms
    }


# Feature: hub-foundation, Property 3: migrate() is idempotent on data
@given(
    people=people_rows,
    memories=memory_rows,
    settings_map=settings_rows,
    extra_runs=st.integers(1, 3),
)
def test_migrate_is_idempotent_on_data(people, memories, settings_map, extra_runs):
    """**Validates: Requirements 4.3**"""
    with tempfile.TemporaryDirectory() as tmp:
        storage = Path(tmp) / "storage"
        with patch.object(config, "DB_PATH", storage / "echovault.db"), patch.object(
            config, "PHOTO_DIR", storage / "photos"
        ):
            migrate()
            conn = connect()
            try:
                person_ids = []
                for i, p in enumerate(people):
                    pid = f"person-{i}"
                    conn.execute(
                        "INSERT INTO people (id, name, nickname, relationship, notes, is_caregiver, trust) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (pid, p["name"], p["nickname"], p["relationship"], p["notes"],
                         p["is_caregiver"], p["trust"]),
                    )
                    person_ids.append(pid)
                for i, m in enumerate(memories):
                    person_id = (
                        person_ids[m["person"] % len(person_ids)]
                        if m["person"] is not None and person_ids
                        else None
                    )
                    conn.execute(
                        "INSERT INTO memories (id, title, content, category, importance, trust, "
                        "validity, source, person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (f"mem-{i}", m["title"], m["content"], m["category"], m["importance"],
                         m["trust"], m["validity"], m["source"], person_id),
                    )
                for key, value in settings_map.items():
                    conn.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value))
                    )

                terms = set()
                for m in memories:
                    terms.update((m["title"] or "").split())
                    terms.update(m["content"].split())
                for p in people:
                    terms.update(p["name"].split())

                before_rows = snapshot(conn)
                before_match = match_rowids(conn, terms)
            finally:
                conn.close()

            for _ in range(extra_runs):
                migrate()

            conn = connect()
            try:
                assert snapshot(conn) == before_rows
                assert match_rowids(conn, terms) == before_match
            finally:
                conn.close()
