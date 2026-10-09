# Auth and access control: AUTH-1 PIN hashing, AUTH-2 PIN login, AUTH-3 access levels
import logging

import pytest
from fastapi import APIRouter, Depends

from app.constants import ACCESS_ADMIN, ACCESS_EDITOR, ACCESS_VIEWER
from app.features.auth import service
from app.middleware.dependencies import get_role
from tests.factories import PATIENT_HEADERS, caregiver_headers, make_caregiver


@pytest.fixture(autouse=True)
def fresh_throttle(monkeypatch):
    """Each test starts with no wrong PINs counted."""
    monkeypatch.setattr(service, "throttle", service.LoginThrottle())


def login(client, pin, **extra):
    return client.post("/auth/pin", json={"pin": pin, **extra})


# ─────────────────────────────── AUTH-1 PIN hashing ───────────────────────────────


def test_a_pin_verifies_against_its_hash_and_another_pin_does_not():
    pin_hash = service.hash_pin("2468")
    assert service.check_pin("2468", pin_hash)
    assert not service.check_pin("2469", pin_hash)
    assert not service.check_pin("2468", "garbage")
    assert not service.check_pin("2468", None)


def test_hashes_are_salted_so_the_same_pin_differs_between_caregivers(db):
    first = make_caregiver(db, pin_hash=service.hash_pin("1111"))
    second = make_caregiver(db, pin_hash=service.hash_pin("1111"))
    assert first["pin_hash"] != second["pin_hash"]
    assert service.check_pin("1111", first["pin_hash"]) and service.check_pin("1111", second["pin_hash"])


def test_no_plain_pin_is_stored(db):
    make_caregiver(db, pin_hash=service.hash_pin("8642"))
    for row in db.execute("SELECT * FROM caregivers").fetchall():
        assert all("8642" not in str(value) for value in dict(row).values())


@pytest.mark.parametrize("pin, valid", [
    ("1234", True), ("12345678", True), ("123", False), ("123456789", False),
    ("12a4", False), (" 1234", False), (1234, False), (None, False),
])
def test_pin_format_rule_for_setting_a_pin(pin, valid):
    assert service.is_valid_pin(pin) is valid


# ─────────────────────────────── AUTH-2 PIN login ────────────────────────────────


def test_correct_pin_returns_id_name_and_access_level(client, db):
    ana = make_caregiver(db, name="Ana", relationship="daughter", access_level=ACCESS_ADMIN, pin="1357")
    res = login(client, "1357")
    assert res.status_code == 200
    assert res.json() == {"id": ana["id"], "name": "Ana", "relationship": "daughter", "access_level": ACCESS_ADMIN}


def test_login_needs_no_role_header(client, db):
    make_caregiver(db, pin="1357")
    assert client.post("/auth/pin", json={"pin": "1357"}, headers=PATIENT_HEADERS).status_code == 200
    assert client.post("/auth/pin", json={"pin": "1357"}).status_code == 200


def test_wrong_pin_is_401(client, db):
    make_caregiver(db, pin="1357")
    res = login(client, "7531")
    assert res.status_code == 401
    assert res.json() == {"detail": "Wrong PIN"}


def test_inactive_caregiver_is_401(client, db):
    make_caregiver(db, pin="1357", is_active=0)
    assert login(client, "1357").status_code == 401


def test_the_right_caregiver_is_found_among_several(client, db):
    make_caregiver(db, pin="1111")
    liza = make_caregiver(db, name="Liza", pin="2222", access_level=ACCESS_EDITOR)
    make_caregiver(db, pin="3333")
    assert login(client, "2222").json()["id"] == liza["id"]


def test_shared_pin_asks_which_caregiver_then_accepts_caregiver_id(client, db):
    first = make_caregiver(db, name="First", pin="4444")
    second = make_caregiver(db, name="Second", pin="4444")
    res = login(client, "4444")
    assert res.status_code == 409
    assert {c["id"] for c in res.json()["detail"]["caregivers"]} == {first["id"], second["id"]}
    chosen = login(client, "4444", caregiver_id=second["id"])
    assert chosen.status_code == 200 and chosen.json()["id"] == second["id"]
    # caregiver_id narrows the check; it never lets another caregiver's PIN in
    assert login(client, "4444", caregiver_id=make_caregiver(db, pin="5555")["id"]).status_code == 401


@pytest.mark.parametrize("body", [{}, {"pin": ""}, {"pin": 1357}, {"pin": None}, ["1357"], "1357"])
def test_missing_or_malformed_pin_is_422_and_never_echoed(client, db, body):
    make_caregiver(db, pin="1357")
    res = client.post("/auth/pin", json=body)
    assert res.status_code == 422
    assert "1357" not in res.text


def test_pin_never_appears_in_responses_or_logs(client, db, caplog, capsys):
    make_caregiver(db, pin="1357")
    with caplog.at_level(logging.DEBUG):
        responses = [login(client, "1357"), login(client, "9753"), client.get("/openapi.json")]
    for res in responses:
        assert "pin_hash" not in res.text
    assert "9753" not in responses[1].text
    assert "1357" not in caplog.text and "9753" not in caplog.text
    out = capsys.readouterr()
    assert "1357" not in out.out + out.err and "9753" not in out.out + out.err


def test_me_returns_the_caregiver_for_the_header(client, db):
    liza = make_caregiver(db, name="Liza", relationship="nurse", access_level=ACCESS_EDITOR)
    res = client.get("/auth/me", headers=caregiver_headers(liza))
    assert res.status_code == 200
    assert res.json() == {"id": liza["id"], "name": "Liza", "relationship": "nurse", "access_level": ACCESS_EDITOR}


def test_me_rejects_patients_and_unknown_or_inactive_caregivers(client, db):
    gone = make_caregiver(db, is_active=0)
    assert client.get("/auth/me", headers=PATIENT_HEADERS).status_code == 403
    assert client.get("/auth/me", headers={"X-Role": "caregiver"}).status_code == 401
    assert client.get("/auth/me", headers=caregiver_headers({"id": "nobody"})).status_code == 401
    assert client.get("/auth/me", headers=caregiver_headers(gone)).status_code == 401
    assert client.get("/auth/me").status_code == 401


# ─────────────────────────── PIN guessing is slowed down ──────────────────────────


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_too_many_wrong_pins_lock_login_for_a_while(client, db, monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(service, "throttle", service.LoginThrottle(clock))
    make_caregiver(db, pin="1357")
    for _ in range(service.MAX_FAILED_ATTEMPTS):
        assert login(client, "0000").status_code == 401
    locked = login(client, "1357")  # even the right PIN waits
    assert locked.status_code == 429
    assert locked.headers["Retry-After"] == str(service.LOCKOUT_SECONDS)
    clock.now += service.LOCKOUT_SECONDS
    assert login(client, "1357").status_code == 200


def test_a_correct_pin_resets_the_count(client, db):
    make_caregiver(db, pin="1357")
    for _ in range(service.MAX_FAILED_ATTEMPTS - 1):
        login(client, "0000")
    assert login(client, "1357").status_code == 200
    for _ in range(service.MAX_FAILED_ATTEMPTS - 1):
        assert login(client, "0000").status_code == 401


# ─────────────────────────────── AUTH-3 access levels ─────────────────────────────


@pytest.fixture
def levels(db):
    return {level: caregiver_headers(make_caregiver(db, access_level=level))
            for level in (ACCESS_ADMIN, ACCESS_EDITOR, ACCESS_VIEWER)}


@pytest.fixture
def records_client(client):
    """The real app plus a stand-in feature with create, update and delete, the way
    any feature router (people, memories, schedule...) declares its routes."""
    things = APIRouter()

    @things.post("/things")
    def create(role=Depends(get_role)):
        return {"created": True}

    @things.put("/things/{thing_id}")
    def update(thing_id: str, role=Depends(get_role)):
        return {"updated": thing_id}

    @things.delete("/things/{thing_id}")
    def delete(thing_id: str, role=Depends(get_role)):
        return {"deleted": thing_id}

    client.app.include_router(things)
    return client


@pytest.mark.parametrize("method, path", [("POST", "/things"), ("PUT", "/things/1"), ("DELETE", "/things/1")])
def test_viewer_gets_403_on_create_update_delete(records_client, levels, method, path):
    res = records_client.request(method, path, headers=levels[ACCESS_VIEWER])
    assert res.status_code == 403
    assert res.json()["detail"] == "Viewer access is read-only"


def test_editor_creates_and_updates_but_only_admin_deletes(records_client, levels):
    editor, admin = levels[ACCESS_EDITOR], levels[ACCESS_ADMIN]
    assert records_client.post("/things", headers=editor).status_code == 200
    assert records_client.put("/things/1", headers=editor).status_code == 200
    denied = records_client.delete("/things/1", headers=editor)
    assert denied.status_code == 403 and denied.json()["detail"] == "Only an admin can delete records"
    assert records_client.delete("/things/1", headers=admin).status_code == 200


def test_viewer_can_still_read_and_ask(records_client, levels):
    viewer = levels[ACCESS_VIEWER]
    assert records_client.get("/settings", headers=viewer).status_code == 200
    assert records_client.get("/auth/me", headers=viewer).status_code == 200
    # the real assistant route: asking is a POST that changes no records
    assert records_client.post("/assistant/ask", json={"text": "What is next?"}, headers=viewer).status_code == 200


def test_patient_requests_are_not_affected(records_client):
    assert records_client.post("/things", headers=PATIENT_HEADERS).status_code == 200


def test_unknown_caregiver_is_left_to_the_route(client):
    # the guard does not answer for caregivers it cannot find: require_caregiver does (401)
    res = client.put("/settings", json={"trivia_frequency_min": 60}, headers=caregiver_headers({"id": "nobody"}))
    assert res.status_code == 401


def test_viewer_cannot_change_settings_but_editor_can(client, levels):
    body = {"trivia_frequency_min": 60}
    assert client.put("/settings", json=body, headers=levels[ACCESS_VIEWER]).status_code == 403
    assert client.put("/settings", json=body, headers=levels[ACCESS_EDITOR]).status_code == 200


def test_only_admin_can_import_a_backup(client, levels):
    for level in (ACCESS_VIEWER, ACCESS_EDITOR):
        res = client.post("/backup/import", headers=levels[level], files={"file": ("b.zip", b"x")})
        assert res.status_code == 403, level
