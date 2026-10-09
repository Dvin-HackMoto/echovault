# places queries
#
# PPL-3 data layer (optional module, lives inside features/people/). Mirrors the
# people repository: helpers take a sqlite3 connection and return dict(row) (or
# None for a missing row). The router owns validation and the require_caregiver
# gate.

from uuid import uuid4

from app import constants

# Columns a caregiver may write. id/updated_at are server-managed.
_WRITABLE = ("name", "description", "address", "photo_path", "trust")


def list_places(conn, trust=None, verified_only=False):
    sql = "SELECT * FROM places"
    params = []
    if verified_only:
        sql += " WHERE trust = ?"
        params.append(constants.TRUST_VERIFIED)
    elif trust is not None:
        sql += " WHERE trust = ?"
        params.append(trust)
    sql += " ORDER BY name COLLATE NOCASE"
    return [dict(r) for r in conn.execute(sql, params)]


def get_place(conn, place_id):
    row = conn.execute("SELECT * FROM places WHERE id = ?", (place_id,)).fetchone()
    return dict(row) if row is not None else None


def create_place(conn, data):
    place_id = uuid4().hex
    provided = {k: data[k] for k in _WRITABLE if k in data}
    provided["id"] = place_id
    if "trust" not in provided or provided.get("trust") is None:
        provided["trust"] = constants.TRUST_UNVERIFIED

    columns = list(provided.keys())
    placeholders = ["?"] * len(columns)
    conn.execute(
        "INSERT INTO places ({}) VALUES ({})".format(
            ", ".join(columns), ", ".join(placeholders)
        ),
        tuple(provided.values()),
    )
    conn.commit()
    return get_place(conn, place_id)


def update_place(conn, place_id, data):
    if get_place(conn, place_id) is None:
        return None
    provided = {k: data[k] for k in _WRITABLE if k in data}
    if provided:
        assignments = ", ".join("{} = ?".format(k) for k in provided)
        conn.execute(
            "UPDATE places SET {}, updated_at = datetime('now','localtime') "
            "WHERE id = ?".format(assignments),
            tuple(provided.values()) + (place_id,),
        )
    else:
        conn.execute(
            "UPDATE places SET updated_at = datetime('now','localtime') WHERE id = ?",
            (place_id,),
        )
    conn.commit()
    return get_place(conn, place_id)


def delete_place(conn, place_id):
    cur = conn.execute("DELETE FROM places WHERE id = ?", (place_id,))
    conn.commit()
    return cur.rowcount > 0
