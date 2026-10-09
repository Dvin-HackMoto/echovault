# memories queries
#
# MEM-1 data layer plus the verify (MEM-2) write. No DTOs: helpers take a
# sqlite3 connection and return dict(row) (or None for a missing row). Conflict
# flagging (MEM-4) and expiry (MEM-3) live in service.py; the router wires them
# around these calls. FTS is maintained by the schema triggers — never written
# here directly.

from uuid import uuid4

from app import constants

# Columns a caregiver may write on create/update. Server-managed columns
# (id, trust defaults, conflicts_with, verified_by/at, timestamps) are set
# explicitly, never taken verbatim from a payload.
_WRITABLE = (
    "title",
    "content",
    "category",
    "importance",
    "trust",
    "validity",
    "valid_from",
    "valid_until",
    "event_date",
    "person_id",
    "place_id",
    "photo_path",
    "source",
)

# Patient-mode (ARCHITECTURE Core Retrieval Query) validity window.
_PATIENT_WINDOW = (
    "trust = 'verified' AND validity != 'archived' "
    "AND (valid_until IS NULL OR valid_until >= datetime('now','localtime')) "
    "AND (valid_from IS NULL OR valid_from <= datetime('now','localtime'))"
)


def get_memory(conn, memory_id, role=None):
    """Fetch a memory. For patient role, only a row that passes the retrieval
    window is visible (returns None otherwise)."""
    row = conn.execute(
        "SELECT * FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    if row is None:
        return None
    if role == constants.ROLE_PATIENT:
        visible = conn.execute(
            "SELECT 1 FROM memories WHERE id = ? AND {}".format(_PATIENT_WINDOW),
            (memory_id,),
        ).fetchone()
        if visible is None:
            return None
    return dict(row)


def list_memories(conn, role, trust=None, category=None):
    """List memories. Patient role gets only the retrieval window (unsafe trust
    filters ignored). Caregiver role may filter by trust and/or category."""
    clauses = []
    params = []

    if role == constants.ROLE_PATIENT:
        clauses.append(_PATIENT_WINDOW)
        if category is not None:
            clauses.append("category = ?")
            params.append(category)
    else:
        if trust is not None:
            clauses.append("trust = ?")
            params.append(trust)
        if category is not None:
            clauses.append("category = ?")
            params.append(category)

    sql = "SELECT * FROM memories"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY updated_at DESC"
    return [dict(r) for r in conn.execute(sql, params)]


def create_memory(conn, data):
    """Insert a memory. Server assigns the uuid id and applies the trust/source
    defaults the router has already resolved. Returns the created row."""
    memory_id = uuid4().hex
    provided = {k: data[k] for k in _WRITABLE if k in data}
    provided["id"] = memory_id
    if "trust" not in provided or provided.get("trust") is None:
        provided["trust"] = constants.TRUST_UNVERIFIED
    if "source" not in provided or provided.get("source") is None:
        provided["source"] = constants.SOURCE_CAREGIVER

    columns = list(provided.keys())
    placeholders = ["?"] * len(columns)
    conn.execute(
        "INSERT INTO memories ({}) VALUES ({})".format(
            ", ".join(columns), ", ".join(placeholders)
        ),
        tuple(provided.values()),
    )
    conn.commit()
    return dict(
        conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
    )


def update_memory(conn, memory_id, data):
    """Partial update. If content or title changes on a currently-verified row,
    reset it to unverified and clear verified_by/at (MEM-2). Returns the updated
    row, or None if the memory does not exist."""
    current = conn.execute(
        "SELECT * FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    if current is None:
        return None

    provided = {k: data[k] for k in _WRITABLE if k in data}

    # MEM-2: editing the content/title of a verified memory invalidates it.
    content_changed = "content" in provided and provided["content"] != current["content"]
    title_changed = "title" in provided and provided["title"] != current["title"]
    reset_verification = (
        current["trust"] == constants.TRUST_VERIFIED
        and (content_changed or title_changed)
    )

    assignments = ["{} = ?".format(k) for k in provided]
    params = list(provided.values())
    if reset_verification:
        assignments.append("trust = ?")
        params.append(constants.TRUST_UNVERIFIED)
        assignments.append("verified_by = NULL")
        assignments.append("verified_at = NULL")

    assignments.append("updated_at = datetime('now','localtime')")
    conn.execute(
        "UPDATE memories SET {} WHERE id = ?".format(", ".join(assignments)),
        tuple(params) + (memory_id,),
    )
    conn.commit()
    return dict(
        conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
    )


def delete_memory(conn, memory_id):
    cur = conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
    conn.commit()
    return cur.rowcount > 0


def verify_memory(conn, memory_id, caregiver_id):
    """MEM-2: set trust='verified', verified_by, verified_at, and clear
    conflicts_with (resolving a conflicting row). Returns the row, or None."""
    row = conn.execute(
        "SELECT 1 FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    if row is None:
        return None
    conn.execute(
        "UPDATE memories SET trust = ?, verified_by = ?, "
        "verified_at = datetime('now','localtime'), conflicts_with = NULL, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (constants.TRUST_VERIFIED, caregiver_id, memory_id),
    )
    conn.commit()
    return dict(
        conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
    )
