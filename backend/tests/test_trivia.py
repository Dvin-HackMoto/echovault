# Trivia module (TRV-1..TRV-4). From backend/:  py -m pytest tests/test_trivia.py
#
# The rules are tested on the mock household in tests/trivia_data.py with a fixed clock:
# no demo seed, no Memories router, and (for the service tests) no assets/trivia.json.
# The endpoint tests go through the real app, where the startup step has loaded the file.

import json
import random
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import config
from app.constants import ALLOWED_GAME_TOPICS
from app.features.trivia import loader, repository, service
from tests import trivia_data
from tests.factories import PATIENT_HEADERS, make_memory, make_schedule_item, make_trivia_question
from tests.trivia_data import NOW, set_setting

TODAY = NOW.date()


def at(clock):
    hour, minute = clock.split(":")
    return datetime(TODAY.year, TODAY.month, TODAY.day, int(hour), int(minute))


@pytest.fixture
def home(db):
    return trivia_data.build(db)


@pytest.fixture(autouse=True)
def fixed(monkeypatch):
    """The clock is NOW, and picks are repeatable."""
    monkeypatch.setattr(service, "manila_now", lambda: NOW)
    monkeypatch.setattr(service, "_random", random.Random(7))


def key_of(home, question):
    """The mock household's name for a question; a question from trivia.json keeps its id."""
    names = {question_id: key for key, question_id in home["questions"].items()}
    return names.get(question["id"], question["id"])


def askable(db, home, now=NOW):
    settings = service.read_settings(db)
    rows = repository.askable_questions(
        db, settings["game_topics"], settings["game_difficulty"], now.strftime(service.DT_FORMAT)
    )
    return {key_of(home, row) for row in rows}


def answer(db, question_id, now, outcome="completed"):
    return service.record_result(db, {"question_id": question_id, "outcome": outcome}, now)


# ─────────────────────────────── TRV-2: quiet hours ─────────────────────────────


@pytest.mark.parametrize("clock, quiet", [
    ("20:59", False), ("21:00", True), ("23:30", True), ("00:00", True), ("06:59", True), ("07:00", False),
    ("12:00", False),
])
def test_quiet_hours_run_past_midnight(clock, quiet):
    assert service.in_quiet_hours(at(clock), {"start": "21:00", "end": "07:00"}) is quiet


@pytest.mark.parametrize("clock, quiet", [("12:59", False), ("13:00", True), ("14:59", True), ("15:00", False)])
def test_quiet_hours_within_one_day(clock, quiet):
    assert service.in_quiet_hours(at(clock), {"start": "13:00", "end": "15:00"}) is quiet


def test_no_quiet_hours_when_start_equals_end_or_unset():
    assert service.in_quiet_hours(at("03:00"), {"start": "00:00", "end": "00:00"}) is False
    assert service.in_quiet_hours(at("03:00"), {}) is False


def test_nothing_is_returned_inside_quiet_hours(db, home):
    for clock in ("23:30", "02:00", "06:00"):
        assert service.suppression_reason(db, at(clock)) == "quiet_hours"
        assert service.next_prompt(db, at(clock)) is None

    # the caregiver's setting decides, not a fixed time
    set_setting(db, "quiet_hours", {"start": "10:00", "end": "11:00"})
    assert service.suppression_reason(db, NOW) == "quiet_hours"
    set_setting(db, "quiet_hours", {"start": "22:00", "end": "05:00"})
    assert service.next_prompt(db, NOW) is not None


# ──────────────────────────────── TRV-2: schedule ───────────────────────────────


@pytest.mark.parametrize("clock, reason", [
    ("08:29", None),          # watering the plants starts at 09:00
    ("08:30", "schedule"),    # 30 minutes before it
    ("09:10", "schedule"),    # during it
    ("09:50", "schedule"),    # it ended at 09:20: 30 minutes after
    ("09:51", None),
    ("11:29", None),          # lunch is at 12:00
    ("11:30", "schedule"),
    ("14:00", "schedule"),    # afternoon rest, is_quiet_period = 1
    ("15:29", None),          # Miguel visits at 16:00 (no duration)
    ("15:30", "schedule"),
    ("16:30", "schedule"),
    ("16:31", None),
])
def test_nothing_is_returned_near_a_schedule_item(db, home, clock, reason):
    assert service.suppression_reason(db, at(clock)) == reason
    assert (service.next_prompt(db, at(clock)) is None) is (reason is not None)


def test_a_quiet_period_blocks_prompts_for_as_long_as_it_runs(db, home):
    make_schedule_item(db, title="Physical therapy", starts_at="2026-10-10 10:00:00", duration_min=120,
                       is_quiet_period=1)
    for clock in ("09:45", "10:30", "11:59", "12:25"):
        assert service.suppression_reason(db, at(clock)) == "schedule"


def test_an_inactive_item_or_one_on_another_day_does_not_block(db, home):
    make_schedule_item(db, title="Cancelled check-up", starts_at="2026-10-10 10:30:00", is_active=0)
    make_schedule_item(db, title="Tomorrow's check-up", starts_at="2026-10-11 10:30:00", duration_min=45)
    assert service.suppression_reason(db, NOW) is None


# ─────────────────────────── TRV-2 / TRV-4: frequency ───────────────────────────


@pytest.mark.parametrize("outcome", ["completed", "skipped"])
def test_nothing_is_returned_until_the_frequency_has_passed(db, home, outcome):
    set_setting(db, "trivia_frequency_min", 45)
    answer(db, home["questions"]["sky"], at("10:00"), outcome)

    assert service.suppression_reason(db, at("10:00")) == "frequency"
    assert service.suppression_reason(db, at("10:44")) == "frequency"
    assert service.next_prompt(db, at("10:44")) is None
    assert service.suppression_reason(db, at("10:45")) is None
    assert service.next_prompt(db, at("10:45")) is not None

    # the caregiver changes the frequency: it applies to the very next check
    set_setting(db, "trivia_frequency_min", 60)
    assert service.suppression_reason(db, at("10:45")) == "frequency"
    set_setting(db, "trivia_frequency_min", 5)
    assert service.suppression_reason(db, at("10:05")) is None


def test_only_trivia_prompts_count_towards_the_frequency(db, home):
    db.execute(
        "INSERT INTO activity_log (id, activity, outcome, created_at) VALUES ('game-1', 'memory_quiz', 'completed', ?)",
        (at("10:25").strftime(service.DT_FORMAT),),
    )
    assert service.suppression_reason(db, NOW) is None


def test_a_prompt_that_was_shown_but_never_answered_does_not_start_the_wait(db, home):
    first = service.next_prompt(db, NOW)
    assert first is not None
    assert service.next_prompt(db, NOW + timedelta(minutes=1)) is not None


# ───────────────────────────── TRV-2: which question ────────────────────────────


def test_default_settings_give_verified_personal_questions_and_general_ones(db, home):
    assert askable(db, home) == trivia_data.ASKABLE_BY_DEFAULT


def test_questions_about_unverified_or_invalid_memories_are_never_asked(db, home):
    set_setting(db, "game_topics", list(ALLOWED_GAME_TOPICS))
    set_setting(db, "game_difficulty", 3)
    everything = set(home["questions"]) - trivia_data.NEVER_ASKABLE
    assert askable(db, home) == everything
    assert askable(db, home) == trivia_data.ASKABLE_BY_DEFAULT | {"church", "hard", "flag"}


def test_a_memory_valid_through_today_stops_being_asked_tomorrow(db, home):
    assert "visit_today" in askable(db, home, at("23:59"))
    assert "visit_today" not in askable(db, home, NOW + timedelta(days=1))
    # and a memory that starts on the 12th is asked from then on
    assert "upcoming" not in askable(db, home, datetime(2026, 10, 11, 23, 59))
    assert "upcoming" in askable(db, home, datetime(2026, 10, 12, 10, 30))


@pytest.mark.parametrize("change", [
    "UPDATE memories SET trust = 'unverified' WHERE id = ?",
    "UPDATE memories SET trust = 'conflicting' WHERE id = ?",
    "UPDATE memories SET trust = 'outdated' WHERE id = ?",
    "UPDATE memories SET validity = 'archived' WHERE id = ?",
    "UPDATE memories SET valid_until = '2026-10-10 10:00:00' WHERE id = ?",
    "DELETE FROM memories WHERE id = ?",
])
def test_a_question_disappears_when_its_memory_stops_being_usable(db, home, change):
    assert "flower" in askable(db, home)
    db.execute(change, (home["memories"]["flower"],))
    assert askable(db, home) == trivia_data.ASKABLE_BY_DEFAULT - {"flower"}


def test_game_topics_filter_personal_questions_and_general_ones_stay(db, home):
    set_setting(db, "game_topics", ["familiar_places"])
    assert askable(db, home) == {"church", "sky"}
    set_setting(db, "game_topics", ["routines", "relationships"])
    assert askable(db, home) == {"plants", "flower", "sky"}
    set_setting(db, "game_topics", [])
    assert askable(db, home) == {"sky"}


def test_game_difficulty_limits_the_questions(db, home):
    set_setting(db, "game_difficulty", 2)
    assert askable(db, home) == trivia_data.ASKABLE_BY_DEFAULT | {"flag"}
    set_setting(db, "game_difficulty", 3)
    assert askable(db, home) == trivia_data.ASKABLE_BY_DEFAULT | {"flag", "hard"}


def test_personal_and_general_take_turns_and_nothing_repeats_early(db, home):
    set_setting(db, "trivia_frequency_min", 1)
    set_setting(db, "game_difficulty", 2)
    shown = []
    for minute in range(8):  # 09:55 .. 10:02, nothing scheduled
        now = at("09:55") + timedelta(minutes=minute)
        prompt = service.next_prompt(db, now)
        shown.append(key_of(home, prompt))
        answer(db, prompt["id"], now, "skipped" if minute % 2 else "completed")

    personal, general = shown[0::2], shown[1::2]
    assert set(personal) == {"flower", "plants", "paolo", "visit_today"} and len(personal) == 4
    assert general[:2] in (["sky", "flag"], ["flag", "sky"]) and general[2:] == general[:2]


def test_only_general_or_only_personal_questions_still_gives_a_prompt(db, home):
    set_setting(db, "trivia_frequency_min", 1)
    set_setting(db, "game_topics", [])
    for minute in range(3):
        now = at("10:00") + timedelta(minutes=minute)
        prompt = service.next_prompt(db, now)
        assert key_of(home, prompt) == "sky"
        answer(db, prompt["id"], now)

    set_setting(db, "game_topics", ["routines"])
    db.execute("UPDATE trivia_questions SET is_active = 0 WHERE kind = 'general'")
    for minute in range(3, 6):
        now = at("10:00") + timedelta(minutes=minute)
        prompt = service.next_prompt(db, now)
        assert key_of(home, prompt) == "plants"
        answer(db, prompt["id"], now)


def test_no_usable_question_means_no_prompt(db, home):
    db.execute("UPDATE trivia_questions SET is_active = 0")
    assert service.suppression_reason(db, NOW) is None
    assert service.next_prompt(db, NOW) is None


def test_a_prompt_carries_the_verified_person_its_memory_is_about(db, home):
    flower = service.as_prompt(db, repository.get_question(db, home["questions"]["flower"]))
    assert flower["question"] == "Ana is your daughter. Do you remember her favorite flower?"
    assert flower["answer"] == "Sunflowers"
    assert json.loads(flower["choices"]) == ["Sunflowers", "Roses", "Sampaguita"]
    assert [(p["name"], p["photo_url"]) for p in flower["people"]] == [("Ana Santos-Reyes", "/photos/ana.png")]

    # the memory about Paolo is linked to a person nobody has verified: no photo link
    assert service.as_prompt(db, repository.get_question(db, home["questions"]["paolo"]))["people"] == []
    assert service.as_prompt(db, repository.get_question(db, home["questions"]["sky"]))["people"] == []


# ──────────────────────────── TRV-4: recording outcomes ─────────────────────────


def test_result_is_saved_as_engagement_only(db, home):
    row = service.record_result(
        db, {"question_id": home["questions"]["flower"], "outcome": "completed", "duration_sec": 12}, NOW
    )
    assert row["activity"] == "trivia_prompt" and row["outcome"] == "completed"
    assert row["question_ref"] == home["questions"]["flower"]
    assert (row["topic"], row["difficulty"], row["duration_sec"]) == ("relationships", 1, 12)
    assert row["created_at"] == "2026-10-10 10:30:00"


def test_endpoints_next_and_result(client, db, home, monkeypatch):
    assert client.get("/trivia/next").status_code == 401

    monkeypatch.setattr(service, "manila_now", lambda: at("23:30"))
    quiet = client.get("/trivia/next", headers=PATIENT_HEADERS)
    assert quiet.status_code == 200 and quiet.json() is None

    monkeypatch.setattr(service, "manila_now", lambda: NOW)
    prompt = client.get("/trivia/next", headers=PATIENT_HEADERS).json()
    assert sorted(prompt) == sorted([
        "id", "kind", "topic", "question", "answer", "choices", "memory_id", "difficulty", "source",
        "is_active", "people",
    ])
    # a first prompt is about the patient's own life, from a verified memory
    assert key_of(home, prompt) in {"flower", "plants", "paolo", "visit_today"}

    saved = client.post("/trivia/result", json={"question_id": prompt["id"], "outcome": "skipped"},
                        headers=PATIENT_HEADERS)
    assert saved.status_code == 201, saved.text
    assert saved.json()["outcome"] == "skipped" and saved.json()["activity"] == "trivia_prompt"
    logged = db.execute("SELECT question_ref, outcome FROM activity_log").fetchall()
    assert [tuple(r) for r in logged] == [(prompt["id"], "skipped")]

    assert client.get("/trivia/next", headers=PATIENT_HEADERS).json() is None  # asked too recently


@pytest.mark.parametrize("body, status", [
    ({"question_id": "nobody", "outcome": "completed"}, 404),
    ({"outcome": "completed"}, 404),
    ({"question_id": "mock-sky"}, 422),
    # right or wrong is never stored for trivia
    ({"question_id": "mock-sky", "outcome": "correct"}, 422),
    ({"question_id": "mock-sky", "outcome": "incorrect"}, 422),
    ({"question_id": "mock-sky", "outcome": "completed", "duration_sec": -1}, 422),
    ({"question_id": "mock-sky", "outcome": "completed", "duration_sec": "soon"}, 422),
])
def test_result_validation(client, db, home, body, status):
    assert client.post("/trivia/result", json=body, headers=PATIENT_HEADERS).status_code == status
    assert db.execute("SELECT count(*) FROM activity_log").fetchone()[0] == 0
    assert client.post("/trivia/result", json=body).status_code == 401


# ─────────────────────────────── TRV-1: preloaded file ──────────────────────────


def preloaded(db):
    return [dict(r) for r in db.execute("SELECT * FROM trivia_questions WHERE source = 'preloaded' ORDER BY id")]


def test_the_file_has_enough_suitable_questions():
    questions = json.loads(config.ASSETS_DIR.joinpath("trivia.json").read_text(encoding="utf-8"))
    assert len(questions) >= 30
    assert len({q["question"] for q in questions}) == len(questions)
    assert sum(q["difficulty"] == 1 for q in questions) >= 15  # the default difficulty has plenty
    for q in questions:
        assert q["topic"] and q["difficulty"] in (1, 2, 3), q["id"]
        # familiar and short: one sentence or two, a short answer, three choices with one right
        assert q["question"].endswith("?") and len(q["question"]) <= 90, q["id"]
        assert len(q["answer"]) <= 25, q["id"]
        assert len(q["choices"]) == 3 and q["choices"].count(q["answer"]) == 1, q["id"]
        assert len(set(q["choices"])) == 3, q["id"]


def test_startup_loads_the_file_and_loading_twice_does_not_duplicate(client, db):
    from app.main import create_app

    in_file = loader.read_file()
    rows = preloaded(db)
    assert [r["id"] for r in rows] == sorted(q["id"] for q in in_file)
    assert {(r["kind"], r["source"], r["is_active"], r["memory_id"]) for r in rows} == {
        ("general", "preloaded", 1, None)
    }

    assert loader.load_preloaded(db) == {"added": 0, "removed": 0}
    with TestClient(create_app()):  # the hub restarts
        pass
    assert preloaded(db) == rows


def test_reloading_keeps_what_the_caregiver_switched_off_and_follows_the_file(db, tmp_path):
    path = tmp_path / "trivia.json"
    entries = [
        {"id": "preloaded-a", "topic": "nature", "difficulty": 1, "question": "A?", "answer": "Yes",
         "choices": ["Yes", "No"]},
        {"id": "preloaded-b", "topic": "food", "difficulty": 2, "question": "B?", "answer": "Rice"},
    ]
    path.write_text(json.dumps(entries), encoding="utf-8")
    assert loader.load_preloaded(db, path) == {"added": 2, "removed": 0}
    assert repository.get_question(db, "preloaded-b")["choices"] is None

    # rows this loader does not own: a caregiver's question, and a 'preloaded' row from a factory
    mine = make_trivia_question(db, source="caregiver")
    other = make_trivia_question(db)
    db.execute("UPDATE trivia_questions SET is_active = 0 WHERE id = 'preloaded-a'")

    entries[0]["question"] = "A, reworded?"
    del entries[1]
    entries.append({"id": "preloaded-c", "topic": "animals", "difficulty": 1, "question": "C?", "answer": "A dog"})
    path.write_text(json.dumps(entries), encoding="utf-8")
    assert loader.load_preloaded(db, path) == {"added": 1, "removed": 1}

    a = repository.get_question(db, "preloaded-a")
    assert (a["question"], a["is_active"]) == ("A, reworded?", 0)
    assert repository.get_question(db, "preloaded-b") is None
    assert repository.get_question(db, "preloaded-c")["is_active"] == 1
    assert repository.get_question(db, mine["id"]) and repository.get_question(db, other["id"])


@pytest.mark.parametrize("entries, message", [
    ({"id": "preloaded-a"}, "must be a list"),
    ([{"id": "preloaded-a", "topic": "t", "difficulty": 1, "question": "A?"}], "missing answer"),
    ([{"id": "a", "topic": "t", "difficulty": 1, "question": "A?", "answer": "Yes"}], "must start with"),
    ([{"id": "preloaded-a", "topic": "t", "difficulty": 4, "question": "A?", "answer": "Yes"}], "difficulty"),
    ([{"id": "preloaded-a", "topic": "t", "difficulty": 1, "question": "A?", "answer": "Yes", "choices": ["No"]}],
     "choices"),
    ([{"id": "preloaded-a", "topic": "t", "difficulty": 1, "question": "A?", "answer": "Yes"}] * 2, "used twice"),
])
def test_a_bad_file_is_refused_and_changes_nothing(db, tmp_path, entries, message):
    good = tmp_path / "good.json"
    good.write_text(json.dumps([{"id": "preloaded-keep", "topic": "t", "difficulty": 1, "question": "K?",
                                 "answer": "Yes"}]), encoding="utf-8")
    loader.load_preloaded(db, good)
    bad = tmp_path / "trivia.json"
    bad.write_text(json.dumps(entries), encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        loader.load_preloaded(db, bad)
    assert [r["id"] for r in preloaded(db)] == ["preloaded-keep"]


# ───────────────────────── TRV-3: caregiver-written questions ───────────────────


@pytest.fixture
def cg(caregiver_client_headers):
    return caregiver_client_headers


def personal(home, **fields):
    return {"kind": "family", "topic": "relationships", "question": "What is Ana's favorite flower?",
            "answer": "Sunflowers", "choices": ["Sunflowers", "Roses"], "memory_id": home["memories"]["flower"],
            **fields}


def test_a_caregiver_writes_a_question_about_a_verified_memory(client, cg, home):
    res = client.post("/trivia/questions", json=personal(home), headers=cg)
    assert res.status_code == 201, res.text
    saved = res.json()
    assert saved["source"] == "caregiver" and saved["kind"] == "family"
    assert saved["memory_id"] == home["memories"]["flower"]
    assert json.loads(saved["choices"]) == ["Sunflowers", "Roses"]
    assert (saved["difficulty"], saved["is_active"]) == (1, 1)
    assert client.get(f"/trivia/questions/{saved['id']}", headers=cg).json() == saved

    general = client.post("/trivia/questions", json={
        "kind": "general", "topic": "food", "question": "What is halo-halo served with?", "answer": "Ice",
    }, headers=cg).json()
    assert (general["source"], general["memory_id"], general["choices"]) == ("caregiver", None, None)


@pytest.mark.parametrize("kind", ["personal", "family", "routine"])
@pytest.mark.parametrize("memory", [None, "missing", "cousin", "old_doctor", "conflict", "archived", "ended", "upcoming"])
def test_a_question_about_the_patients_life_needs_a_verified_valid_memory(client, cg, home, kind, memory):
    memory_id = home["memories"].get(memory, memory)
    res = client.post("/trivia/questions", json=personal(home, kind=kind, memory_id=memory_id), headers=cg)
    assert res.status_code == 422 and "memory" in res.json()["detail"]
    # nothing was saved: the caregiver-written questions are still only the mock household's
    saved = client.get("/trivia/questions?source=caregiver", headers=cg).json()
    assert all(q["id"].startswith("mock-") for q in saved)


@pytest.mark.parametrize("fields, message", [
    ({"kind": "riddle"}, "kind must be one of"),
    ({"question": " "}, "question is required"),
    ({"answer": None}, "answer is required"),
    ({"topic": "nature"}, "topic must be one of"),
    ({"topic": None}, "topic must be one of"),
    ({"difficulty": 4}, "difficulty must be between 1 and 3"),
    ({"difficulty": "hard"}, "difficulty must be a whole number"),
    ({"choices": ["Roses", "Sampaguita"]}, "choices must include the answer"),
    ({"choices": ["Sunflowers"]}, "at least two"),
    ({"choices": ["Sunflowers", "sunflowers "]}, "must all be different"),
    ({"choices": "Sunflowers or roses"}, "choices must be a list"),
    ({"is_active": "sometimes"}, "is_active must be true or false"),
    ({"kind": "general"}, "general question cannot have a memory_id"),
])
def test_question_validation(client, cg, home, fields, message):
    res = client.post("/trivia/questions", json=personal(home, **fields), headers=cg)
    assert res.status_code == 422 and message in res.json()["detail"], res.text


def test_update_is_partial_and_checks_the_whole_question(client, cg, home):
    saved = client.post("/trivia/questions", json=personal(home), headers=cg).json()
    url = f"/trivia/questions/{saved['id']}"
    updated = client.put(url, json={"difficulty": 2, "choices": None}, headers=cg).json()
    assert (updated["difficulty"], updated["choices"], updated["question"]) == (2, None, saved["question"])

    assert client.put(url, json={"memory_id": home["memories"]["cousin"]}, headers=cg).status_code == 422
    assert client.put(url, json={"answer": ""}, headers=cg).status_code == 422
    assert client.put(url, json={"memory_id": home["memories"]["plants"], "kind": "routine", "topic": "routines"},
                      headers=cg).json()["memory_id"] == home["memories"]["plants"]
    assert client.put("/trivia/questions/nobody", json={"difficulty": 2}, headers=cg).status_code == 404


def test_a_question_can_be_switched_off_without_deleting_it(client, cg, db, home):
    url = f"/trivia/questions/{home['questions']['flower']}"
    off = client.put(url, json={"is_active": False}, headers=cg)
    assert off.status_code == 200 and off.json()["is_active"] == 0
    assert "flower" not in askable(db, home)
    assert client.get(url, headers=cg).json()["question"].startswith("Ana is your daughter")
    assert home["questions"]["flower"] not in [
        q["id"] for q in client.get("/trivia/questions?active_only=true", headers=cg).json()
    ]
    assert client.put(url, json={"is_active": True}, headers=cg).json()["is_active"] == 1
    assert "flower" in askable(db, home)

    # still possible after the memory behind the question stopped being verified
    db.execute("UPDATE memories SET trust = 'outdated' WHERE id = ?", (home["memories"]["flower"],))
    assert client.put(url, json={"is_active": 0}, headers=cg).json()["is_active"] == 0
    assert client.put(url, json={"question": "Reworded?"}, headers=cg).status_code == 422


def test_deleting_the_memory_removes_its_questions(client, cg, db, home):
    saved = client.post("/trivia/questions", json=personal(home), headers=cg).json()
    db.execute("DELETE FROM memories WHERE id = ?", (home["memories"]["flower"],))
    assert client.get(f"/trivia/questions/{saved['id']}", headers=cg).status_code == 404
    for key in ("flower", "hard", "off"):
        assert client.get(f"/trivia/questions/{home['questions'][key]}", headers=cg).status_code == 404
    assert client.get(f"/trivia/questions/{home['questions']['plants']}", headers=cg).status_code == 200


def test_delete_and_list(client, cg, home):
    saved = client.post("/trivia/questions", json=personal(home), headers=cg).json()
    assert client.delete(f"/trivia/questions/{saved['id']}", headers=cg).status_code == 204
    assert client.delete(f"/trivia/questions/{saved['id']}", headers=cg).status_code == 404

    everything = client.get("/trivia/questions", headers=cg).json()
    in_file = len(loader.read_file())
    assert len(everything) == in_file + len(home["questions"])
    assert {q["kind"] for q in client.get("/trivia/questions?kind=routine", headers=cg).json()} == {"routine"}
    assert client.get("/trivia/questions?kind=riddle", headers=cg).status_code == 422
    assert client.get("/trivia/questions?source=internet", headers=cg).status_code == 422


def test_a_preloaded_question_can_only_be_switched_on_or_off(client, cg, db):
    question_id = loader.read_file()[0]["id"]
    url = f"/trivia/questions/{question_id}"
    before = client.get(url, headers=cg).json()

    assert client.put(url, json={"question": "Reworded?"}, headers=cg).status_code == 409
    assert client.put(url, json={"is_active": False, "answer": "Green"}, headers=cg).status_code == 409
    assert client.put(url, json={}, headers=cg).status_code == 409
    assert client.delete(url, headers=cg).status_code == 409
    assert client.get(url, headers=cg).json() == before

    assert client.put(url, json={"is_active": False}, headers=cg).json() == {**before, "is_active": 0}
    assert loader.load_preloaded(db) == {"added": 0, "removed": 0}  # a restart
    assert client.get(url, headers=cg).json()["is_active"] == 0


def test_patient_mode_cannot_manage_questions(client, home):
    url = f"/trivia/questions/{home['questions']['sky']}"
    assert client.get("/trivia/questions", headers=PATIENT_HEADERS).status_code == 403
    assert client.get(url, headers=PATIENT_HEADERS).status_code == 403
    assert client.post("/trivia/questions", json=personal(home), headers=PATIENT_HEADERS).status_code == 403
    assert client.put(url, json={"is_active": False}, headers=PATIENT_HEADERS).status_code == 403
    assert client.delete(url, headers=PATIENT_HEADERS).status_code == 403


# ───────────────────────── writes commit in either mode ─────────────────────────


@pytest.mark.parametrize("isolation_level", [None, ""], ids=["autocommit", "default-commit"])
def test_writes_are_committed(db, home, isolation_level):
    import sqlite3

    conn = sqlite3.connect(config.DB_PATH, isolation_level=isolation_level)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        question = service.validate_question(conn, personal(home), NOW)
        question_id = repository.create_question(conn, question, "caregiver")
        assert not conn.in_transaction
        repository.update_question(conn, question_id, {**question, "difficulty": 2})
        repository.set_active(conn, question_id, 0)
        assert not conn.in_transaction
        service.record_result(conn, {"question_id": question_id, "outcome": "skipped"}, NOW)
        assert not conn.in_transaction
        loader.load_preloaded(conn)
        assert not conn.in_transaction
        # the other connection sees every write
        seen = db.execute("SELECT difficulty, is_active FROM trivia_questions WHERE id = ?", (question_id,)).fetchone()
        assert tuple(seen) == (2, 0)
        assert db.execute("SELECT count(*) FROM activity_log").fetchone()[0] == 1
        assert len(preloaded(db)) >= len(loader.read_file())
        assert repository.delete_question(conn, question_id) and not conn.in_transaction
    finally:
        conn.close()
