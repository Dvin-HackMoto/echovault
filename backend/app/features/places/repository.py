# places queries

import uuid

# photo_path is not here: it only changes through set_photo (POST /places/{id}/photo)
COLUMNS = ("name", "description", "address", "trust")


def list_places(conn, trust=None):
    sql = "SELECT * FROM places" + (" WHERE trust = ?" if trust else "") + " ORDER BY name COLLATE NOCASE, id"
    return [dict(r) for r in conn.execute(sql, (trust,) if trust else ()).fetchall()]


def get_place(conn, place_id):
    row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
    return dict(row) if row else None


# Every write commits before returning: the hub's connection may or may not be in
# autocommit mode, and commit() is a no-op when there is nothing to commit.


def create_place(conn, place):
    place_id = str(uuid.uuid4())
    conn.execute(
        f"INSERT INTO places (id, {', '.join(COLUMNS)}) VALUES (?, {', '.join('?' for _ in COLUMNS)})",
        (place_id, *(place[c] for c in COLUMNS)),
    )
    conn.commit()
    return place_id


def update_place(conn, place_id, place):
    conn.execute(
        f"UPDATE places SET {', '.join(f'{c} = ?' for c in COLUMNS)}, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (*(place[c] for c in COLUMNS), place_id),
    )
    conn.commit()


def set_photo(conn, place_id, photo_path):
    conn.execute(
        "UPDATE places SET photo_path = ?, updated_at = datetime('now','localtime') WHERE id = ?",
        (photo_path, place_id),
    )
    conn.commit()


def delete_place(conn, place_id):
    # memories and schedule items keep their rows; their place_id is cleared (ON DELETE SET NULL)
    deleted = conn.execute("DELETE FROM places WHERE id = ?", (place_id,)).rowcount > 0
    conn.commit()
    return deleted
