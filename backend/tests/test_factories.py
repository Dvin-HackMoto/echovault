# tests/factories.py: valid rows, working overrides, real ids, headers that pass the role checks
import json

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app import constants
from app.features.auth.service import check_pin
from app.middleware.dependencies import get_role, require_caregiver
from tests import factories
from tests.factories import (
    PATIENT_HEADERS, caregiver_headers, make_caregiver, make_medication, make_memory, make_person,
    make_place, make_schedule_item, make_trivia_question,
)

FACTORIES = {
    "caregivers": make_caregiver, "people": make_person, "places": make_place, "memories": make_memory,
    "schedule_items": make_schedule_item, "medications": make_medication,
    "trivia_questions": make_trivia_question,
}


def count(db, table):
    return db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


@pytest.mark.parametrize("table", FACTORIES)
def test_factory_row_is_valid_and_complete(db, table):
    row = FACTORIES[table](db)
    stored = dict(db.execute(f"SELECT * FROM {table} WHERE id = ?", (row["id"],)).fetchone())
    # defaults from the database are part of the returned dict
    assert {key: row[key] for key in stored} == stored
    assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_ids_are_unique_and_not_seed_ids(db):
    ids = [FACTORIES[table](db)["id"] for table in FACTORIES for _ in range(3)]
    ids += [time["id"] for _ in range(3) for time in make_medication(db, times=("08:00", "20:00"))["times"]]
    all_ids = [row[0] for table in (*FACTORIES, "medication_times") for row in db.execute(f"SELECT id FROM {table}")]
    assert len(set(all_ids)) == len(all_ids)
    assert set(ids) <= set(all_ids)
    assert not any(row_id.startswith("seed-") for row_id in all_ids)


def test_overrides_are_applied(db):
    person = make_person(db, id="p1", name="Ana", trust=constants.TRUST_UNVERIFIED, is_caregiver=1)
    assert (person["id"], person["name"], person["trust"], person["is_caregiver"]) == \
        ("p1", "Ana", constants.TRUST_UNVERIFIED, 1)
    place = make_place(db, name="Church", address="Malolos")
    assert (place["name"], place["address"]) == ("Church", "Malolos")
    item = make_schedule_item(db, kind=constants.SCHEDULE_MEAL, person_id=person["id"], recurrence="daily")
    assert (item["kind"], item["person_id"], item["recurrence"]) == (constants.SCHEDULE_MEAL, "p1", "daily")
    viewer = make_caregiver(db, access_level=constants.ACCESS_VIEWER, is_active=0, pin_hash="x")
    assert (viewer["access_level"], viewer["is_active"], viewer["pin_hash"]) == (constants.ACCESS_VIEWER, 0, "x")


def test_caregiver_pin_is_hashed(db, monkeypatch):
    caregiver = make_caregiver(db, pin="4321")
    assert caregiver["pin_hash"] != "4321"
    assert check_pin("4321", caregiver["pin_hash"])
    monkeypatch.setattr(factories, "hash_pin", lambda pin: f"fake${pin}")
    assert make_caregiver(db, pin="1111")["pin_hash"] == "fake$1111"


def test_memory_defaults_to_a_verified_identity_record(db):
    memory = make_memory(db)
    assert (memory["category"], memory["trust"], memory["validity"]) == \
        (constants.CATEGORY_IDENTITY, constants.TRUST_VERIFIED, constants.VALIDITY_PERSISTENT)
    assert memory["verified_at"]
    assert db.execute("SELECT 1 FROM caregivers WHERE id = ?", (memory["verified_by"],)).fetchone()

    before = count(db, "caregivers")
    unverified = make_memory(db, trust=constants.TRUST_UNVERIFIED, category=constants.CATEGORY_ROUTINE)
    assert (unverified["verified_by"], unverified["verified_at"]) == (None, None)
    assert count(db, "caregivers") == before
    # the keyword search sees factory memories too
    assert db.execute("SELECT COUNT(*) FROM memories_fts").fetchone()[0] == 2


def test_medication_inserts_its_times(db):
    medication = make_medication(db, times=("08:00", "20:00"), instructions="after meals")
    assert [time["time_of_day"] for time in medication["times"]] == ["08:00", "20:00"]
    assert all(time["medication_id"] == medication["id"] for time in medication["times"])
    assert count(db, "medication_times") == 2
    assert make_medication(db, times=())["times"] == []


def test_personal_trivia_links_to_a_verified_memory(db):
    question = make_trivia_question(db, kind=constants.TRIVIA_PERSONAL, choices=["A", "B"])
    trust = db.execute("SELECT trust FROM memories WHERE id = ?", (question["memory_id"],)).fetchone()[0]
    assert trust == constants.TRUST_VERIFIED
    assert json.loads(question["choices"]) == ["A", "B"]
    general = make_trivia_question(db)
    assert (general["kind"], general["memory_id"]) == (constants.TRIVIA_GENERAL, None)
    memory = make_memory(db)
    assert make_trivia_question(db, kind=constants.TRIVIA_PERSONAL, memory_id=memory["id"])["memory_id"] == memory["id"]


def test_headers_pass_the_role_checks(db, caregiver, caregiver_client_headers):
    app = FastAPI()

    @app.get("/read")
    def read(role: str = Depends(get_role)):
        return {"role": role}

    @app.post("/write")
    def write(who: dict = Depends(require_caregiver)):
        return who

    client = TestClient(app)
    assert caregiver_client_headers == caregiver_headers(caregiver)
    response = client.post("/write", headers=caregiver_client_headers)
    assert response.status_code == 200
    assert response.json()["id"] == caregiver["id"]
    assert response.json()["access_level"] == constants.ACCESS_ADMIN
    assert client.get("/read", headers=PATIENT_HEADERS).json() == {"role": constants.ROLE_PATIENT}
    assert client.post("/write", headers=PATIENT_HEADERS).status_code == 403


def test_caregiver_fixture_is_an_active_admin(caregiver):
    assert caregiver["access_level"] == constants.ACCESS_ADMIN
    assert caregiver["is_active"] == 1
    assert check_pin("0000", caregiver["pin_hash"])
