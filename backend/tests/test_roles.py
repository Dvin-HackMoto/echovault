"""Role-gate tests for require_caregiver endpoints.

A caller the hub cannot identify gets 401; an identified caller who is not allowed
(a patient on a caregiver endpoint) gets 403, which the feature tests cover.
"""


def test_missing_role_header_rejected(client):
    assert client.get("/dashboard").status_code == 401


def test_unknown_role_rejected(client):
    assert client.get("/dashboard", headers={"X-Role": "nurse"}).status_code == 401


def test_caregiver_without_id_rejected(client):
    assert client.get("/dashboard", headers={"X-Role": "caregiver"}).status_code == 401


def test_unknown_caregiver_id_rejected(client):
    resp = client.get(
        "/dashboard",
        headers={"X-Role": "caregiver", "X-Caregiver-Id": "does-not-exist"},
    )
    assert resp.status_code == 401


def test_inactive_caregiver_rejected(client, db_conn):
    db_conn.execute(
        "INSERT INTO caregivers (id, name, access_level, pin_hash, is_active) "
        "VALUES ('cg-inactive', 'Old Carer', 'viewer', 'x', 0)"
    )
    db_conn.commit()
    resp = client.get(
        "/dashboard",
        headers={"X-Role": "caregiver", "X-Caregiver-Id": "cg-inactive"},
    )
    assert resp.status_code == 401
