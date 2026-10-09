# Schedule module (SCH-1..3). From backend/:  py -m pytest tests/test_schedule.py
#
# These tests do not depend on mock.py: they build their own in-memory database and
# replace the role checks with header-only doubles, so they keep passing after the
# real HUB-2 / HUB-4 code replaces the mocks.

import os
import sqlite3
from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from app.features.schedule import deps, service
from app.features.schedule.demo import seed_demo_schedule
from app.features.schedule.router import router

CAREGIVER = {"X-Role": "caregiver"}
PATIENT = {"X-Role": "patient"}
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "database", "schema.sql")


def schema_sql():
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        real = f.read()
    if "CREATE TABLE" in real.upper():
        return real
    from app.features.schedule.mock import FALLBACK_SCHEMA  # until HUB-2 writes schema.sql

    return FALLBACK_SCHEMA


def fake_get_role(x_role: str | None = Header(default=None)):
    if x_role not in ("patient", "caregiver"):
        raise HTTPException(401)
    return x_role


def fake_require_caregiver(x_role: str | None = Header(default=None)):
    if fake_get_role(x_role) != "caregiver":
        raise HTTPException(403)
    return x_role


@pytest.fixture
def conn():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(schema_sql())
    conn.execute(
        "INSERT INTO people (id, name, relationship, trust) VALUES ('ana', 'Ana', 'daughter', 'verified')"
    )
    conn.execute("INSERT INTO places (id, name) VALUES ('church', 'Malolos Church')")
    yield conn
    conn.close()


@pytest.fixture
def client(conn):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[deps.get_db] = lambda: conn
    app.dependency_overrides[deps.get_role] = fake_get_role
    app.dependency_overrides[deps.require_caregiver] = fake_require_caregiver
    return TestClient(app)


def item(**fields):
    base = {"title": "Lunch", "kind": "meal", "starts_at": "2026-10-01 12:00:00"}
    return {**base, **fields}


# ─────────────────────────────── SCH-1: CRUD ────────────────────────────────────


def test_create_one_off_and_recurring(client):
    one = client.post("/schedule", json=item(title="Check-up", kind="appointment"), headers=CAREGIVER)
    rec = client.post("/schedule", json=item(recurrence="weekly:we,mo"), headers=CAREGIVER)
    assert one.status_code == 201 and one.json()["recurrence"] is None
    assert rec.status_code == 201 and rec.json()["recurrence"] == "weekly:MO,WE"
    assert len(client.get("/schedule", headers=PATIENT).json()) == 2


@pytest.mark.parametrize("bad", [
    {"title": " "},
    {"kind": "party"},
    {"starts_at": "tomorrow"},
    {"recurrence": "weekly:XX"},
    {"recurrence": "monthly:32"},
    {"recurrence": "yearly"},
    {"ends_on": "2026-09-01"},
])
def test_create_rejects_invalid_fields(client, bad):
    assert client.post("/schedule", json=item(**bad), headers=CAREGIVER).status_code == 422


def test_links_person_and_place(client):
    res = client.post("/schedule", json=item(person_id="ana", place_id="church"), headers=CAREGIVER)
    assert res.json()["person_name"] == "Ana" and res.json()["place_name"] == "Malolos Church"
    missing = client.post("/schedule", json=item(person_id="nobody"), headers=CAREGIVER)
    assert missing.status_code == 422


def test_writes_need_caregiver(client):
    assert client.post("/schedule", json=item(), headers=PATIENT).status_code == 403
    assert client.get("/schedule").status_code == 401
    created = client.post("/schedule", json=item(), headers=CAREGIVER).json()
    assert client.put(f"/schedule/{created['id']}", json={"title": "x"}, headers=PATIENT).status_code == 403
    assert client.delete(f"/schedule/{created['id']}", headers=PATIENT).status_code == 403


def test_update_is_partial_and_validated(client):
    created = client.post("/schedule", json=item(recurrence="daily"), headers=CAREGIVER).json()
    url = f"/schedule/{created['id']}"
    updated = client.put(url, json={"title": "Merienda", "starts_at": "2026-10-01 15:30"}, headers=CAREGIVER)
    assert updated.json()["title"] == "Merienda"
    assert updated.json()["starts_at"] == "2026-10-01 15:30:00"
    assert updated.json()["recurrence"] == "daily"
    assert client.put(url, json={"recurrence": "sometimes"}, headers=CAREGIVER).status_code == 422


def test_delete(client):
    created = client.post("/schedule", json=item(), headers=CAREGIVER).json()
    assert client.delete(f"/schedule/{created['id']}", headers=CAREGIVER).status_code == 204
    assert client.get(f"/schedule/{created['id']}", headers=PATIENT).status_code == 404


# ──────────────────────────── SCH-2: recurrence ─────────────────────────────────


def row(**fields):
    base = {"id": "x", "title": "x", "starts_at": "2026-10-01 08:00:00", "recurrence": None,
            "ends_on": None, "is_active": 1, "remind_before_min": 30, "duration_min": None}
    return {**base, **fields}


def test_one_off_only_on_its_date():
    one = row()
    assert service.occurs_on(one, date(2026, 10, 1))
    assert not service.occurs_on(one, date(2026, 10, 2))


def test_weekly_and_monthly():
    weekly = row(recurrence="weekly:MO,WE")  # 2026-10-05 is a Monday
    assert service.occurs_on(weekly, date(2026, 10, 5))
    assert service.occurs_on(weekly, date(2026, 10, 7))
    assert not service.occurs_on(weekly, date(2026, 10, 6))
    monthly = row(recurrence="monthly:31")
    assert service.occurs_on(monthly, date(2026, 10, 31))
    assert service.occurs_on(monthly, date(2026, 11, 30))  # shorter month: last day
    assert not service.occurs_on(monthly, date(2026, 11, 29))


def test_ends_on_and_inactive_are_left_out():
    ended = row(recurrence="daily", ends_on="2026-10-03")
    assert service.occurs_on(ended, date(2026, 10, 3))
    assert not service.occurs_on(ended, date(2026, 10, 4))
    assert service.occurrences_on([row(recurrence="daily", is_active=0)], date(2026, 10, 2)) == []


def test_today_in_time_order(client):
    client.post("/schedule", json=item(title="Dinner", starts_at="2026-10-01 18:00", recurrence="daily"), headers=CAREGIVER)
    client.post("/schedule", json=item(title="Breakfast", starts_at="2026-10-01 07:00", recurrence="daily"), headers=CAREGIVER)
    client.post("/schedule", json=item(title="Check-up", kind="appointment", starts_at="2026-10-09 10:00"), headers=CAREGIVER)
    client.post("/schedule", json=item(title="Old", recurrence="daily", is_active=False), headers=CAREGIVER)
    titles = [o["title"] for o in client.get("/schedule/today?date=2026-10-09", headers=PATIENT).json()]
    assert titles == ["Breakfast", "Check-up", "Dinner"]
    first = client.get("/schedule/today?date=2026-10-09", headers=PATIENT).json()[0]
    assert first["occurrence_at"] == "2026-10-09 07:00:00"
    assert first["remind_at"] == "2026-10-09 06:30:00"


def test_next_finds_a_later_day(conn):
    conn.execute(
        "INSERT INTO schedule_items (id, title, kind, starts_at, recurrence) "
        "VALUES ('mass', 'Sunday Mass', 'activity', '2026-10-04 08:00:00', 'weekly:SU')"
    )
    conn.execute(
        "INSERT INTO schedule_items (id, title, kind, starts_at) "
        "VALUES ('past', 'Past', 'appointment', '2026-10-01 08:00:00')"
    )
    nxt = service.next_occurrence(conn, now=datetime(2026, 10, 7, 9, 0))  # Wednesday
    assert nxt["title"] == "Sunday Mass" and nxt["occurrence_at"] == "2026-10-11 08:00:00"
    assert service.next_occurrence(conn, now=datetime(2026, 10, 11, 7, 0))["occurrence_at"] == "2026-10-11 08:00:00"


def test_occurrences_between_includes_running_items(conn):
    conn.execute(
        "INSERT INTO schedule_items (id, title, kind, starts_at, duration_min, recurrence, is_quiet_period) "
        "VALUES ('nap', 'Nap', 'routine', '2026-10-01 13:30:00', 60, 'daily', 1)"
    )
    conn.execute(
        "INSERT INTO schedule_items (id, title, kind, starts_at, recurrence) "
        "VALUES ('dinner', 'Dinner', 'meal', '2026-10-01 18:00:00', 'daily')"
    )
    now = datetime(2026, 10, 9, 14, 0)  # halfway through the nap
    window = service.occurrences_between(conn, now - timedelta(minutes=30), now + timedelta(minutes=30))
    assert [o["title"] for o in window] == ["Nap"] and window[0]["is_quiet_period"] == 1
    late = datetime(2026, 10, 9, 17, 45)
    assert [o["title"] for o in service.occurrences_between(conn, late, late + timedelta(minutes=30))] == ["Dinner"]


def test_demo_seed_runs_once(conn):
    seed_demo_schedule(conn, person_id="ana", place_id="church")
    count = conn.execute("SELECT COUNT(*) FROM schedule_items").fetchone()[0]
    seed_demo_schedule(conn, person_id="ana", place_id="church")
    assert count > 0 and conn.execute("SELECT COUNT(*) FROM schedule_items").fetchone()[0] == count
    assert service.today(conn) and service.next_occurrence(conn) is not None


def test_next_is_null_when_nothing_ahead(client):
    client.post("/schedule", json=item(starts_at="2020-01-01 08:00"), headers=CAREGIVER)
    assert client.get("/schedule/next", headers=PATIENT).json() is None


# ───────────────────────────────── SCH-3: acks ──────────────────────────────────


def test_ack_upserts_and_shows_on_today(client):
    created = client.post("/schedule", json=item(recurrence="daily"), headers=CAREGIVER).json()
    url = f"/schedule/{created['id']}/ack"
    first = client.post(url, json={"occurrence_at": "2026-10-09 12:00", "response": "snoozed"}, headers=PATIENT)
    second = client.post(url, json={"occurrence_at": "2026-10-09 12:00:00", "response": "acknowledged"}, headers=PATIENT)
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    today = client.get("/schedule/today?date=2026-10-09", headers=PATIENT).json()
    assert today[0]["ack"]["response"] == "acknowledged"
    other_day = client.get("/schedule/today?date=2026-10-10", headers=PATIENT).json()
    assert other_day[0]["ack"] is None


def test_ack_rejects_bad_input(client):
    created = client.post("/schedule", json=item(recurrence="daily"), headers=CAREGIVER).json()
    url = f"/schedule/{created['id']}/ack"
    assert client.post(url, json={"occurrence_at": "2026-10-09 13:00", "response": "acknowledged"}, headers=PATIENT).status_code == 422
    assert client.post(url, json={"occurrence_at": "2026-10-09 12:00", "response": "done"}, headers=PATIENT).status_code == 422
    assert client.post("/schedule/nope/ack", json={"occurrence_at": "2026-10-09 12:00", "response": "acknowledged"}, headers=PATIENT).status_code == 404
