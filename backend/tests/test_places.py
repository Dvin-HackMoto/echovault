# Places module (PPL-3). From backend/:  py -m pytest tests/test_places.py
#
# Through the real app, like test_people.py.

import pytest

from app import config
from app.features.places import service
from tests.factories import PATIENT_HEADERS, make_memory, make_place

PNG = b"\x89PNG\r\n\x1a\n" + b"png-bytes"
JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-bytes"


@pytest.fixture
def cg(caregiver_client_headers):
    return caregiver_client_headers


def create(client, cg, **fields):
    res = client.post("/places", json={"name": "Malolos Church", **fields}, headers=cg)
    assert res.status_code == 201, res.text
    return res.json()


def upload(client, cg, place_id, data=PNG):
    return client.post(f"/places/{place_id}/photo", files={"photo": ("photo.png", data, "image/png")}, headers=cg)


def test_a_caregiver_can_add_a_place_with_name_description_address_and_photo(client, cg):
    place = create(client, cg, description="Where you hear Mass on Sundays.", address=" Malolos, Bulacan ")
    assert place["name"] == "Malolos Church"
    assert place["description"] == "Where you hear Mass on Sundays."
    assert place["address"] == "Malolos, Bulacan"
    assert place["trust"] == "unverified"
    assert place["photo_path"] is None and place["photo_url"] is None

    saved = upload(client, cg, place["id"]).json()
    assert saved["photo_path"].startswith("place-") and saved["photo_path"].endswith(".png")
    assert saved["photo_url"] == f"/photos/{saved['photo_path']}"
    assert client.get(saved["photo_url"]).content == PNG
    assert client.get(f"/places/{place['id']}", headers=cg).json() == saved


def test_validation_and_partial_update(client, cg):
    assert client.post("/places", json={"name": " "}, headers=cg).status_code == 422
    assert client.post("/places", json={"name": "Home", "trust": "trusted"}, headers=cg).status_code == 422

    place = create(client, cg, address="Malolos, Bulacan", trust="verified")
    updated = client.put(f"/places/{place['id']}", json={"description": "The old church."}, headers=cg).json()
    assert updated["description"] == "The old church."
    assert (updated["name"], updated["address"], updated["trust"]) == ("Malolos Church", "Malolos, Bulacan", "verified")

    assert client.put(f"/places/{place['id']}", json={"name": ""}, headers=cg).status_code == 422
    assert client.put(f"/places/{place['id']}", json={"photo_path": "x.png"}, headers=cg).json()["photo_path"] is None
    assert client.put("/places/nowhere", json={"name": "Home"}, headers=cg).status_code == 404
    assert client.get("/places/nowhere", headers=cg).status_code == 404


def test_patient_mode_only_receives_verified_places_and_cannot_write(client, cg):
    home = create(client, cg, name="Home", trust="verified")
    market = create(client, cg, name="Public Market")

    assert [p["name"] for p in client.get("/places", headers=cg).json()] == ["Home", "Public Market"]
    assert [p["id"] for p in client.get("/places?trust=unverified", headers=cg).json()] == [market["id"]]
    assert client.get("/places?trust=nonsense", headers=cg).status_code == 422

    for url in ("/places", "/places?trust=unverified"):
        assert [p["id"] for p in client.get(url, headers=PATIENT_HEADERS).json()] == [home["id"]]
    assert client.get(f"/places/{home['id']}", headers=PATIENT_HEADERS).status_code == 200
    assert client.get(f"/places/{market['id']}", headers=PATIENT_HEADERS).status_code == 404

    files = {"photo": ("photo.png", PNG, "image/png")}
    assert client.post("/places", json={"name": "X"}, headers=PATIENT_HEADERS).status_code == 403
    assert client.put(f"/places/{home['id']}", json={"name": "X"}, headers=PATIENT_HEADERS).status_code == 403
    assert client.delete(f"/places/{home['id']}", headers=PATIENT_HEADERS).status_code == 403
    assert client.post(f"/places/{home['id']}/photo", files=files, headers=PATIENT_HEADERS).status_code == 403
    assert client.get(f"/places/{home['id']}", headers=cg).json() == home


def test_memories_and_schedule_items_can_reference_a_place_by_id(client, cg, db):
    place = create(client, cg, trust="verified")
    memory = make_memory(db, place_id=place["id"], content="You were married at this church.")

    # through the schedule module's own endpoint: it accepts the id and returns the name
    body = {"title": "Sunday Mass", "kind": "routine", "starts_at": "2026-10-11 08:00:00", "place_id": place["id"]}
    item = client.post("/schedule", json=body, headers=cg)
    assert item.status_code == 201, item.text
    assert item.json()["place_name"] == "Malolos Church"

    # deleting the place keeps both, with the link cleared
    assert client.delete(f"/places/{place['id']}", headers=cg).status_code == 204
    assert client.delete(f"/places/{place['id']}", headers=cg).status_code == 404
    assert db.execute("SELECT place_id FROM memories WHERE id = ?", (memory["id"],)).fetchone()[0] is None
    kept = client.get(f"/schedule/{item.json()['id']}", headers=cg).json()
    assert kept["title"] == "Sunday Mass" and kept["place_id"] is None


def test_photo_rules_match_people(client, cg, db):
    place = create(client, cg)
    assert upload(client, cg, place["id"], b"not an image").status_code == 422
    assert upload(client, cg, "nowhere").status_code == 404

    first = upload(client, cg, place["id"], PNG).json()["photo_path"]
    second = upload(client, cg, place["id"], JPEG).json()["photo_path"]
    assert [p.name for p in config.PHOTO_DIR.iterdir()] == [second] and first != second

    client.delete(f"/places/{place['id']}", headers=cg)
    assert list(config.PHOTO_DIR.iterdir()) == []


def test_verified_places(db):
    make_place(db, name="Home", photo_path="seed-home.png")
    make_place(db, name="Public Market", trust="unverified")
    assert [(p["name"], p["photo_url"]) for p in service.verified_places(db)] == [("Home", "/photos/seed-home.png")]
