# activity_log
#
# One row per played round (or per trivia prompt, written by features/trivia/).
# Rows record engagement: what was played, on which topic, and whether it was finished,
# skipped or stopped. Nothing here computes a score.

import uuid

COLUMNS = ("activity", "topic", "question_ref", "outcome", "difficulty", "duration_sec")


def get_entry(conn, entry_id):
    row = conn.execute("SELECT * FROM activity_log WHERE id = ?", (entry_id,)).fetchone()
    return dict(row) if row else None


def log_activity(conn, entry):
    entry_id = str(uuid.uuid4())
    conn.execute(
        f"INSERT INTO activity_log (id, {', '.join(COLUMNS)}) VALUES (?, {', '.join('?' for _ in COLUMNS)})",
        (entry_id, *(entry.get(c) for c in COLUMNS)),
    )
    conn.commit()
    return get_entry(conn, entry_id)
