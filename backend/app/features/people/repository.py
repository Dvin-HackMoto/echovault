# people queries
#
# PPL-1 data layer. No DTOs: these helpers take a sqlite3 connection and return
# dict(row) (or None for a missing row). The router owns payload/enum validation
# and the require_caregiver gate; this module only reads and writes rows.

from uuid import uuid4

from app import constants

# Columns a caregiver may write on create/update. `id`, `created_by`,
# `created_at`, `updated_at` are server-managed and never taken from a payload.
_WRITABLE = (
    "name",
    "nickname",
    "relationship",
    "photo_path",
    "notes",
    "is_caregiver",
    "trust",
)


def list_people(conn, trust=None, verified_only=False):
    """Return people rows. verified_only (patient mode) forces trust='verified';
    otherwise an optional trust filter may be applied (caregiver mode)."""
    sql = "SELECT * FROM people"
    params = []
    if verified_only:
        sql += " WHERE trust = ?"
        params.append(constants.TRUST_VERIFIED)
    elif trust is not None:
        sql += " WHERE trust = ?"
        params.append(trust)
    sql += " ORDER BY name COLLATE NOCASE"
    return [dict(r) for r in conn.execute(sql, params)]


def get_person(conn, person_id):
    row = conn.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()
    return dict(row) if row is not None else None


def create_person(conn, data, created_by):
    """Insert a person. Server assigns the uuid id, created_by, and defaults
    trust to 'unverified' unless a valid trust is supplied."""
    person_id = uuid4().hex
    provided = {k: data[k] for k in _WRITABLE if k in data}
    provided["id"] = person_id
    provided["created_by"] = created_by
    if "trust" not in provided or provided.get("trust") is None:
        provided["trust"] = constants.TRUST_UNVERIFIED

    columns = list(provided.keys())
    placeholders = ["?"] * len(columns)
    conn.execute(
        "INSERT INTO people ({}) VALUES ({})".format(
            ", ".join(columns), ", ".join(placeholders)
        ),
        tuple(provided.values()),
    )
    conn.commit()
    return get_person(conn, person_id)


def update_person(conn, person_id, data):
    """Apply a partial update to the writable columns and bump updated_at.
    Returns the updated row, or None if the person does not exist."""
    if get_person(conn, person_id) is None:
        return None

    provided = {k: data[k] for k in _WRITABLE if k in data}
    if provided:
        assignments = ", ".join("{} = ?".format(k) for k in provided)
        conn.execute(
            "UPDATE people SET {}, updated_at = datetime('now','localtime') "
            "WHERE id = ?".format(assignments),
            tuple(provided.values()) + (person_id,),
        )
    else:
        conn.execute(
            "UPDATE people SET updated_at = datetime('now','localtime') "
            "WHERE id = ?",
            (person_id,),
        )
    conn.commit()
    return get_person(conn, person_id)


def delete_person(conn, person_id):
    """Delete a person. Linked memories keep their row with person_id set to
    NULL via the schema FK (ON DELETE SET NULL). Returns True if a row was
    removed."""
    cur = conn.execute("DELETE FROM people WHERE id = ?", (person_id,))
    conn.commit()
    return cur.rowcount > 0
