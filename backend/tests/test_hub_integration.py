# Schedule, Medications, Dashboard and the phones' reminder contract working together
# on the real hub: the full app from app.main, the real schema, the real HUB-4 role
# checks and the hub's demo seed (database/seed.py). No mocks or dependency overrides.
from datetime import datetime, timedelta

import pytest

from app.database.seed import ANA, seed
from app.features.medications import service as med_service
from app.features.schedule import service as sch_service

PATIENT = {"X-Role": "patient"}
CAREGIVER = {"X-Role": "caregiver", "X-Caregiver-Id": ANA}

# A Friday after every seeded medicine has started: Metformin and Vitamin B (MO,WE,FR)
# are due at 08:00 and Losartan at 20:00.
NOW = datetime(2026, 10, 9, 12, 0)


@pytest.fixture
def hub(db, client, monkeypatch):
    seed(db)
    monkeypatch.setattr(med_service, "manila_now", lambda: NOW)
    monkeypatch.setattr(sch_service, "manila_now", lambda: NOW)
    return client


def test_routers_are_registered_by_main(hub):
    paths = hub.get("/openapi.json").json()["paths"]
    for path in ("/schedule/today", "/schedule/{item_id}/ack", "/medications/today", "/medications/logs/{log_id}"):
        assert path in paths


def test_schedule_today_serves_the_seeded_week(hub):
    today = hub.get("/schedule/today", headers=PATIENT)
    assert today.status_code == 200, today.text
    titles = [o["title"] for o in today.json()]
    assert "Breakfast" in titles and "Lunch" in titles
    # Friday: no Sunday Mass, no Saturday visit
    assert "Sunday Mass" not in titles and "Miguel visits" not in titles

    sunday = hub.get("/schedule/today?date=2026-10-11", headers=PATIENT).json()
    mass = next(o for o in sunday if o["title"] == "Sunday Mass")
    assert mass["person_name"] and mass["place_name"] == "Malolos Church"


def test_patient_ack_is_recorded_against_the_real_schedule(hub):
    lunch = next(o for o in hub.get("/schedule/today", headers=PATIENT).json() if o["title"] == "Lunch")
    res = hub.post(
        f"/schedule/{lunch['id']}/ack",
        json={"occurrence_at": lunch["occurrence_at"], "response": "acknowledged"},
        headers=PATIENT,
    )
    assert res.status_code == 200, res.text
    again = next(o for o in hub.get("/schedule/today", headers=PATIENT).json() if o["title"] == "Lunch")
    assert again["ack"]["response"] == "acknowledged"


def test_seeded_caregiver_can_edit_schedule_and_patient_cannot(hub):
    item = {"title": "Physical therapy", "kind": "appointment", "starts_at": "2026-10-12 10:00:00"}
    assert hub.post("/schedule", json=item, headers=PATIENT).status_code == 403
    created = hub.post("/schedule", json=item, headers=CAREGIVER)
    assert created.status_code == 201, created.text
    unknown = {"X-Role": "caregiver", "X-Caregiver-Id": "nobody"}
    assert hub.post("/schedule", json=item, headers=unknown).status_code == 401


def test_medications_today_generates_seeded_doses_and_patient_confirms(hub):
    doses = hub.get("/medications/today", headers=PATIENT).json()
    names = sorted(d["name"] for d in doses)
    assert names == ["Losartan", "Metformin", "Vitamin B complex"]
    assert all(d["status"] == "unconfirmed" for d in doses)
    assert all(d["photo_url"].startswith("/photos/seed-") for d in doses)

    metformin = next(d for d in doses if d["name"] == "Metformin")
    res = hub.post(f"/medications/logs/{metformin['id']}", json={"status": "taken"}, headers=PATIENT)
    assert res.status_code == 200, res.text
    assert res.json()["confirmed_by"] == "patient"


def test_dashboard_lists_missed_doses_without_a_phone_fetch_first(hub, monkeypatch):
    # Nobody opened the medicine card yesterday; the dashboard still finds the missed doses.
    yesterday = NOW - timedelta(days=1)
    monkeypatch.setattr(med_service, "manila_now", lambda: yesterday)
    dashboard = hub.get("/dashboard", headers=CAREGIVER)
    assert dashboard.status_code == 200, dashboard.text
    missed = {d["medication_name"] for d in dashboard.json()["medication_attention"]}
    assert {"Losartan", "Metformin"} <= missed


def test_dashboard_shows_a_dose_the_patient_skipped(hub):
    losartan = next(d for d in hub.get("/medications/today", headers=PATIENT).json() if d["name"] == "Losartan")
    hub.post(f"/medications/logs/{losartan['id']}", json={"status": "skipped"}, headers=PATIENT)
    attention = hub.get("/dashboard", headers=CAREGIVER).json()["medication_attention"]
    assert any(d["id"] == losartan["id"] and d["status"] == "skipped" for d in attention)


def test_reminder_contract_matches_the_hub(hub):
    """The fields mobile/src/hub.ts reads from /schedule/today and /medications."""
    occurrence = hub.get("/schedule/today", headers=PATIENT).json()[0]
    for key in ("id", "title", "occurrence_at", "remind_at", "ends_at", "ack"):
        assert key in occurrence
    med = hub.get("/medications", headers=PATIENT).json()[0]
    for key in ("id", "name", "dose", "is_active", "start_date", "end_date", "times"):
        assert key in med
    assert {"time_of_day", "days"} <= set(med["times"][0])
