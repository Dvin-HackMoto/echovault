# Medications module (MED-1..3). From backend/:  py -m pytest tests/test_medications.py
#
# These tests do not depend on mock.py: they build their own in-memory database, add a
# real caregiver row and send the same headers the phones send, so they pass against
# the mocks, the minimal hub on main, and feature/01-hub-foundation. Every test runs
# twice: with an autocommit connection and with Python's default one, because the
# two hub foundations use different modes and a missed commit would lose writes.

import sqlite3
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.features.medications import deps, service
from app.features.medications.router import router

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "app" / "database" / "schema.sql"
NOW = datetime(2026, 10, 9, 12, 0)  # a Friday, noon
PATIENT = {"X-Role": "patient"}


def schema_sql():
    real = SCHEMA_PATH.read_text(encoding="utf-8")
    if "CREATE TABLE" in real.upper():
        return real
    from app.features.medications.mock import FALLBACK_SCHEMA  # until HUB-2 writes schema.sql

    return FALLBACK_SCHEMA


@pytest.fixture(params=[None, ""], ids=["autocommit", "default-commit"])
def conn(request):
    conn = sqlite3.connect(":memory:", isolation_level=request.param, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_sql())
    conn.execute(
        "INSERT INTO caregivers (id, name, access_level, pin_hash) VALUES ('cg-1', 'Test Caregiver', 'admin', 'x')"
    )
    conn.commit()
    yield conn
    conn.close()


@pytest.fixture
def committed(conn):
    """Asserts at the end of the test that the module left no uncommitted writes."""
    yield
    assert not conn.in_transaction, "a write was not committed"


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(service, "manila_now", lambda: NOW)


@pytest.fixture
def client(conn, committed):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[deps.get_db] = lambda: conn
    return TestClient(app)


CAREGIVER = {"X-Role": "caregiver", "X-Caregiver-Id": "cg-1"}


def med(**fields):
    base = {"name": "Metformin", "dose": "1 tablet", "instructions": "after breakfast",
            "times": [{"time_of_day": "08:00"}]}
    return {**base, **fields}


def create(client, **fields):
    res = client.post("/medications", json=med(**fields), headers=CAREGIVER)
    assert res.status_code == 201, res.text
    return res.json()


def log_for(client, med_id, time_of_day):
    return next(d for d in client.get("/medications/today", headers=PATIENT).json()
                if d["medication_id"] == med_id and d["time_of_day"] == time_of_day)


# ───────────────────────────── MED-1: medications ───────────────────────────────


def test_create_with_several_times(client):
    created = create(client, times=[{"time_of_day": "20:00"}, {"time_of_day": "8:00", "days": "fr,mo"}])
    assert created["created_by"] == "cg-1"
    assert [(t["time_of_day"], t["days"]) for t in created["times"]] == [("08:00", "MO,FR"), ("20:00", "daily")]


@pytest.mark.parametrize("bad", [
    {"name": " "},
    {"dose": None},
    {"times": []},
    {"times": [{"time_of_day": "25:00"}]},
    {"times": [{"time_of_day": "8am"}]},
    {"times": [{"time_of_day": "08:00", "days": "MO,XX"}]},
    {"start_date": "2026-10-10", "end_date": "2026-10-01"},
])
def test_create_rejects_invalid_fields(client, bad):
    assert client.post("/medications", json=med(**bad), headers=CAREGIVER).status_code == 422


def test_only_caregivers_write(client):
    assert client.post("/medications", json=med(), headers=PATIENT).status_code == 403
    # main's hub answers 403 for a missing caregiver id, feature/01-hub-foundation 401
    assert client.post("/medications", json=med(), headers={"X-Role": "caregiver"}).status_code in (401, 403)
    created = create(client)
    assert client.put(f"/medications/{created['id']}", json={"dose": "2"}, headers=PATIENT).status_code == 403
    assert client.delete(f"/medications/{created['id']}", headers=PATIENT).status_code == 403


def test_update_is_partial_and_can_replace_times(client):
    created = create(client)
    url = f"/medications/{created['id']}"
    kept = client.put(url, json={"dose": "2 tablets"}, headers=CAREGIVER).json()
    assert kept["dose"] == "2 tablets" and [t["time_of_day"] for t in kept["times"]] == ["08:00"]
    replaced = client.put(url, json={"times": [{"time_of_day": "09:30"}]}, headers=CAREGIVER).json()
    assert [t["time_of_day"] for t in replaced["times"]] == ["09:30"]


def test_delete_removes_times_and_logs(client, conn):
    created = create(client)
    client.get("/medications/today", headers=PATIENT)
    assert client.delete(f"/medications/{created['id']}", headers=CAREGIVER).status_code == 204
    for table in ("medication_times", "medication_logs"):
        assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0


def test_patient_sees_only_active_medicines(client):
    create(client, name="Active")
    create(client, name="Stopped", is_active=False)
    assert [m["name"] for m in client.get("/medications", headers=PATIENT).json()] == ["Active"]
    assert len(client.get("/medications", headers=CAREGIVER).json()) == 2


# ─────────────────────────── MED-2: daily dose logs ─────────────────────────────


def test_generation_follows_days_dates_and_active(conn):
    times = [{"time_of_day": "08:00", "days": "daily"}]
    for name, extra, days in [
        ("Daily", {}, "daily"),
        ("Fridays", {}, "MO,WE,FR"),
        ("Tuesdays", {}, "TU"),
        ("Not started", {"start_date": "2026-10-10"}, "daily"),
        ("Ended", {"end_date": "2026-10-08"}, "daily"),
        ("Inactive", {"is_active": 0}, "daily"),
    ]:
        m = service.validate_medication({"name": name, "dose": "1", **extra})
        conn.execute(
            "INSERT INTO medications (id, name, dose, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            (name, name, "1", m["start_date"], m["end_date"], m["is_active"]),
        )
        conn.execute(
            "INSERT INTO medication_times (id, medication_id, time_of_day, days) VALUES (?, ?, ?, ?)",
            (name + "-t", name, times[0]["time_of_day"], days),
        )
    friday = date(2026, 10, 9)
    assert service.generate_logs(conn, friday) == 2
    assert service.generate_logs(conn, friday) == 0  # no duplicates
    rows = conn.execute("SELECT medication_id, due_at, status, confirmed_by FROM medication_logs").fetchall()
    assert sorted(r["medication_id"] for r in rows) == ["Daily", "Fridays"]
    assert all(r["due_at"] == "2026-10-09 08:00:00" for r in rows)
    assert all((r["status"], r["confirmed_by"]) == ("unconfirmed", "none") for r in rows)


def test_changing_a_time_drops_untouched_doses_only(client):
    a = create(client, name="A", times=[{"time_of_day": "08:00"}])
    b = create(client, name="B", times=[{"time_of_day": "08:00"}])
    answered = log_for(client, b["id"], "08:00")
    client.post(f"/medications/logs/{answered['id']}", json={"status": "taken"}, headers=PATIENT)
    for m in (a, b):
        client.put(f"/medications/{m['id']}", json={"times": [{"time_of_day": "09:00"}]}, headers=CAREGIVER)
    doses = {(d["name"], d["time_of_day"], d["status"]) for d in client.get("/medications/today", headers=PATIENT).json()}
    assert doses == {("A", "09:00", "unconfirmed"), ("B", "08:00", "taken"), ("B", "09:00", "unconfirmed")}


# ─────────────────────────── MED-3: confirmation ────────────────────────────────


def test_patient_confirmation(client):
    created = create(client)
    dose = log_for(client, created["id"], "08:00")
    res = client.post(f"/medications/logs/{dose['id']}", json={"status": "taken"}, headers=PATIENT).json()
    assert res["status"] == "taken" and res["confirmed_by"] == "patient" and res["responded_at"]
    assert client.post(f"/medications/logs/{dose['id']}", json={"status": "unconfirmed"},
                       headers=PATIENT).status_code == 422


def test_caregiver_correction_wins(client):
    created = create(client)
    dose = log_for(client, created["id"], "08:00")
    url = f"/medications/logs/{dose['id']}"
    client.post(url, json={"status": "taken"}, headers=PATIENT)
    fixed = client.post(url, json={"status": "skipped", "note": "Pill found on the table"}, headers=CAREGIVER).json()
    assert (fixed["status"], fixed["confirmed_by"], fixed["note"]) == ("skipped", "caregiver", "Pill found on the table")
    assert client.post(url, json={"status": "taken"}, headers=PATIENT).status_code == 409
    undone = client.post(url, json={"status": "unconfirmed"}, headers=CAREGIVER).json()
    assert (undone["confirmed_by"], undone["responded_at"]) == ("none", None)


def test_caregiver_confirmation_needs_a_real_caregiver(client):
    created = create(client)
    dose = log_for(client, created["id"], "08:00")
    url = f"/medications/logs/{dose['id']}"
    for bad in ({"X-Role": "caregiver", "X-Caregiver-Id": "nobody"}, {"X-Role": "caregiver"}):
        assert client.post(url, json={"status": "taken"}, headers=bad).status_code == 403
    assert log_for(client, created["id"], "08:00")["status"] == "unconfirmed"


def test_registered_in_the_hub_app():
    from app.main import app

    paths = set(app.openapi()["paths"])
    assert {"/medications", "/medications/today", "/medications/logs/{log_id}"} <= paths


def test_nothing_is_taken_without_a_request(client):
    create(client, times=[{"time_of_day": "06:00"}, {"time_of_day": "08:00"}])
    client.get("/medications/today", headers=PATIENT)
    client.get("/medications/next", headers=PATIENT)
    client.get("/medications/logs?overdue=true", headers=CAREGIVER)
    assert {d["status"] for d in client.get("/medications/today", headers=PATIENT).json()} == {"unconfirmed"}


def test_overdue_doses_for_dashboard(client):
    created = create(client, times=[{"time_of_day": "07:00"}, {"time_of_day": "08:00"}, {"time_of_day": "20:00"}])
    seven = log_for(client, created["id"], "07:00")
    client.post(f"/medications/logs/{seven['id']}", json={"status": "taken"}, headers=PATIENT)
    overdue = client.get("/medications/logs?overdue=true", headers=CAREGIVER).json()
    assert [d["time_of_day"] for d in overdue] == ["08:00"]  # 07:00 answered, 20:00 not due yet
    assert client.get("/medications/logs?overdue=true", headers=PATIENT).status_code == 403


# ─────────────────────────── helpers for other modules ──────────────────────────


def test_next_doses_groups_shared_times_and_rolls_to_tomorrow(client, monkeypatch):
    create(client, name="Metformin", times=[{"time_of_day": "08:00"}])
    create(client, name="Vitamin B", times=[{"time_of_day": "08:00"}])
    create(client, name="Losartan", times=[{"time_of_day": "20:00"}])
    assert [d["name"] for d in client.get("/medications/next", headers=PATIENT).json()] == ["Losartan"]
    monkeypatch.setattr(service, "manila_now", lambda: datetime(2026, 10, 9, 21, 0))
    nxt = client.get("/medications/next", headers=PATIENT).json()
    assert [(d["name"], d["due_at"]) for d in nxt] == [
        ("Metformin", "2026-10-10 08:00:00"), ("Vitamin B", "2026-10-10 08:00:00")]


def test_photo_upload_replaces_old_file(client, monkeypatch, tmp_path):
    monkeypatch.setattr(service, "photo_dir", lambda: tmp_path)
    created = create(client)
    url = f"/medications/{created['id']}/photo"
    first = client.post(url, files={"photo": ("pill.png", b"png-bytes", "image/png")}, headers=CAREGIVER).json()
    assert (tmp_path / first["photo_path"]).read_bytes() == b"png-bytes"
    assert first["photo_url"] == f"/photos/{first['photo_path']}"
    second = client.post(url, files={"photo": ("box.jpg", b"jpg", "image/jpeg")}, headers=CAREGIVER).json()
    assert not (tmp_path / first["photo_path"]).exists() and (tmp_path / second["photo_path"]).exists()
    assert client.post(url, files={"photo": ("notes.txt", b"x", "text/plain")}, headers=CAREGIVER).status_code == 422
