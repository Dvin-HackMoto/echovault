# medications / medication_times / medication_logs queries

import uuid
from contextlib import contextmanager

MED_COLUMNS = ("name", "dose", "instructions", "photo_path", "start_date", "end_date", "is_active")

# Logs come back with the medicine's details so a phone can draw the dose card from one row.
SELECT_LOGS = """
    SELECT l.*, m.name, m.dose, m.instructions, m.photo_path, substr(l.due_at, 12, 5) AS time_of_day
    FROM medication_logs l
    JOIN medications m ON m.id = l.medication_id
"""


def _new_id():
    return str(uuid.uuid4())


# Every write commits before returning: the hub's connection may or may not be in
# autocommit mode (see deps.py), and commit() is a no-op when there is nothing to commit.
@contextmanager
def _transaction(conn):
    conn.commit()  # close any implicit transaction so BEGIN can start a new one
    conn.execute("BEGIN")
    try:
        yield
        conn.commit()
    except Exception:
        conn.rollback()
        raise


# ───────────────────────────── medications + times ──────────────────────────────


def _times_by_med(conn, med_ids):
    if not med_ids:
        return {}
    rows = conn.execute(
        f"SELECT * FROM medication_times WHERE medication_id IN ({', '.join('?' for _ in med_ids)}) "
        "ORDER BY time_of_day",
        med_ids,
    ).fetchall()
    grouped = {med_id: [] for med_id in med_ids}
    for row in rows:
        grouped[row["medication_id"]].append(dict(row))
    return grouped


def list_medications(conn, active_only=False):
    sql = "SELECT * FROM medications" + (" WHERE is_active = 1" if active_only else "") + " ORDER BY name"
    meds = [dict(r) for r in conn.execute(sql).fetchall()]
    times = _times_by_med(conn, [m["id"] for m in meds])
    return [{**m, "times": times[m["id"]]} for m in meds]


def get_medication(conn, med_id):
    row = conn.execute("SELECT * FROM medications WHERE id = ?", (med_id,)).fetchone()
    if row is None:
        return None
    return {**dict(row), "times": _times_by_med(conn, [med_id])[med_id]}


def _replace_times(conn, med_id, times):
    conn.execute("DELETE FROM medication_times WHERE medication_id = ?", (med_id,))
    for t in times:
        conn.execute(
            "INSERT INTO medication_times (id, medication_id, time_of_day, days) VALUES (?, ?, ?, ?)",
            (_new_id(), med_id, t["time_of_day"], t["days"]),
        )


def create_medication(conn, med, times, created_by):
    med_id = _new_id()
    with _transaction(conn):
        conn.execute(
            f"INSERT INTO medications (id, {', '.join(MED_COLUMNS)}, created_by) "
            f"VALUES (?, {', '.join('?' for _ in MED_COLUMNS)}, ?)",
            (med_id, *(med[c] for c in MED_COLUMNS), created_by),
        )
        _replace_times(conn, med_id, times)
    return med_id


def update_medication(conn, med_id, med, times=None):
    """times=None keeps the saved times; a list replaces all of them."""
    with _transaction(conn):
        conn.execute(
            f"UPDATE medications SET {', '.join(f'{c} = ?' for c in MED_COLUMNS)}, "
            "updated_at = datetime('now','localtime') WHERE id = ?",
            (*(med[c] for c in MED_COLUMNS), med_id),
        )
        if times is not None:
            _replace_times(conn, med_id, times)


def set_photo(conn, med_id, photo_path):
    conn.execute(
        "UPDATE medications SET photo_path = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        (photo_path, med_id),
    )
    conn.commit()


def delete_medication(conn, med_id):
    # medication_times and medication_logs go with it (ON DELETE CASCADE)
    deleted = conn.execute("DELETE FROM medications WHERE id = ?", (med_id,)).rowcount > 0
    conn.commit()
    return deleted


# ─────────────────────────────────── logs ───────────────────────────────────────


def insert_unconfirmed_logs(conn, doses):
    """doses: [(medication_id, due_at)]. Existing (medication_id, due_at) rows are kept as they are."""
    inserted = 0
    for med_id, due_at in doses:
        inserted += conn.execute(
            "INSERT OR IGNORE INTO medication_logs (id, medication_id, due_at) VALUES (?, ?, ?)",
            (_new_id(), med_id, due_at),
        ).rowcount
    conn.commit()
    return inserted


def delete_untouched_logs(conn, med_id, from_due_at):
    """Drops logs nobody has responded to, so a changed time or a deactivated medicine
    does not leave stale doses behind. Answered doses are history and are never removed."""
    conn.execute(
        "DELETE FROM medication_logs WHERE medication_id = ? AND due_at >= ? "
        "AND status = 'unconfirmed' AND confirmed_by = 'none'",
        (med_id, from_due_at),
    )
    conn.commit()


def list_logs(conn, day=None, status=None, due_before=None):
    where, args = [], []
    if day:
        where.append("substr(l.due_at, 1, 10) = ?")
        args.append(day)
    if status:
        where.append("l.status = ?")
        args.append(status)
    if due_before:
        where.append("l.due_at < ?")
        args.append(due_before)
    sql = SELECT_LOGS + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY l.due_at, m.name"
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def get_log(conn, log_id):
    row = conn.execute(SELECT_LOGS + " WHERE l.id = ?", (log_id,)).fetchone()
    return dict(row) if row else None


def set_log_status(conn, log_id, status, confirmed_by, note):
    # status 'unconfirmed' (a caregiver undoing a mistake) clears the response time
    conn.execute(
        "UPDATE medication_logs SET status = ?, confirmed_by = ?, note = ?, "
        "responded_at = CASE WHEN ? = 'unconfirmed' THEN NULL ELSE datetime('now','localtime') END "
        "WHERE id = ?",
        (status, confirmed_by, note, status, log_id),
    )
    conn.commit()
