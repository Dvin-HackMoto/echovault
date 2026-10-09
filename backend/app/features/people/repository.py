# people queries

import uuid
from contextlib import contextmanager

# photo_path is not here: it only changes through set_photo (POST /people/{id}/photo)
COLUMNS = ("name", "nickname", "relationship", "notes", "is_caregiver", "trust")


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


def list_people(conn, trust=None, with_photo=False):
    where, args = [], []
    if trust:
        where.append("trust = ?")
        args.append(trust)
    if with_photo:
        where.append("photo_path IS NOT NULL")
    sql = "SELECT * FROM people" + (" WHERE " + " AND ".join(where) if where else "")
    sql += " ORDER BY name COLLATE NOCASE, id"
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def get_person(conn, person_id):
    row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
    return dict(row) if row else None


def get_fallback_caregiver(conn):
    row = conn.execute("SELECT * FROM people WHERE is_caregiver = 1 ORDER BY updated_at DESC").fetchone()
    return dict(row) if row else None


def _keep_one_caregiver(conn, person_id):
    # is_caregiver marks the one person the assistant sends the patient to ("ask Ana")
    conn.execute(
        "UPDATE people SET is_caregiver = 0, updated_at = datetime('now','localtime') "
        "WHERE is_caregiver = 1 AND id != ?",
        (person_id,),
    )


def create_person(conn, person, created_by):
    person_id = str(uuid.uuid4())
    with _transaction(conn):
        conn.execute(
            f"INSERT INTO people (id, {', '.join(COLUMNS)}, created_by) "
            f"VALUES (?, {', '.join('?' for _ in COLUMNS)}, ?)",
            (person_id, *(person[c] for c in COLUMNS), created_by),
        )
        if person["is_caregiver"]:
            _keep_one_caregiver(conn, person_id)
    return person_id


def update_person(conn, person_id, person):
    with _transaction(conn):
        conn.execute(
            f"UPDATE people SET {', '.join(f'{c} = ?' for c in COLUMNS)}, "
            "updated_at = datetime('now','localtime') WHERE id = ?",
            (*(person[c] for c in COLUMNS), person_id),
        )
        if person["is_caregiver"]:
            _keep_one_caregiver(conn, person_id)


def set_photo(conn, person_id, photo_path):
    conn.execute(
        "UPDATE people SET photo_path = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        (photo_path, person_id),
    )
    conn.commit()


def delete_person(conn, person_id):
    # memories and schedule items keep their rows; their person_id is cleared (ON DELETE SET NULL)
    deleted = conn.execute("DELETE FROM people WHERE id = ?", (person_id,)).rowcount > 0
    conn.commit()
    return deleted
