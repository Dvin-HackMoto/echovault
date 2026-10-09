# People module (PPL-1, PPL-2, PPL-4). From backend/:  py -m pytest tests/test_people.py
#
# These tests go through the real app (the router is found by main.py, the real role
# checks run) against the real schema in this test's own storage folder.

import sqlite3

import pytest

from app import config
from app.features.people import photos, repository, service
from tests.factories import PATIENT_HEADERS, make_memory, make_person, make_schedule_item

PNG = b"\x89PNG\r\n\x1a\n" + b"png-bytes"
JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-bytes"
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"webp-bytes"


@pytest.fixture
def cg(caregiver_client_headers):
    return caregiver_client_headers


def create(client, cg, **fields):
    res = client.post("/people", json={"name": "Ana Santos", "relationship": "daughter", **fields}, headers=cg)
    assert res.status_code == 201, res.text
    return res.json()


def upload(client, cg, person_id, data=PNG, filename="photo.png", content_type="image/png"):
    return client.post(
        f"/people/{person_id}/photo", files={"photo": (filename, data, content_type)}, headers=cg
    )


# ─────────────────────────────────── PPL-1 ──────────────────────────────────────


def test_create_records_the_caregiver_and_starts_unverified(client, cg, caregiver):
    person = create(client, cg, nickname=" Ana ", notes="")
    assert person["name"] == "Ana Santos" and person["relationship"] == "daughter"
    assert person["nickname"] == "Ana" and person["notes"] is None
    assert person["trust"] == "unverified"
    assert person["is_caregiver"] == 0
    assert person["created_by"] == caregiver["id"]
    assert person["photo_path"] is None and person["photo_url"] is None
    assert client.get(f"/people/{person['id']}", headers=cg).json() == person


def test_a_caregiver_can_add_and_verify_in_one_step(client, cg):
    assert create(client, cg, trust="verified")["trust"] == "verified"


@pytest.mark.parametrize("fields, message", [
    ({"name": "  "}, "name is required"),
    ({"name": None}, "name is required"),
    ({"relationship": ""}, "relationship is required"),
    ({"trust": "trusted"}, "trust must be one of"),
    ({"trust": None}, "trust must be one of"),
    ({"is_caregiver": "maybe"}, "is_caregiver must be true or false"),
])
def test_create_and_update_validate_fields(client, cg, fields, message):
    body = {"name": "Ana Santos", "relationship": "daughter", **fields}
    res = client.post("/people", json=body, headers=cg)
    assert res.status_code == 422 and message in res.json()["detail"]

    saved = create(client, cg)
    res = client.put(f"/people/{saved['id']}", json=fields, headers=cg)
    assert res.status_code == 422 and message in res.json()["detail"]
    assert client.get(f"/people/{saved['id']}", headers=cg).json() == saved


def test_update_is_partial_and_keeps_trust(client, cg):
    saved = create(client, cg, nickname="Ana", trust="verified")
    updated = client.put(f"/people/{saved['id']}", json={"notes": "Lives with you."}, headers=cg).json()
    assert updated["notes"] == "Lives with you."
    assert (updated["name"], updated["nickname"], updated["trust"]) == ("Ana Santos", "Ana", "verified")
    assert updated["created_by"] == saved["created_by"]

    assert client.put(f"/people/{saved['id']}", json={"trust": "outdated"}, headers=cg).json()["trust"] == "outdated"
    assert client.put("/people/nobody", json={"notes": "x"}, headers=cg).status_code == 404


def test_photo_path_cannot_be_set_through_json(client, cg):
    saved = create(client, cg, photo_path="seed-ana.png")
    assert saved["photo_path"] is None
    updated = client.put(f"/people/{saved['id']}", json={"photo_path": "../echovault.db"}, headers=cg).json()
    assert updated["photo_path"] is None


def test_list_filters_by_trust_and_the_patient_only_gets_verified(client, cg):
    ana = create(client, cg, name="Ana Santos", trust="verified")
    carmen = create(client, cg, name="Carmen Villanueva", relationship="cousin")
    old = create(client, cg, name="Berto Cruz", relationship="neighbor", trust="outdated")

    assert [p["name"] for p in client.get("/people", headers=cg).json()] == [
        "Ana Santos", "Berto Cruz", "Carmen Villanueva",
    ]
    assert [p["id"] for p in client.get("/people?trust=unverified", headers=cg).json()] == [carmen["id"]]
    assert client.get("/people?trust=nonsense", headers=cg).status_code == 422

    # patient mode: verified only, whatever the query says
    for url in ("/people", "/people?trust=unverified", "/people?trust=nonsense"):
        assert [p["id"] for p in client.get(url, headers=PATIENT_HEADERS).json()] == [ana["id"]]
    assert client.get(f"/people/{ana['id']}", headers=PATIENT_HEADERS).status_code == 200
    assert client.get(f"/people/{carmen['id']}", headers=PATIENT_HEADERS).status_code == 404
    assert client.get(f"/people/{old['id']}", headers=PATIENT_HEADERS).status_code == 404
    assert client.get("/people/nobody", headers=cg).status_code == 404


def test_patient_mode_cannot_change_any_record(client, cg, tmp_path):
    saved = create(client, cg, trust="verified")
    url = f"/people/{saved['id']}"
    files = {"photo": ("photo.png", PNG, "image/png")}
    assert client.post("/people", json={"name": "X", "relationship": "y"}, headers=PATIENT_HEADERS).status_code == 403
    assert client.put(url, json={"name": "X"}, headers=PATIENT_HEADERS).status_code == 403
    assert client.delete(url, headers=PATIENT_HEADERS).status_code == 403
    assert client.post(f"{url}/photo", files=files, headers=PATIENT_HEADERS).status_code == 403
    # no role at all, and a caregiver id that is not in the database
    assert client.get("/people").status_code == 401
    unknown = {"X-Role": "caregiver", "X-Caregiver-Id": "not-a-caregiver"}
    assert client.post("/people", json={"name": "X", "relationship": "y"}, headers=unknown).status_code == 401
    assert client.get(url, headers=cg).json() == saved
    assert not list(config.PHOTO_DIR.glob("person-*"))


def test_only_one_person_is_the_fallback_caregiver(client, cg):
    ana = create(client, cg, name="Ana Santos", is_caregiver=True)
    assert ana["is_caregiver"] == 1
    liza = create(client, cg, name="Liza Cruz", relationship="nurse", is_caregiver=1)
    flags = {p["name"]: p["is_caregiver"] for p in client.get("/people", headers=cg).json()}
    assert flags == {"Ana Santos": 0, "Liza Cruz": 1}

    client.put(f"/people/{ana['id']}", json={"is_caregiver": True}, headers=cg)
    flags = {p["name"]: p["is_caregiver"] for p in client.get("/people", headers=cg).json()}
    assert flags == {"Ana Santos": 1, "Liza Cruz": 0}

    # editing someone else does not move the flag, and it can be cleared
    client.put(f"/people/{liza['id']}", json={"notes": "Weekday mornings."}, headers=cg)
    assert client.get(f"/people/{ana['id']}", headers=cg).json()["is_caregiver"] == 1
    client.put(f"/people/{ana['id']}", json={"is_caregiver": False}, headers=cg)
    assert not any(p["is_caregiver"] for p in client.get("/people", headers=cg).json())


def test_delete_leaves_memories_and_schedule_items_with_the_link_cleared(client, cg, db):
    person = create(client, cg, trust="verified")
    memory = make_memory(db, person_id=person["id"], content="Ana loves sunflowers.")
    item = make_schedule_item(db, person_id=person["id"], title="Ana visits")

    assert client.delete(f"/people/{person['id']}", headers=cg).status_code == 204
    assert client.get(f"/people/{person['id']}", headers=cg).status_code == 404
    assert client.delete(f"/people/{person['id']}", headers=cg).status_code == 404

    kept = db.execute("SELECT content, person_id FROM memories WHERE id = ?", (memory["id"],)).fetchone()
    assert tuple(kept) == ("Ana loves sunflowers.", None)
    kept = db.execute("SELECT title, person_id FROM schedule_items WHERE id = ?", (item["id"],)).fetchone()
    assert tuple(kept) == ("Ana visits", None)


# ─────────────────────────────────── PPL-2 ──────────────────────────────────────


@pytest.mark.parametrize("data, ext", [(PNG, ".png"), (JPEG, ".jpg"), (WEBP, ".webp")])
def test_photo_is_saved_under_a_generated_name_and_the_phone_can_load_it(client, cg, data, ext):
    person = create(client, cg, trust="verified")
    # the type comes from the bytes: the name and Content-Type the phone sent are not trusted
    res = upload(client, cg, person["id"], data, filename="../../IMG 0042.heic", content_type="application/octet-stream")
    assert res.status_code == 200, res.text
    saved = res.json()
    assert saved["photo_path"].startswith("person-") and saved["photo_path"].endswith(ext)
    assert "IMG" not in saved["photo_path"]
    assert saved["photo_url"] == f"/photos/{saved['photo_path']}"
    assert (config.PHOTO_DIR / saved["photo_path"]).read_bytes() == data
    assert [p.name for p in config.PHOTO_DIR.iterdir()] == [saved["photo_path"]]

    # the patient's list carries the URL, and the hub serves the file there
    listed = client.get("/people", headers=PATIENT_HEADERS).json()[0]
    assert listed["photo_url"] == saved["photo_url"]
    assert client.get(listed["photo_url"]).content == data


def test_non_images_oversize_files_and_unknown_people_are_rejected(client, cg, monkeypatch):
    person = create(client, cg)
    assert upload(client, cg, person["id"], b"just some notes", "notes.txt", "text/plain").status_code == 422
    # a text file renamed to look like a picture
    assert upload(client, cg, person["id"], b"just some notes", "photo.png", "image/png").status_code == 422
    assert upload(client, cg, person["id"], b"").status_code == 422
    assert client.post(f"/people/{person['id']}/photo", headers=cg).status_code == 422
    assert upload(client, cg, "nobody").status_code == 404

    monkeypatch.setattr(photos, "MAX_PHOTO_BYTES", 64)
    assert upload(client, cg, person["id"], PNG + b"x" * 64).status_code == 413
    assert upload(client, cg, person["id"], PNG + b"x" * (64 - len(PNG))).status_code == 200

    assert len(list(config.PHOTO_DIR.iterdir())) == 1
    assert upload(client, cg, "nobody").status_code == 404
    assert len(list(config.PHOTO_DIR.iterdir())) == 1


def test_replacing_a_photo_removes_the_old_file(client, cg):
    person = create(client, cg)
    first = upload(client, cg, person["id"], PNG).json()["photo_path"]
    second = upload(client, cg, person["id"], JPEG).json()["photo_path"]
    assert first != second
    assert [p.name for p in config.PHOTO_DIR.iterdir()] == [second]


def test_deleting_a_person_removes_their_photo(client, cg):
    person = create(client, cg)
    upload(client, cg, person["id"])
    client.delete(f"/people/{person['id']}", headers=cg)
    assert list(config.PHOTO_DIR.iterdir()) == []


def test_bundled_demo_photos_are_never_deleted(client, cg, db):
    config.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    (config.PHOTO_DIR / "seed-ana.png").write_bytes(PNG)
    ana = make_person(db, photo_path="seed-ana.png")
    miguel = make_person(db, photo_path="seed-ana.png")

    replaced = upload(client, cg, ana["id"], JPEG).json()
    assert (config.PHOTO_DIR / "seed-ana.png").exists()
    client.delete(f"/people/{miguel['id']}", headers=cg)
    assert sorted(p.name for p in config.PHOTO_DIR.iterdir()) == sorted(["seed-ana.png", replaced["photo_path"]])


# ─────────────────────── PPL-4: lookups for other modules ───────────────────────


@pytest.fixture
def family(db):
    return {
        "ana": make_person(db, name="Ana Santos-Reyes", nickname="Ana", relationship="daughter",
                           photo_path="seed-ana.png", is_caregiver=1),
        "miguel": make_person(db, name="Miguel Santos", nickname="Migs", relationship="son"),
        "rosa": make_person(db, name="Rosa Dela Cruz", nickname="Aling Rosa", relationship="neighbor",
                            photo_path="seed-rosa.png"),
        "carmen": make_person(db, name="Carmen Santos", relationship="cousin", trust="unverified",
                              photo_path="seed-carmen.png"),
    }


def test_verified_people_and_people_with_photos(db, family):
    assert [p["name"] for p in service.verified_people(db)] == [
        "Ana Santos-Reyes", "Miguel Santos", "Rosa Dela Cruz",
    ]
    with_photos = service.people_with_photos(db)
    assert [p["photo_url"] for p in with_photos] == ["/photos/seed-ana.png", "/photos/seed-rosa.png"]


def test_find_by_name_matches_names_and_nicknames_of_verified_people(db, family):
    def names(text):
        return [p["name"] for p in service.find_by_name(db, text)]

    assert names("ana") == ["Ana Santos-Reyes"]
    assert names("  ALING   rosa ") == ["Rosa Dela Cruz"]
    assert names("Migs") == ["Miguel Santos"]
    assert names("miguel santos") == ["Miguel Santos"]
    # one word of a name; Carmen Santos is unverified and never comes back
    assert names("Santos") == ["Miguel Santos"]
    assert names("Carmen") == []
    assert names("An") == [] and names("") == [] and names(None) == []
    assert service.find_by_name(db, "Ana")[0]["photo_url"] == "/photos/seed-ana.png"


def test_fallback_caregiver(db, family):
    assert service.fallback_caregiver(db)["name"] == "Ana Santos-Reyes"
    db.execute("UPDATE people SET is_caregiver = 0")
    assert service.fallback_caregiver(db) is None


# ───────────────────────── writes commit in either mode ─────────────────────────


@pytest.mark.parametrize("isolation_level", [None, ""], ids=["autocommit", "default-commit"])
def test_repository_writes_are_committed(db, caregiver, isolation_level):
    conn = sqlite3.connect(config.DB_PATH, isolation_level=isolation_level)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        person = service.validate_person({"name": "Ana", "relationship": "daughter", "is_caregiver": 1})
        person_id = repository.create_person(conn, person, caregiver["id"])
        assert not conn.in_transaction
        repository.update_person(conn, person_id, {**person, "notes": "Lives with you."})
        assert not conn.in_transaction
        repository.set_photo(conn, person_id, "person-x.png")
        assert not conn.in_transaction
        # the other connection sees every write
        assert dict(db.execute("SELECT notes, photo_path FROM people WHERE id = ?", (person_id,)).fetchone()) == {
            "notes": "Lives with you.", "photo_path": "person-x.png",
        }
        assert repository.delete_person(conn, person_id) and not conn.in_transaction
        assert db.execute("SELECT count(*) FROM people").fetchone()[0] == 0
    finally:
        conn.close()
