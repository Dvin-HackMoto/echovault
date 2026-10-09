# HUB-4: role dependencies, exercised through a throwaway app (no feature routers needed)
import sqlite3

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.database.connection import get_db
from app.middleware import dependencies
from app.middleware.dependencies import get_role, require_caregiver

ACTIVE = {"X-Role": "caregiver", "X-Caregiver-Id": "cg-active"}


@pytest.fixture
def client(db):
    db.execute("INSERT INTO caregivers (id, name, access_level, pin_hash) VALUES ('cg-active', 'Ana', 'admin', 'x')")
    db.execute("INSERT INTO caregivers (id, name, pin_hash, is_active) VALUES ('cg-inactive', 'Old', 'x', 0)")

    app = FastAPI()
    app.state.handler_calls = []

    @app.get("/read")
    def read(role: str = Depends(get_role)):
        return {"role": role}

    @app.post("/write")
    def write(caregiver: dict = Depends(require_caregiver)):
        return caregiver

    # Handlers that really write, so a rejected request would show up as a database change.
    @app.post("/role-write")
    def role_write(role: str = Depends(get_role), conn: sqlite3.Connection = Depends(get_db)):
        app.state.handler_calls.append("role-write")
        conn.execute("UPDATE caregivers SET name = 'changed by role-write'")
        return {"ok": True}

    @app.post("/caregiver-write")
    def caregiver_write(caregiver: dict = Depends(require_caregiver), conn: sqlite3.Connection = Depends(get_db)):
        app.state.handler_calls.append("caregiver-write")
        conn.execute("UPDATE caregivers SET name = 'changed by caregiver-write'")
        return {"ok": True}

    return TestClient(app)


def _dump(db):
    return list(db.iterdump())


def test_patient_and_caregiver_can_read(client):
    assert client.get("/read", headers={"X-Role": "patient"}).json() == {"role": "patient"}
    assert client.get("/read", headers={"X-Role": "caregiver"}).json() == {"role": "caregiver"}


@pytest.mark.parametrize("headers", [{}, {"X-Role": "admin"}, {"X-Role": ""}, {"X-Role": "Patient"}])
def test_missing_or_unknown_role_is_rejected(client, headers):
    assert client.get("/read", headers=headers).status_code == 401
    assert client.post("/write", headers=headers).status_code == 401


def test_patient_cannot_use_caregiver_endpoints(client):
    assert client.post("/write", headers={"X-Role": "patient"}).status_code == 403
    # a patient request that borrows a real caregiver id is still a patient request
    assert client.post("/write", headers={"X-Role": "patient", "X-Caregiver-Id": "cg-active"}).status_code == 403


def test_active_caregiver_is_allowed(client):
    response = client.post("/write", headers=ACTIVE)
    assert response.status_code == 200
    assert response.json() == {"id": "cg-active", "name": "Ana", "relationship": None, "access_level": "admin"}


@pytest.mark.parametrize("caregiver_id", [None, "cg-unknown", "cg-inactive"])
def test_missing_unknown_or_inactive_caregiver_is_rejected(client, caregiver_id):
    headers = {"X-Role": "caregiver"}
    if caregiver_id:
        headers["X-Caregiver-Id"] = caregiver_id
    assert client.post("/write", headers=headers).status_code == 401


def test_patient_reaches_get_role_endpoint_without_caregiver_id(client):
    # 8.8: get_role alone never asks for X-Caregiver-Id
    response = client.get("/read", headers={"X-Role": "patient"})
    assert response.status_code == 200
    assert response.json() == {"role": "patient"}


def test_roles_monkeypatch_changes_check_and_message(client, monkeypatch):
    # 2.8: the accepted set and the 401 detail both come from the module-level ROLES
    monkeypatch.setattr(dependencies, "ROLES", ("patient", "caregiver", "guest"))
    assert client.get("/read", headers={"X-Role": "guest"}).json() == {"role": "guest"}
    rejected = client.get("/read", headers={"X-Role": "admin"})
    assert rejected.status_code == 401
    assert rejected.json()["detail"] == "X-Role header must be one of: patient, caregiver, guest"

    monkeypatch.setattr(dependencies, "ROLES", ("patient",))
    rejected = client.get("/read", headers={"X-Role": "caregiver"})
    assert rejected.status_code == 401
    assert rejected.json()["detail"] == "X-Role header must be one of: patient"


@pytest.mark.parametrize(
    ("path", "headers", "status"),
    [
        ("/role-write", {"X-Role": "admin"}, 401),
        ("/role-write", {}, 401),
        ("/caregiver-write", {"X-Role": "admin"}, 401),
        ("/caregiver-write", {"X-Role": "patient"}, 403),
        ("/caregiver-write", {"X-Role": "patient", "X-Caregiver-Id": "cg-active"}, 403),
        ("/caregiver-write", {"X-Role": "caregiver"}, 401),
        ("/caregiver-write", {"X-Role": "caregiver", "X-Caregiver-Id": "cg-inactive"}, 401),
        ("/caregiver-write", {"X-Role": "caregiver", "X-Caregiver-Id": "cg-unknown"}, 401),
    ],
)
def test_rejected_request_never_runs_writing_handler(client, db, path, headers, status):
    # 8.7: a rejection stops before the handler, so nothing is written
    before = _dump(db)
    assert client.post(path, headers=headers).status_code == status
    assert client.app.state.handler_calls == []
    assert _dump(db) == before


def test_allowed_request_does_run_writing_handler(client, db):
    # control case: the writing handlers do change the database when allowed
    before = _dump(db)
    assert client.post("/caregiver-write", headers=ACTIVE).status_code == 200
    assert client.app.state.handler_calls == ["caregiver-write"]
    assert _dump(db) != before
