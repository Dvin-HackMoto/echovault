# assistant_log queries, the patient's language, and the records an answer used

import json
import uuid

# assistant_log.memory_ids holds the id of every record an answer was built from, not only
# memories: (type, table, column shown as the label, column shown as the detail)
RECORD_TABLES = (
    ("memory", "memories", "title", "content"),
    ("person", "people", "name", "relationship"),
    ("schedule_item", "schedule_items", "title", "starts_at"),
    ("medication", "medications", "name", "dose"),
)


def patient_language(conn):
    row = conn.execute("SELECT language FROM patient WHERE id = 1").fetchone()
    return row["language"] if row else None


def add_log(conn, question, input_mode, intent, answer, answer_mode, record_ids):
    log_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO assistant_log (id, question, input_mode, intent, answer, answer_mode, memory_ids) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (log_id, question, input_mode, intent, answer, answer_mode, json.dumps(record_ids)),
    )
    conn.commit()
    return log_id


def get_log(conn, log_id):
    row = conn.execute("SELECT * FROM assistant_log WHERE id = ?", (log_id,)).fetchone()
    return dict(row) if row else None


def list_logs(conn, limit=50, flagged=None):
    where, args = "", []
    if flagged is not None:
        where, args = " WHERE flagged = ?", [1 if flagged else 0]
    rows = conn.execute(
        f"SELECT * FROM assistant_log{where} ORDER BY created_at DESC, rowid DESC LIMIT ?", (*args, limit)
    ).fetchall()
    return [dict(r) for r in rows]


def set_flagged(conn, log_id, flagged):
    conn.execute("UPDATE assistant_log SET flagged = ? WHERE id = ?", (1 if flagged else 0, log_id))
    conn.commit()


def record_ids(log):
    try:
        ids = json.loads(log.get("memory_ids") or "[]")
    except ValueError:
        return []
    return [i for i in ids if isinstance(i, str)] if isinstance(ids, list) else []


def records_used(conn, ids):
    """Each id as {id, type, label, detail, trust}, in the order given, so a caregiver can
    see what an answer came from. A record deleted since then has type 'deleted'."""
    found = {}
    marks = ", ".join("?" for _ in ids)
    for kind, table, label, detail in RECORD_TABLES:
        if not ids:
            break
        for row in conn.execute(f"SELECT * FROM {table} WHERE id IN ({marks})", ids).fetchall():
            row = dict(row)
            found.setdefault(row["id"], {
                "id": row["id"], "type": kind, "label": row[label], "detail": row[detail],
                "trust": row.get("trust"),
            })
    missing = {"type": "deleted", "label": None, "detail": None, "trust": None}
    return [found.get(i, {"id": i, **missing}) for i in ids]
