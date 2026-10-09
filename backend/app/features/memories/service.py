# conflict flagging, expire past valid_until
#
# MEM-3 (expiry) and MEM-4 (conflict flagging / resolution) business logic.
# These helpers take a sqlite3 connection and mutate the memories table; the
# router owns validation and the require_caregiver gate.

import re
from datetime import date

from app import constants

# States a memory can be in and still participate in conflict detection. An
# already-archived or outdated row is not a live claim, so it is skipped.
_LIVE_TRUST = (constants.TRUST_VERIFIED, constants.TRUST_UNVERIFIED)

# Module-level guard so the daily expiry sweep runs at most once per local day.
_last_expiry_date = None

# Characters with special meaning to the fts5 query grammar — strip them so an
# arbitrary memory's text can be turned into a safe MATCH query.
_FTS_TOKEN_RE = re.compile(r"[^0-9A-Za-z]+")


def expire_outdated(conn):
    """MEM-3: a verified memory whose valid_until has passed becomes 'outdated'.
    Rows with a NULL valid_until are left untouched. Returns the count flipped.
    """
    cur = conn.execute(
        "UPDATE memories SET trust = ?, "
        "updated_at = datetime('now','localtime') "
        "WHERE trust = ? AND valid_until IS NOT NULL "
        "AND valid_until < datetime('now','localtime')",
        (constants.TRUST_OUTDATED, constants.TRUST_VERIFIED),
    )
    conn.commit()
    return cur.rowcount


def run_daily_expiry(conn):
    """Run expire_outdated at most once per local calendar day. Safe to call at
    the top of every GET /memories request."""
    global _last_expiry_date
    today = date.today()
    if _last_expiry_date == today:
        return 0
    _last_expiry_date = today
    return expire_outdated(conn)


def reset_daily_expiry_guard():
    """Clear the once-per-day guard (used by tests)."""
    global _last_expiry_date
    _last_expiry_date = None


def _fts_query_for_text(*parts):
    """Build a safe fts5 MATCH query (OR of the distinct word tokens) from the
    given text parts. Returns None when there is nothing searchable."""
    tokens = []
    for part in parts:
        if not part:
            continue
        for token in _FTS_TOKEN_RE.split(part):
            if token:
                tokens.append(token)
    if not tokens:
        return None
    # Deduplicate preserving order; quote each term so digits/keywords are safe.
    seen = []
    for token in tokens:
        if token not in seen:
            seen.append(token)
    return " OR ".join('"{}"'.format(t) for t in seen)


def flag_conflicts(conn, memory_id):
    """MEM-4: flag a conflict for the given memory against another memory with
    the SAME non-null person_id AND same category AND an FTS text overlap.

    When a match is found, BOTH rows become trust='conflicting' and point at
    each other via conflicts_with. Memories with no person_id, a different
    category, or no FTS overlap are not flagged. Returns the matched memory id
    or None.
    """
    row = conn.execute(
        "SELECT rowid, id, person_id, category, title, content "
        "FROM memories WHERE id = ?",
        (memory_id,),
    ).fetchone()
    if row is None or not row["person_id"]:
        return None

    match_query = _fts_query_for_text(row["title"], row["content"])
    if not match_query:
        return None

    placeholders = ",".join("?" for _ in _LIVE_TRUST)
    candidate = conn.execute(
        "SELECT m.id FROM memories m "
        "JOIN memories_fts f ON f.rowid = m.rowid "
        "WHERE m.id != ? AND m.person_id = ? AND m.category = ? "
        "AND m.trust IN ({}) AND memories_fts MATCH ? "
        "ORDER BY m.created_at".format(placeholders),
        (row["id"], row["person_id"], row["category"]) + _LIVE_TRUST + (match_query,),
    ).fetchone()
    if candidate is None:
        return None

    other_id = candidate["id"]
    conn.execute(
        "UPDATE memories SET trust = ?, conflicts_with = ?, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (constants.TRUST_CONFLICTING, other_id, row["id"]),
    )
    conn.execute(
        "UPDATE memories SET trust = ?, conflicts_with = ?, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (constants.TRUST_CONFLICTING, row["id"], other_id),
    )
    conn.commit()
    return other_id


def clear_conflict(conn, memory_id):
    """Tear down a conflict involving memory_id: restore the OTHER row to
    verified and clear conflicts_with on BOTH. Used when a conflicting row is
    archived/outdated via a normal update (the mobile verify+archive flow)."""
    row = conn.execute(
        "SELECT id, conflicts_with FROM memories WHERE id = ?",
        (memory_id,),
    ).fetchone()
    if row is None or not row["conflicts_with"]:
        return
    other_id = row["conflicts_with"]
    conn.execute(
        "UPDATE memories SET trust = ?, conflicts_with = NULL, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (constants.TRUST_VERIFIED, other_id),
    )
    conn.execute(
        "UPDATE memories SET conflicts_with = NULL, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (memory_id,),
    )
    conn.commit()


def resolve_conflict(conn, keep_id, other_id, other_outcome):
    """MEM-4 resolve: keep_id -> verified, other_id -> other_outcome
    ('archived' or 'outdated'); clear conflicts_with on BOTH. Validates the two
    ids actually point at each other. Returns the two updated rows."""
    if other_outcome not in (constants.TRUST_OUTDATED, constants.VALIDITY_ARCHIVED):
        raise ValueError("other_outcome must be 'archived' or 'outdated'")

    keep = conn.execute(
        "SELECT id, conflicts_with FROM memories WHERE id = ?", (keep_id,)
    ).fetchone()
    other = conn.execute(
        "SELECT id, conflicts_with FROM memories WHERE id = ?", (other_id,)
    ).fetchone()
    if keep is None or other is None:
        raise LookupError("memory not found")
    if keep["conflicts_with"] != other_id or other["conflicts_with"] != keep_id:
        raise ValueError("memories are not a conflicting pair")

    conn.execute(
        "UPDATE memories SET trust = ?, conflicts_with = NULL, "
        "updated_at = datetime('now','localtime') WHERE id = ?",
        (constants.TRUST_VERIFIED, keep_id),
    )
    if other_outcome == constants.VALIDITY_ARCHIVED:
        # Archive: mark validity='archived' and set trust='outdated'. A resolved
        # conflict loser is NOT a live claim and must NOT re-enter the caregiver
        # review queue. The dashboard's unverified_memories query filters on
        # trust only (no validity clause), so trust='unverified' would re-surface
        # it there; trust='outdated' keeps it out of the unverified list and only
        # briefly in the outdated list (which ages out after 7 days).
        conn.execute(
            "UPDATE memories SET trust = ?, validity = ?, conflicts_with = NULL, "
            "updated_at = datetime('now','localtime') WHERE id = ?",
            (constants.TRUST_OUTDATED, constants.VALIDITY_ARCHIVED, other_id),
        )
    else:
        conn.execute(
            "UPDATE memories SET trust = ?, conflicts_with = NULL, "
            "updated_at = datetime('now','localtime') WHERE id = ?",
            (constants.TRUST_OUTDATED, other_id),
        )
    conn.commit()
