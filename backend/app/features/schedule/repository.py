# schedule_items / schedule_acks queries

import uuid

COLUMNS = (
    "title", "kind", "starts_at", "duration_min", "recurrence", "ends_on", "person_id",
    "place_id", "notes", "remind_before_min", "is_quiet_period", "is_active",
)

# Items come back with the linked person's and place's names so the phones can say
# "Ana visits" without a second request.
SELECT_ITEMS = """
    SELECT s.*,
           p.name AS person_name, p.relationship AS person_relationship,
           p.photo_path AS person_photo_path,
           pl.name AS place_name
    FROM schedule_items s
    LEFT JOIN people p ON p.id = s.person_id
    LEFT JOIN places pl ON pl.id = s.place_id
"""


def exists(conn, table, row_id):
    return conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone() is not None


def list_items(conn, kind=None, active_only=False):
    where, args = [], []
    if kind:
        where.append("s.kind = ?")
        args.append(kind)
    if active_only:
        where.append("s.is_active = 1")
    sql = SELECT_ITEMS + (" WHERE " + " AND ".join(where) if where else "")
    sql += " ORDER BY time(s.starts_at), s.title"
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def get_item(conn, item_id):
    row = conn.execute(SELECT_ITEMS + " WHERE s.id = ?", (item_id,)).fetchone()
    return dict(row) if row else None


def create_item(conn, item):
    item_id = str(uuid.uuid4())
    conn.execute(
        f"INSERT INTO schedule_items (id, {', '.join(COLUMNS)}) "
        f"VALUES (?, {', '.join('?' for _ in COLUMNS)})",
        (item_id, *(item[c] for c in COLUMNS)),
    )
    conn.commit()
    return get_item(conn, item_id)


def update_item(conn, item_id, item):
    conn.execute(
        f"UPDATE schedule_items SET {', '.join(f'{c} = ?' for c in COLUMNS)}, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (*(item[c] for c in COLUMNS), item_id),
    )
    conn.commit()
    return get_item(conn, item_id)


def delete_item(conn, item_id):
    cur = conn.execute("DELETE FROM schedule_items WHERE id = ?", (item_id,))
    conn.commit()
    return cur.rowcount > 0


def get_ack(conn, item_id, occurrence_at):
    row = conn.execute(
        "SELECT * FROM schedule_acks WHERE schedule_item_id = ? AND occurrence_at = ?",
        (item_id, occurrence_at),
    ).fetchone()
    return dict(row) if row else None


def acks_on(conn, day):
    """{(item_id, occurrence_at): ack} for every response on one date."""
    rows = conn.execute(
        "SELECT * FROM schedule_acks WHERE substr(occurrence_at, 1, 10) = ?", (day,)
    ).fetchall()
    return {(r["schedule_item_id"], r["occurrence_at"]): dict(r) for r in rows}


def upsert_ack(conn, item_id, occurrence_at, response):
    # UNIQUE (schedule_item_id, occurrence_at): a second response replaces the first.
    conn.execute(
        """
        INSERT INTO schedule_acks (id, schedule_item_id, occurrence_at, response)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (schedule_item_id, occurrence_at) DO UPDATE SET
            response = excluded.response,
            responded_at = datetime('now','localtime')
        """,
        (str(uuid.uuid4()), item_id, occurrence_at, response),
    )
    conn.commit()
    return get_ack(conn, item_id, occurrence_at)
