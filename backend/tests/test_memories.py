"""MEM-1..MEM-5 tests for the Memories module.

Plain pytest (no hypothesis, no tests/factories import). Uses the local insert
helpers added to conftest.py and the shared db_conn/client fixtures.
"""

from app.database.seed import CAREGIVER_ID
from app.features.memories import service
from tests.conftest import make_memory, make_person


# ─────────────────────────── CRUD + defaults (MEM-1) ───────────────────────


def test_create_defaults_trust_and_source(client, caregiver_headers):
    # Mobile payload shape: no trust, no source, no title.
    resp = client.post(
        "/memories",
        json={
            "content": "Ana loves sunflowers.",
            "category": "preference",
            "importance": "general",
            "validity": "persistent",
        },
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "unverified"
    assert body["source"] == "caregiver"
    assert body["content"] == "Ana loves sunflowers."
    assert body["id"]


def test_create_requires_content(client, caregiver_headers):
    assert client.post(
        "/memories", json={"category": "identity"}, headers=caregiver_headers
    ).status_code == 400
    assert client.post(
        "/memories", json={"content": "   ", "category": "identity"},
        headers=caregiver_headers,
    ).status_code == 400


def test_create_rejects_bad_enum(client, caregiver_headers):
    assert client.post(
        "/memories",
        json={"content": "x", "category": "not-a-category"},
        headers=caregiver_headers,
    ).status_code == 400


def test_list_filters_trust_and_category(client, caregiver_headers, db_conn):
    make_memory(db_conn, content="a", category="identity", trust="verified")
    make_memory(db_conn, content="b", category="routine", trust="unverified")

    verified = client.get("/memories?trust=verified", headers=caregiver_headers).json()
    assert all(m["trust"] == "verified" for m in verified)

    routine = client.get(
        "/memories?category=routine", headers=caregiver_headers
    ).json()
    assert all(m["category"] == "routine" for m in routine)

    assert client.get(
        "/memories?trust=bogus", headers=caregiver_headers
    ).status_code == 400


# ─────────────────────────── patient window (MEM-1) ────────────────────────


def test_patient_window_gating(client, patient_headers, caregiver_headers, db_conn):
    valid = make_memory(
        db_conn, content="valid verified", trust="verified", validity="persistent"
    )
    make_memory(db_conn, content="archived", trust="verified", validity="archived")
    make_memory(db_conn, content="unverified", trust="unverified")
    make_memory(
        db_conn,
        content="past",
        trust="verified",
        valid_until="2000-01-01 00:00:00",
    )
    make_memory(
        db_conn,
        content="future",
        trust="verified",
        valid_until="2999-01-01 00:00:00",
    )

    patient_list = client.get("/memories", headers=patient_headers).json()
    patient_ids = {m["id"] for m in patient_list}
    patient_contents = {m["content"] for m in patient_list}
    assert valid["id"] in patient_ids
    assert "future" in patient_contents
    assert "archived" not in patient_contents
    assert "unverified" not in patient_contents
    assert "past" not in patient_contents

    caregiver_list = client.get("/memories", headers=caregiver_headers).json()
    assert len(caregiver_list) >= 5


# ─────────────────────────────── FTS (MEM-1) ───────────────────────────────


def _fts_hits(conn, word):
    return [
        r["id"]
        for r in conn.execute(
            "SELECT m.id FROM memories m JOIN memories_fts f ON f.rowid = m.rowid "
            "WHERE memories_fts MATCH ?",
            (word,),
        )
    ]


def test_fts_reindexes_on_content_edit(client, caregiver_headers, db_conn):
    memory = make_memory(db_conn, content="sunflowers are lovely")
    assert memory["id"] in _fts_hits(db_conn, "sunflowers")

    resp = client.put(
        "/memories/{}".format(memory["id"]),
        json={"content": "roses are red"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    # found under NEW word, not OLD word
    assert memory["id"] in _fts_hits(db_conn, "roses")
    assert memory["id"] not in _fts_hits(db_conn, "sunflowers")


# ─────────────────────────────── verify (MEM-2) ────────────────────────────


def test_verify_sets_fields(client, caregiver_headers, db_conn):
    memory = make_memory(db_conn, content="verify me", trust="unverified")
    resp = client.post(
        "/memories/{}/verify".format(memory["id"]), headers=caregiver_headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "verified"
    assert body["verified_by"] == CAREGIVER_ID
    assert body["verified_at"] is not None


def test_patient_cannot_verify(client, patient_headers, db_conn):
    memory = make_memory(db_conn)
    assert client.post(
        "/memories/{}/verify".format(memory["id"]), headers=patient_headers
    ).status_code == 403


def test_editing_verified_content_resets_to_unverified(
    client, caregiver_headers, db_conn
):
    memory = make_memory(
        db_conn, content="original", trust="verified", verified_by=CAREGIVER_ID
    )
    resp = client.put(
        "/memories/{}".format(memory["id"]),
        json={"content": "edited"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "unverified"
    assert body["verified_by"] is None
    assert body["verified_at"] is None


# ─────────────────────────────── expire (MEM-3) ────────────────────────────


def test_expire_flips_past_valid_until(db_conn):
    service.reset_daily_expiry_guard()
    past = make_memory(
        db_conn, trust="verified", valid_until="2000-01-01 00:00:00"
    )
    null_until = make_memory(db_conn, trust="verified", valid_until=None)

    count = service.expire_outdated(db_conn)
    assert count == 1

    past_row = db_conn.execute(
        "SELECT trust FROM memories WHERE id = ?", (past["id"],)
    ).fetchone()
    null_row = db_conn.execute(
        "SELECT trust FROM memories WHERE id = ?", (null_until["id"],)
    ).fetchone()
    assert past_row["trust"] == "outdated"
    assert null_row["trust"] == "verified"  # NULL valid_until untouched


def test_daily_guard_runs_once_per_day(db_conn):
    service.reset_daily_expiry_guard()
    make_memory(db_conn, trust="verified", valid_until="2000-01-01 00:00:00")

    first = service.run_daily_expiry(db_conn)
    second = service.run_daily_expiry(db_conn)
    assert first == 1
    assert second == 0  # guarded: no second sweep the same day


# ─────────────────────────────── conflict (MEM-4) ──────────────────────────


def test_conflict_flags_both_and_links(client, caregiver_headers, db_conn):
    person = make_person(db_conn)
    first = make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
    )
    resp = client.post(
        "/memories",
        json={
            "content": "Breakfast is at 8am",
            "category": "routine",
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    second = resp.json()

    first_row = db_conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (first["id"],)
    ).fetchone()
    second_row = db_conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (second["id"],)
    ).fetchone()
    assert first_row["trust"] == "conflicting"
    assert second_row["trust"] == "conflicting"
    assert first_row["conflicts_with"] == second["id"]
    assert second_row["conflicts_with"] == first["id"]


def test_conflict_not_flagged_for_different_category(client, caregiver_headers, db_conn):
    person = make_person(db_conn)
    make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
    )
    resp = client.post(
        "/memories",
        json={
            "content": "Breakfast is at 8am",
            "category": "history",  # different category
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    )
    assert resp.json()["trust"] == "unverified"


def test_conflict_not_flagged_without_fts_overlap(client, caregiver_headers, db_conn):
    person = make_person(db_conn)
    make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
    )
    resp = client.post(
        "/memories",
        json={
            "content": "Enjoys gardening on weekends",  # no shared words
            "category": "routine",
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    )
    assert resp.json()["trust"] == "unverified"


def test_resolve_endpoint_keeps_one_archives_other(client, caregiver_headers, db_conn):
    person = make_person(db_conn)
    first = make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
    )
    second = client.post(
        "/memories",
        json={
            "content": "Breakfast is at 8am",
            "category": "routine",
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    ).json()

    resp = client.post(
        "/memories/{}/resolve".format(first["id"]),
        json={"other_outcome": "archived"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    kept = resp.json()
    assert kept["trust"] == "verified"
    assert kept["conflicts_with"] is None

    other = db_conn.execute(
        "SELECT trust, validity, conflicts_with FROM memories WHERE id = ?",
        (second["id"],),
    ).fetchone()
    assert other["validity"] == "archived"
    assert other["trust"] != "conflicting"
    assert other["conflicts_with"] is None


def test_resolve_via_verify_and_archive(client, caregiver_headers, db_conn):
    """The mobile path: verify the kept memory, archive the other via update."""
    person = make_person(db_conn)
    first = make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
    )
    second = client.post(
        "/memories",
        json={
            "content": "Breakfast is at 8am",
            "category": "routine",
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    ).json()

    # verify the kept memory
    client.post("/memories/{}/verify".format(first["id"]), headers=caregiver_headers)
    # archive the other via update -> tears down conflict, restores kept
    client.put(
        "/memories/{}".format(second["id"]),
        json={"validity": "archived"},
        headers=caregiver_headers,
    )

    first_row = db_conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (first["id"],)
    ).fetchone()
    second_row = db_conn.execute(
        "SELECT validity, conflicts_with FROM memories WHERE id = ?", (second["id"],)
    ).fetchone()
    assert first_row["trust"] == "verified"
    assert first_row["conflicts_with"] is None
    assert second_row["validity"] == "archived"
    assert second_row["conflicts_with"] is None


# ─────────────────────────────── source/safety (MEM-5) ─────────────────────


def test_patient_care_safety_rejected(client, patient_headers):
    # Patients are 403 on any write; care_safety must be rejected.
    resp = client.post(
        "/memories",
        json={"content": "danger note", "category": "care_safety"},
        headers=patient_headers,
    )
    assert resp.status_code == 403


def test_patient_source_forced_unverified(client, caregiver_headers):
    resp = client.post(
        "/memories",
        json={
            "content": "patient said something",
            "category": "identity",
            "source": "patient",
            "trust": "verified",  # should be ignored
        },
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["trust"] == "unverified"


def test_ai_suggested_forced_unverified_and_listable(client, caregiver_headers):
    resp = client.post(
        "/memories",
        json={
            "content": "ai guess",
            "category": "preference",
            "source": "ai_suggested",
            "trust": "verified",  # should be ignored
        },
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "ai_suggested"
    assert body["trust"] == "unverified"

    listed = client.get("/memories?trust=unverified", headers=caregiver_headers).json()
    ai = [m for m in listed if m["source"] == "ai_suggested"]
    assert any(m["id"] == body["id"] for m in ai)


# ─────────────────────────── person_id/place_id validation ─────────────────


def test_create_with_bogus_person_id_rejected(client, caregiver_headers):
    resp = client.post(
        "/memories",
        json={"content": "x", "category": "identity", "person_id": "nope"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 400


def test_create_with_valid_person_id_stored(client, caregiver_headers, db_conn):
    person = make_person(db_conn)
    resp = client.post(
        "/memories",
        json={"content": "x", "category": "identity", "person_id": person["id"]},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["person_id"] == person["id"]


# ───────────────── MEM-4 dashboard-connection regressions ──────────────────
# These guard two fixes: a resolved/verified conflict must NOT re-surface in the
# caregiver dashboard. The dashboard's unverified_memories query filters on
# trust only (no validity clause), so an archived loser left at trust='unverified'
# would wrongly reappear in the review queue.


def _make_conflict_pair(client, caregiver_headers, db_conn):
    """Create two same-person/category/overlapping memories so the second POST
    flags both as conflicting. Returns (first_id, second_id)."""
    person = make_person(db_conn)
    first = make_memory(
        db_conn,
        content="Breakfast is at 7am",
        category="routine",
        person_id=person["id"],
        trust="unverified",
    )
    second = client.post(
        "/memories",
        json={
            "content": "Breakfast is at 8am",
            "category": "routine",
            "person_id": person["id"],
        },
        headers=caregiver_headers,
    ).json()
    return first["id"], second["id"]


def test_resolve_archive_loser_not_in_unverified(client, caregiver_headers, db_conn):
    first_id, second_id = _make_conflict_pair(client, caregiver_headers, db_conn)
    # Resolve via the dedicated endpoint: keep first, archive second.
    client.post(
        "/memories/{}/resolve".format(first_id),
        json={"other_outcome": "archived"},
        headers=caregiver_headers,
    )
    loser = db_conn.execute(
        "SELECT trust, validity, conflicts_with FROM memories WHERE id = ?",
        (second_id,),
    ).fetchone()
    assert loser["validity"] == "archived"
    assert loser["conflicts_with"] is None
    # Must not sit in the dashboard's unverified review queue.
    assert loser["trust"] != "unverified"
    # And must not appear in the dashboard unverified list.
    unverified = db_conn.execute(
        "SELECT id FROM memories WHERE trust = 'unverified'"
    ).fetchall()
    assert second_id not in [r["id"] for r in unverified]


def test_bare_verify_cleans_up_conflict_partner(client, caregiver_headers, db_conn):
    first_id, second_id = _make_conflict_pair(client, caregiver_headers, db_conn)
    # Bare verify on one half of the pair.
    client.post("/memories/{}/verify".format(first_id), headers=caregiver_headers)
    verified = db_conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (first_id,)
    ).fetchone()
    partner = db_conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (second_id,)
    ).fetchone()
    assert verified["trust"] == "verified"
    assert verified["conflicts_with"] is None
    # Partner must NOT be left dangling as a half-pair (conflicting -> verified).
    assert partner["conflicts_with"] is None
    assert partner["trust"] != "conflicting"
