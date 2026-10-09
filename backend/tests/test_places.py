"""PPL-3 (places CRUD, optional) endpoint tests. Plain pytest."""

from tests.conftest import make_place


def test_create_requires_name(client, caregiver_headers):
    assert client.post(
        "/places", json={"address": "somewhere"}, headers=caregiver_headers
    ).status_code == 400


def test_create_defaults_trust_unverified(client, caregiver_headers):
    resp = client.post(
        "/places",
        json={"name": "Malolos Church", "address": "Malolos, Bulacan"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "unverified"
    assert body["name"] == "Malolos Church"
    assert body["id"]


def test_caregiver_list_and_filter(client, caregiver_headers, db_conn):
    make_place(db_conn, name="Verified Place", trust="verified")
    make_place(db_conn, name="Unverified Place", trust="unverified")
    verified = client.get("/places?trust=verified", headers=caregiver_headers).json()
    assert all(p["trust"] == "verified" for p in verified)


def test_patient_sees_only_verified(client, patient_headers, db_conn):
    make_place(db_conn, name="Verified Place", trust="verified")
    make_place(db_conn, name="Unverified Place", trust="unverified")
    places = client.get("/places", headers=patient_headers).json()
    assert all(p["trust"] == "verified" for p in places)
    assert "Unverified Place" not in {p["name"] for p in places}


def test_patient_cannot_write(client, patient_headers, db_conn):
    place = make_place(db_conn)
    assert client.post(
        "/places", json={"name": "X"}, headers=patient_headers
    ).status_code == 403
    assert client.put(
        "/places/{}".format(place["id"]), json={"trust": "verified"},
        headers=patient_headers,
    ).status_code == 403
    assert client.delete(
        "/places/{}".format(place["id"]), headers=patient_headers
    ).status_code == 403


def test_update_and_delete(client, caregiver_headers, db_conn):
    place = make_place(db_conn, trust="unverified")
    resp = client.put(
        "/places/{}".format(place["id"]),
        json={"trust": "verified", "description": "updated"},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["trust"] == "verified"

    assert client.delete(
        "/places/{}".format(place["id"]), headers=caregiver_headers
    ).status_code == 200
    assert db_conn.execute(
        "SELECT 1 FROM places WHERE id = ?", (place["id"],)
    ).fetchone() is None


def test_unknown_id_404(client, caregiver_headers):
    assert client.get(
        "/places/nope", headers=caregiver_headers
    ).status_code == 404
    assert client.put(
        "/places/nope", json={"name": "X"}, headers=caregiver_headers
    ).status_code == 404
    assert client.delete(
        "/places/nope", headers=caregiver_headers
    ).status_code == 404
