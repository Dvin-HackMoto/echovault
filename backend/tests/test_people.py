"""PPL-1 (people CRUD) + PPL-2 (photo) endpoint tests.

Plain pytest (no hypothesis, no tests/factories import). Uses the local insert
helpers added to conftest.py and the shared db_conn/client fixtures.
"""

import os

from app import config
from app.database.seed import CAREGIVER_ID
from tests.conftest import make_memory, make_person


# ─────────────────────────────── create ────────────────────────────────


def test_create_requires_name_and_relationship(client, caregiver_headers):
    assert client.post(
        "/people", json={"relationship": "daughter"}, headers=caregiver_headers
    ).status_code == 400
    assert client.post(
        "/people", json={"name": "Ana"}, headers=caregiver_headers
    ).status_code == 400
    assert client.post(
        "/people", json={"name": "  ", "relationship": "daughter"},
        headers=caregiver_headers,
    ).status_code == 400


def test_create_defaults_trust_and_records_created_by(client, caregiver_headers):
    resp = client.post(
        "/people",
        json={"name": "Ana Santos", "relationship": "daughter", "is_caregiver": 1},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "unverified"
    assert body["created_by"] == CAREGIVER_ID
    assert body["name"] == "Ana Santos"
    assert body["is_caregiver"] == 1
    assert body["id"]


# ─────────────────────────────── list/get ──────────────────────────────


def test_caregiver_list_all_and_filter_trust(client, caregiver_headers, db_conn):
    make_person(db_conn, name="Verified One", trust="verified")
    make_person(db_conn, name="Unverified One", trust="unverified")

    all_people = client.get("/people", headers=caregiver_headers).json()
    names = {p["name"] for p in all_people}
    assert {"Verified One", "Unverified One"} <= names

    verified = client.get("/people?trust=verified", headers=caregiver_headers).json()
    assert all(p["trust"] == "verified" for p in verified)
    assert "Unverified One" not in {p["name"] for p in verified}


def test_patient_sees_only_verified(client, patient_headers, db_conn):
    make_person(db_conn, name="Verified One", trust="verified")
    make_person(db_conn, name="Unverified One", trust="unverified")
    people = client.get("/people", headers=patient_headers).json()
    assert all(p["trust"] == "verified" for p in people)
    assert "Unverified One" not in {p["name"] for p in people}


def test_patient_get_unverified_person_404(client, patient_headers, db_conn):
    person = make_person(db_conn, trust="unverified")
    assert client.get(
        "/people/{}".format(person["id"]), headers=patient_headers
    ).status_code == 404


# ─────────────────────────────── update ────────────────────────────────


def test_update_sets_fields(client, caregiver_headers, db_conn):
    person = make_person(db_conn, trust="unverified", is_caregiver=1)
    resp = client.put(
        "/people/{}".format(person["id"]),
        json={"trust": "verified", "is_caregiver": 0},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trust"] == "verified"
    assert body["is_caregiver"] == 0


def test_update_unknown_id_404(client, caregiver_headers):
    assert client.put(
        "/people/nope", json={"trust": "verified"}, headers=caregiver_headers
    ).status_code == 404


# ─────────────────────────────── patient writes ────────────────────────


def test_patient_cannot_write(client, patient_headers, db_conn):
    person = make_person(db_conn)
    assert client.post(
        "/people", json={"name": "X", "relationship": "y"}, headers=patient_headers
    ).status_code == 403
    assert client.put(
        "/people/{}".format(person["id"]), json={"trust": "verified"},
        headers=patient_headers,
    ).status_code == 403
    assert client.delete(
        "/people/{}".format(person["id"]), headers=patient_headers
    ).status_code == 403


# ─────────────────────────────── delete ────────────────────────────────


def test_delete_person_keeps_memory_with_null_person_id(
    client, caregiver_headers, db_conn
):
    person = make_person(db_conn)
    memory = make_memory(db_conn, person_id=person["id"], content="About Ana")

    resp = client.delete(
        "/people/{}".format(person["id"]), headers=caregiver_headers
    )
    assert resp.status_code == 200

    # person is gone
    assert db_conn.execute(
        "SELECT 1 FROM people WHERE id = ?", (person["id"],)
    ).fetchone() is None

    # memory survives with person_id cleared to NULL (FK ON DELETE SET NULL)
    row = db_conn.execute(
        "SELECT person_id FROM memories WHERE id = ?", (memory["id"],)
    ).fetchone()
    assert row is not None
    assert row["person_id"] is None


def test_delete_unknown_id_404(client, caregiver_headers):
    assert client.delete(
        "/people/nope", headers=caregiver_headers
    ).status_code == 404


# ─────────────────────────────── photo (PPL-2) ─────────────────────────

# 1x1 transparent PNG.
_PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c6360000002000154a24f6d0000000049454e44ae426082"
)


def test_photo_upload_saves_file_and_stores_path(
    client, caregiver_headers, db_conn, monkeypatch, tmp_path
):
    monkeypatch.setattr(config, "PHOTO_DIR", str(tmp_path))
    person = make_person(db_conn)

    resp = client.post(
        "/people/{}/photo".format(person["id"]),
        files={"file": ("x.png", _PNG_BYTES, "image/png")},
        headers=caregiver_headers,
    )
    assert resp.status_code == 200
    stored = resp.json()["photo_path"]
    assert stored.startswith(str(tmp_path))
    assert os.path.isfile(stored)
    # path persisted on the row
    row = db_conn.execute(
        "SELECT photo_path FROM people WHERE id = ?", (person["id"],)
    ).fetchone()
    assert row["photo_path"] == stored


def test_photo_upload_rejects_non_image(
    client, caregiver_headers, db_conn, monkeypatch, tmp_path
):
    monkeypatch.setattr(config, "PHOTO_DIR", str(tmp_path))
    person = make_person(db_conn)
    resp = client.post(
        "/people/{}/photo".format(person["id"]),
        files={"file": ("note.txt", b"hello", "text/plain")},
        headers=caregiver_headers,
    )
    assert resp.status_code == 400


def test_photo_upload_unknown_id_404(
    client, caregiver_headers, monkeypatch, tmp_path
):
    monkeypatch.setattr(config, "PHOTO_DIR", str(tmp_path))
    resp = client.post(
        "/people/nope/photo",
        files={"file": ("x.png", _PNG_BYTES, "image/png")},
        headers=caregiver_headers,
    )
    assert resp.status_code == 404


def test_photo_replace_removes_old_file(
    client, caregiver_headers, db_conn, monkeypatch, tmp_path
):
    monkeypatch.setattr(config, "PHOTO_DIR", str(tmp_path))
    person = make_person(db_conn)

    first = client.post(
        "/people/{}/photo".format(person["id"]),
        files={"file": ("a.png", _PNG_BYTES, "image/png")},
        headers=caregiver_headers,
    ).json()["photo_path"]
    assert os.path.isfile(first)

    second = client.post(
        "/people/{}/photo".format(person["id"]),
        files={"file": ("b.png", _PNG_BYTES, "image/png")},
        headers=caregiver_headers,
    ).json()["photo_path"]

    assert second != first
    assert os.path.isfile(second)
    assert not os.path.isfile(first)  # old file removed
