# trivia_questions queries, and the trivia_prompt rows of activity_log

import uuid
from contextlib import contextmanager

COLUMNS = ("kind", "topic", "question", "answer", "choices", "memory_id", "difficulty", "is_active")
ACTIVITY = "trivia_prompt"

# A question about the patient's own life may only be shown while its memory is verified
# and currently valid (the same rule as the assistant's retrieval query). A date-only
# valid_until lasts through that day.
MEMORY_USABLE = """
    m.trust = 'verified' AND m.validity != 'archived'
    AND (m.valid_from IS NULL OR m.valid_from <= :now)
    AND (m.valid_until IS NULL
         OR (CASE WHEN length(m.valid_until) = 10 THEN m.valid_until || ' 23:59:59' ELSE m.valid_until END) >= :now)
"""


# Every write commits before returning: the hub's connection may or may not be in
# autocommit mode, and commit() is a no-op when there is nothing to commit.
@contextmanager
def transaction(conn):
    conn.commit()  # close any implicit transaction so BEGIN can start a new one
    conn.execute("BEGIN")
    try:
        yield
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ─────────────────────────────────── questions ──────────────────────────────────


def list_questions(conn, source=None, kind=None, active_only=False):
    where, args = [], []
    if source:
        where.append("source = ?")
        args.append(source)
    if kind:
        where.append("kind = ?")
        args.append(kind)
    if active_only:
        where.append("is_active = 1")
    sql = "SELECT * FROM trivia_questions" + (" WHERE " + " AND ".join(where) if where else "")
    return [dict(r) for r in conn.execute(sql + " ORDER BY source, topic, question", args).fetchall()]


def get_question(conn, question_id):
    row = conn.execute("SELECT * FROM trivia_questions WHERE id = ?", (question_id,)).fetchone()
    return dict(row) if row else None


def create_question(conn, question, source):
    question_id = str(uuid.uuid4())
    conn.execute(
        f"INSERT INTO trivia_questions (id, {', '.join(COLUMNS)}, source) "
        f"VALUES (?, {', '.join('?' for _ in COLUMNS)}, ?)",
        (question_id, *(question[c] for c in COLUMNS), source),
    )
    conn.commit()
    return question_id


def update_question(conn, question_id, question):
    conn.execute(
        f"UPDATE trivia_questions SET {', '.join(f'{c} = ?' for c in COLUMNS)} WHERE id = ?",
        (*(question[c] for c in COLUMNS), question_id),
    )
    conn.commit()


def set_active(conn, question_id, is_active):
    conn.execute("UPDATE trivia_questions SET is_active = ? WHERE id = ?", (is_active, question_id))
    conn.commit()


def delete_question(conn, question_id):
    deleted = conn.execute("DELETE FROM trivia_questions WHERE id = ?", (question_id,)).rowcount > 0
    conn.commit()
    return deleted


def memory_is_usable(conn, memory_id, now):
    return conn.execute(
        f"SELECT 1 FROM memories m WHERE m.id = :id AND {MEMORY_USABLE}", {"id": memory_id, "now": now}
    ).fetchone() is not None


def askable_questions(conn, topics, difficulty, now):
    """Active questions up to `difficulty`: every general one, and the ones about the
    patient's own life whose topic the caregiver chose and whose memory is usable."""
    marks = ", ".join(f":topic{i}" for i in range(len(topics))) or "NULL"
    args = {"difficulty": difficulty, "now": now, **{f"topic{i}": t for i, t in enumerate(topics)}}
    rows = conn.execute(
        f"""
        SELECT q.* FROM trivia_questions q
        LEFT JOIN memories m ON m.id = q.memory_id
        WHERE q.is_active = 1 AND q.difficulty <= :difficulty
          AND (q.kind = 'general' OR (q.topic IN ({marks}) AND {MEMORY_USABLE}))
        ORDER BY q.id
        """,
        args,
    ).fetchall()
    return [dict(r) for r in rows]


def people_for(conn, question):
    """The verified person the question's memory is about, for the card's "See photos"."""
    if not question.get("memory_id"):
        return []
    rows = conn.execute(
        "SELECT p.* FROM memories m JOIN people p ON p.id = m.person_id "
        "WHERE m.id = ? AND p.trust = 'verified'",
        (question["memory_id"],),
    ).fetchall()
    return [dict(r) for r in rows]


# ─────────────────────────────── preloaded questions ────────────────────────────


def upsert_preloaded(conn, question, source):
    """Returns True when the row is new. is_active is left alone on a row that already
    exists, so a question a caregiver switched off stays off."""
    exists = get_question(conn, question["id"]) is not None
    conn.execute(
        """
        INSERT INTO trivia_questions (id, kind, topic, question, answer, choices, difficulty, source)
        VALUES (:id, :kind, :topic, :question, :answer, :choices, :difficulty, :source)
        ON CONFLICT (id) DO UPDATE SET
            kind = excluded.kind, topic = excluded.topic, question = excluded.question,
            answer = excluded.answer, choices = excluded.choices, difficulty = excluded.difficulty,
            memory_id = NULL, source = excluded.source
        """,
        {**question, "source": source},
    )
    return not exists


def delete_preloaded_except(conn, prefix, keep_ids):
    rows = conn.execute("SELECT id FROM trivia_questions WHERE id LIKE ? || '%'", (prefix,)).fetchall()
    gone = [r["id"] for r in rows if r["id"] not in keep_ids]
    for question_id in gone:
        conn.execute("DELETE FROM trivia_questions WHERE id = ?", (question_id,))
    return len(gone)


# ─────────────────────────────── prompt history ─────────────────────────────────


def insert_result(conn, question, outcome, duration_sec, created_at):
    log_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO activity_log (id, activity, topic, question_ref, outcome, difficulty, duration_sec, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (log_id, ACTIVITY, question["topic"], question["id"], outcome, question["difficulty"],
         duration_sec, created_at),
    )
    conn.commit()
    return dict(conn.execute("SELECT * FROM activity_log WHERE id = ?", (log_id,)).fetchone())


def last_result(conn):
    """The most recent answered or skipped prompt, or None."""
    row = conn.execute(
        "SELECT * FROM activity_log WHERE activity = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
        (ACTIVITY,),
    ).fetchone()
    return dict(row) if row else None


def last_shown(conn):
    """{question id: when it was last answered or skipped}."""
    rows = conn.execute(
        "SELECT question_ref, MAX(created_at) AS at FROM activity_log "
        "WHERE activity = ? AND question_ref IS NOT NULL GROUP BY question_ref",
        (ACTIVITY,),
    ).fetchall()
    return {r["question_ref"]: r["at"] for r in rows}
