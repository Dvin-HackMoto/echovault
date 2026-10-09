# Assistant module (AST-1..6). From backend/:  py -m pytest tests/test_assistant.py
#
# These tests run the real app against the real schema with the hub's demo seed in it
# (app/database/seed.py), so people, memories, schedule and medications are read through
# the same services the hub uses. Only the two things outside the process are replaced:
# Ollama's HTTP endpoint (respx) and the Whisper model (stt.transcribe).
import json
import os
from datetime import datetime

import httpx
import pytest
import respx

import app.config
from app.ai import stt
from app.constants import ACCESS_VIEWER, VALIDITY_ARCHIVED
from app.database.seed import seed
from app.features.assistant import intent, retrieve, router
from tests import factories
from tests.factories import PATIENT_HEADERS

NOW = datetime(2026, 10, 10, 14, 0)  # a Saturday, 2:00 PM
OLLAMA = "http://ollama.test:11434"
NO_DATA = "I don't have that saved yet. You can ask Ana."


@pytest.fixture(autouse=True)
def fixed_setup(monkeypatch):
    monkeypatch.setattr(router, "now_manila", lambda: NOW)
    monkeypatch.setattr(app.config, "OLLAMA_URL", OLLAMA, raising=False)


@pytest.fixture
def seeded(db):
    seed(db)
    return db


@pytest.fixture
def ollama():
    """Ollama's /api/generate. Tests set `.return_value` or `.side_effect`; a test that
    never sets one fails if the assistant calls the model."""
    with respx.mock(assert_all_called=False) as mock:
        yield mock.post(f"{OLLAMA}/api/generate")


def says(route, text):
    route.return_value = httpx.Response(200, json={"response": text})


def prompt_sent(route):
    return json.loads(route.calls.last.request.content)["prompt"]


def ask(client, text, headers=PATIENT_HEADERS):
    response = client.post("/assistant/ask", json={"text": text}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def logs(db):
    return [dict(r) for r in db.execute("SELECT * FROM assistant_log ORDER BY rowid")]


# ───────────────────────────────── AST-1 intent ─────────────────────────────────


@pytest.mark.parametrize("text, expected", [
    ("Who is Ana?", {"intent": "who_is", "name": "Ana"}),
    ("who's Dr. Cruz?", {"intent": "who_is", "name": "Dr. Cruz"}),
    ("Sino si Ana?", {"intent": "who_is", "name": "Ana"}),
    ("Sino ba si Aling Rosa po?", {"intent": "who_is", "name": "Aling Rosa"}),
    ("Ano susunod?", {"intent": "next_event", "scope": "next"}),
    ("What is next?", {"intent": "next_event", "scope": "next"}),
    ("What do I have today?", {"intent": "next_event", "scope": "today"}),
    ("What is next today?", {"intent": "next_event", "scope": "next"}),
    ("What is my next appointment?", {"intent": "next_event", "scope": "next", "kind": "appointment"}),
    ("Do I have a check-up today?", {"intent": "next_event", "scope": "today", "kind": "appointment"}),
    ("Who is visiting today?", {"intent": "next_event", "scope": "today"}),
    ("Ano ang gamot ko?", {"intent": "medication"}),
    ("What medicine do I take?", {"intent": "medication"}),
    ("What is my next medicine?", {"intent": "medication"}),
    ("What is my favorite food?", {"intent": "general"}),
    ("Who is?", {"intent": "general"}),
    ("", {"intent": "general"}),
])
def test_intent(text, expected):
    assert intent.detect(text) == expected


# ──────────────────────────────── AST-2 retrieval ───────────────────────────────


def test_who_is_returns_the_person_and_only_their_usable_memories(seeded):
    found = retrieve.who_is(seeded, "Ana", NOW)
    assert [p["id"] for p in found["people"]] == ["seed-person-ana"]
    ids = {m["id"] for m in found["memories"]}
    assert "seed-mem-ana-daughter" in ids
    assert "seed-mem-ana-cebu" not in ids  # outdated
    assert found["people"][0]["photo_url"] == "/photos/seed-ana.png"


def test_who_is_matches_a_nickname_and_one_word_of_a_name(seeded):
    assert [p["id"] for p in retrieve.who_is(seeded, "Migs", NOW)["people"]] == ["seed-person-miguel"]
    assert [p["id"] for p in retrieve.who_is(seeded, "Dr. Ramon", NOW)["people"]] == ["seed-person-dr-cruz"]


def test_who_is_skips_an_unverified_person(seeded):
    found = retrieve.who_is(seeded, "Carmen", NOW)
    assert found["people"] == [] and found["memories"] == []


def test_general_never_returns_memories_that_may_not_be_used(seeded):
    usable_today = factories.make_memory(seeded, content="Zebra fact ends today.", valid_until="2026-10-10")
    for overrides in (
        {"content": "Zebra fact archived.", "validity": VALIDITY_ARCHIVED},
        {"content": "Zebra fact expired.", "valid_until": "2026-10-09 23:59:59"},
        {"content": "Zebra fact not started.", "valid_from": "2026-10-11 00:00:00"},
        {"content": "Zebra fact unverified.", "trust": "unverified"},
        {"content": "Zebra fact outdated.", "trust": "outdated"},
        {"content": "Zebra fact conflicting.", "trust": "conflicting"},
    ):
        factories.make_memory(seeded, **overrides)

    assert [m["id"] for m in retrieve.general(seeded, "zebra", NOW)["memories"]] == [usable_today["id"]]
    # seeded rows: conflicting (Paolo's school), outdated (Cebu), unverified (Aling Rosa's visit)
    for question in ("Where does Paolo study engineering?", "Is Ana in Cebu?", "Who brought suman?"):
        for memory in retrieve.general(seeded, question, NOW)["memories"]:
            assert memory["trust"] == "verified" and memory["conflicts_with"] is None
            assert memory["id"] not in ("seed-mem-ana-cebu", "seed-mem-rosa-visit")


def test_general_orders_by_importance_and_takes_five(seeded):
    for n in range(7):
        factories.make_memory(seeded, content=f"Quokka note {n}.")
    critical = factories.make_memory(seeded, content="Quokka warning.", importance="critical")
    found = retrieve.general(seeded, "quokka", NOW)["memories"]
    assert len(found) == 5 and found[0]["id"] == critical["id"]


def test_fts_query_quotes_every_word():
    assert retrieve.fts_query("What is Ana's favorite flower?") == '"ana" OR "favorite"* OR "flower"*'
    assert retrieve.fts_query('NEAR( "x" AND * OR') == '"near"*'
    assert retrieve.fts_query("Ano ba ito?") == ""


# ─────────────────────── AST-3 / AST-4: answers from seeded data ─────────────────


def test_who_is_ana(client, seeded, ollama):
    says(ollama, "Ana is your daughter. She lives with you.")
    body = ask(client, "Who is Ana?")

    assert body["answer"] == "Ana is your daughter. She lives with you."
    assert body["answer_mode"] == "llm" and body["intent"] == "who_is"
    assert [(p["name"], p["photo_url"]) for p in body["people"]] == [("Ana Santos-Reyes", "/photos/seed-ana.png")]
    assert body["memory_ids"][0] == "seed-person-ana" and "seed-mem-ana-daughter" in body["memory_ids"]
    prompt = prompt_sent(ollama)
    assert "Ana is your daughter" in prompt and "Who is Ana?" in prompt
    assert "Cebu" not in prompt  # the outdated memory about Ana never reaches the model


def test_next_appointment_comes_from_the_schedule_template(client, seeded, ollama):
    body = ask(client, "What is my next appointment?")
    assert body["answer"] == (
        "Your next appointment is Check-up with Dr. Cruz on Tuesday, October 20 at 10:00 AM. Ana will bring you."
    )
    assert body["answer_mode"] == "template" and body["intent"] == "next_event"
    assert body["memory_ids"] == ["seed-sched-checkup"]
    assert [p["id"] for p in body["people"]] == ["seed-person-dr-cruz"]
    assert not ollama.called


def test_what_is_next_is_the_next_item_of_any_kind(client, seeded, ollama):
    body = ask(client, "What is next?")
    assert body["answer"] == "Next is Miguel visits at 3:00 PM."
    assert body["memory_ids"] == ["seed-sched-miguel-visit"]
    assert [p["id"] for p in body["people"]] == ["seed-person-miguel"]
    # with no appointment saved, "next appointment" still says what is next
    seeded.execute("DELETE FROM schedule_items WHERE kind = 'appointment'")
    assert ask(client, "What is my next appointment?")["answer"] == "Next is Miguel visits at 3:00 PM."
    assert ask(client, "Do I have an appointment today?")["answer"].startswith("Today you still have Afternoon rest")
    assert not ollama.called


def test_today_lists_what_is_left(client, seeded, ollama):
    body = ask(client, "What do I have today?")
    assert body["answer"] == (
        "Today you still have Afternoon rest at 1:30 PM, Miguel visits at 3:00 PM, Merienda at 3:30 PM, "
        "Dinner at 6:30 PM and Bedtime at 9:00 PM."
    )
    assert not ollama.called


def test_today_with_nothing_left_gives_the_next_day(client, seeded, monkeypatch):
    monkeypatch.setattr(router, "now_manila", lambda: datetime(2026, 10, 19, 22, 0))
    assert ask(client, "What do I have today?")["answer"] == (
        "Nothing more is scheduled today. Next is Wake up and morning prayer tomorrow at 6:30 AM."
    )
    monkeypatch.setattr(router, "now_manila", lambda: datetime(2026, 10, 18, 22, 0))
    seeded.execute("UPDATE schedule_items SET is_active = 0 WHERE recurrence IS NOT NULL")
    assert ask(client, "Ano susunod?")["answer"] == (
        "Next is Check-up with Dr. Cruz on Tuesday, October 20 at 10:00 AM. Ana will bring you."
    )


def test_what_medicine_do_i_take(client, seeded, ollama):
    doses = client.get("/medications/today", headers=PATIENT_HEADERS).json()
    morning = next(d for d in doses if d["name"] == "Metformin")
    client.post(f"/medications/logs/{morning['id']}", json={"status": "taken"}, headers=PATIENT_HEADERS)

    body = ask(client, "What medicine do I take?")
    assert body["answer"] == (
        "Today you take Metformin, 1 tablet, at 8:00 AM, after breakfast (marked as taken) and "
        "Losartan, 1 tablet, at 8:00 PM, after dinner. "
        "Your next medicine is Losartan, 1 tablet, at 8:00 PM, after dinner."
    )
    assert body["answer_mode"] == "template" and body["intent"] == "medication"
    assert body["memory_ids"] == ["seed-med-metformin", "seed-med-losartan"]
    assert not ollama.called


def test_a_dose_answered_early_is_not_the_next_medicine(client, seeded):
    doses = client.get("/medications/today", headers=PATIENT_HEADERS).json()
    evening = next(d for d in doses if d["name"] == "Losartan")
    client.post(f"/medications/logs/{evening['id']}", json={"status": "skipped"}, headers=PATIENT_HEADERS)
    assert ask(client, "What medicine do I take?")["answer"] == (
        "Today you take Metformin, 1 tablet, at 8:00 AM, after breakfast and "
        "Losartan, 1 tablet, at 8:00 PM, after dinner (marked as skipped). "
        "Your next medicine is Metformin, 1 tablet, tomorrow at 8:00 AM, after breakfast."
    )


def test_medication_answer_in_filipino(client, seeded):
    seeded.execute("UPDATE patient SET language = 'fil'")
    assert ask(client, "Ano ang gamot ko?")["answer"] == (
        "Ngayong araw, ang mga gamot mo ay Metformin, 1 tablet, 8:00 AM, after breakfast at "
        "Losartan, 1 tablet, 8:00 PM, after dinner. "
        "Ang susunod mong gamot ay Losartan, 1 tablet, mamayang 8:00 PM, after dinner."
    )


def test_two_medicines_due_at_the_same_time(client, seeded, monkeypatch):
    monkeypatch.setattr(router, "now_manila", lambda: datetime(2026, 10, 11, 21, 0))  # Sunday night
    assert ask(client, "gamot?")["answer"].endswith(
        "Your next medicines are Metformin, 1 tablet, tomorrow at 8:00 AM, after breakfast and "
        "Vitamin B complex, 1 capsule, tomorrow at 8:00 AM, after breakfast."
    )


def test_no_verified_record_gives_the_no_data_reply_naming_the_caregiver(client, seeded, ollama):
    for question in ("What is my blood type?", "Who is Carmen?", "Who is Pedro?"):
        body = ask(client, question)
        assert body["answer"] == NO_DATA
        assert body["answer_mode"] == "no_data" and body["memory_ids"] == []
        assert [p["id"] for p in body["people"]] == ["seed-person-ana"]
    assert not ollama.called


def test_no_schedule_and_no_medicines_give_the_no_data_reply(client, db):
    factories.make_person(db, name="Ana Santos", nickname="Ana", is_caregiver=1)
    assert ask(client, "What is next?")["answer"] == NO_DATA
    assert ask(client, "What medicine do I take?")["answer_mode"] == "no_data"


def test_no_caregiver_saved_still_answers(client, db):
    assert ask(client, "Who is Ana?")["answer"] == "I don't have that saved yet. You can ask your caregiver."


def test_model_saying_it_does_not_know_is_logged_as_no_data(client, seeded, ollama):
    says(ollama, "I don’t have that saved yet. You can ask Ana.")
    body = ask(client, "What is my favorite color?")  # "favorite" finds memories, none about a color
    assert ollama.called
    assert body["answer"] == NO_DATA and body["answer_mode"] == "no_data" and body["memory_ids"] == []


def test_who_is_falls_back_to_a_memory_search(client, seeded, ollama):
    says(ollama, "Ernesto was your husband.")
    body = ask(client, "Who is Ernesto?")  # not in people, only in a verified memory
    assert body["answer_mode"] == "llm" and body["intent"] == "who_is"
    assert body["memory_ids"] == ["seed-mem-husband"] and body["people"] == []


def test_general_question_shows_only_the_people_the_answer_mentions(client, seeded, ollama):
    says(ollama, "Ana loves sunflowers.")
    body = ask(client, "What is Ana's favorite flower?")
    assert body["answer_mode"] == "llm" and body["intent"] == "general"
    assert "seed-mem-ana-flower" in body["memory_ids"]
    assert [p["id"] for p in body["people"]] == ["seed-person-ana"]


@pytest.mark.parametrize("failure", [httpx.ReadTimeout("slow"), httpx.ConnectError("down")])
def test_llm_failure_gives_a_fallback_answer(client, seeded, ollama, failure):
    ollama.side_effect = failure
    body = ask(client, "Who is Ana?")
    assert body["answer_mode"] == "fallback"
    assert body["answer"] == (
        "Ana Santos-Reyes (Ana) is your daughter. Your eldest. She lives with you and helps you every day. "
        "Ana is your daughter. She is your eldest child and lives with you."
    )
    assert body["memory_ids"] == ["seed-person-ana", "seed-mem-ana-daughter"]
    assert [p["id"] for p in body["people"]] == ["seed-person-ana"]


def test_fallback_for_a_general_question_reads_only_the_closest_memory(client, seeded, ollama):
    ollama.side_effect = httpx.ConnectError("down")
    body = ask(client, "What is my favorite food?")  # "favorite" also matches the singer and Ana's flower
    assert body["answer"] == "Your favorite food is sinigang na hipon."
    assert body["answer_mode"] == "fallback" and body["memory_ids"] == ["seed-mem-favorite-food"]
    assert body["people"] == []


def test_every_answer_is_logged_with_the_records_it_used(client, seeded, ollama):
    says(ollama, "Ana is your daughter.")
    answers = [ask(client, q) for q in ("Who is Ana?", "What is next?", "Ano ang gamot ko?", "What is my blood type?")]

    rows = logs(seeded)
    assert [r["question"] for r in rows] == ["Who is Ana?", "What is next?", "Ano ang gamot ko?", "What is my blood type?"]
    assert [r["intent"] for r in rows] == ["who_is", "next_event", "medication", "general"]
    assert [r["answer_mode"] for r in rows] == ["llm", "template", "template", "no_data"]
    for row, body in zip(rows, answers):
        assert row["answer"] == body["answer"] and row["input_mode"] == "text" and row["flagged"] == 0
        assert json.loads(row["memory_ids"]) == body["memory_ids"]


@pytest.mark.parametrize("payload", [{}, {"text": ""}, {"text": "   "}, {"text": 5}, {"question": "Who is Ana?"}])
def test_empty_question_is_rejected(client, seeded, payload):
    response = client.post("/assistant/ask", json=payload, headers=PATIENT_HEADERS)
    assert response.status_code == 422 and "text is required" in response.json()["detail"]
    assert logs(seeded) == []


def test_ask_needs_a_role_but_no_pin(client, seeded):
    assert client.post("/assistant/ask", json={"text": "What is next?"}).status_code == 401
    assert ask(client, "What is next?")["answer_mode"] == "template"
    viewer = factories.make_caregiver(seeded, access_level=ACCESS_VIEWER)
    assert ask(client, "What is next?", factories.caregiver_headers(viewer))["answer_mode"] == "template"


# ───────────────────────────────── AST-5 voice ──────────────────────────────────


@pytest.fixture
def whisper(monkeypatch):
    """Stands in for the Whisper model: records the file it was given and returns `heard`."""
    state = {"heard": "", "paths": [], "existed": []}

    def transcribe(path):
        state["paths"].append(path)
        state["existed"].append(os.path.isfile(path) and os.path.getsize(path) > 0)
        if isinstance(state["heard"], Exception):
            raise state["heard"]
        return state["heard"]

    monkeypatch.setattr(stt, "transcribe", transcribe)
    return state


def say(client, audio=b"fake-m4a-bytes"):
    return client.post(
        "/assistant/voice", files={"audio": ("question.m4a", audio, "audio/m4a")}, headers=PATIENT_HEADERS
    )


def test_voice_runs_the_same_pipeline_and_returns_the_transcript(client, seeded, whisper):
    whisper["heard"] = " What medicine do I take? "
    body = say(client).json()

    assert body == {**ask(client, "What medicine do I take?"), "transcript": "What medicine do I take?"}
    voice_row, text_row = logs(seeded)
    assert voice_row["input_mode"] == "voice" and voice_row["question"] == "What medicine do I take?"
    assert text_row["input_mode"] == "text"


@pytest.mark.parametrize("heard", ["", "   ", stt.AudioUnreadable("cannot decode")])
def test_unintelligible_recording_is_not_guessed(client, seeded, whisper, heard):
    whisper["heard"] = heard
    response = say(client)
    assert response.status_code == 200
    body = response.json()
    assert body["answer"].startswith("Sorry, I didn't catch that")
    assert body["transcript"] == "" and body["memory_ids"] == [] and body["people"] == []
    assert logs(seeded) == []


def test_empty_upload_is_not_sent_to_whisper(client, seeded, whisper):
    assert say(client, audio=b"").json()["answer"].startswith("Sorry, I didn't catch that")
    assert whisper["paths"] == []


@pytest.mark.parametrize("heard", ["Who is Ana?", "", stt.AudioUnreadable("bad"), stt.STTLoadError("no model")])
def test_uploaded_audio_is_deleted_after_transcription(client, seeded, whisper, ollama, heard):
    ollama.side_effect = httpx.ConnectError("down")
    whisper["heard"] = heard
    response = say(client)
    assert response.status_code == (503 if isinstance(heard, stt.STTLoadError) else 200)
    assert whisper["existed"] == [True]
    assert not os.path.exists(whisper["paths"][0])


def test_voice_needs_an_audio_file(client, seeded):
    assert client.post("/assistant/voice", headers=PATIENT_HEADERS).status_code == 422


# ─────────────────────────── AST-6 flag a wrong answer ──────────────────────────


@pytest.fixture
def editor(seeded):
    return factories.caregiver_headers(factories.make_caregiver(seeded))


def test_caregiver_lists_recent_answers_with_the_records_used(client, seeded, ollama, editor):
    says(ollama, "Ana is your daughter.")
    ask(client, "Who is Ana?")
    ask(client, "What is next?")
    ask(client, "What is my blood type?")

    listed = client.get("/assistant/log", headers=editor).json()
    assert [r["question"] for r in listed] == ["What is my blood type?", "What is next?", "Who is Ana?"]
    assert listed[0]["records"] == []
    assert listed[1]["records"] == [{
        "id": "seed-sched-miguel-visit", "type": "schedule_item", "label": "Miguel visits",
        "detail": "2026-10-03 15:00:00", "trust": None,
    }]
    who = listed[2]["records"]
    assert who[0] == {
        "id": "seed-person-ana", "type": "person", "label": "Ana Santos-Reyes", "detail": "daughter",
        "trust": "verified",
    }
    assert {"memory"} == {r["type"] for r in who[1:]} and who[1]["detail"]
    assert len(client.get("/assistant/log?limit=2", headers=editor).json()) == 2


def test_a_deleted_record_is_still_listed(client, seeded, editor):
    ask(client, "What is next?")
    seeded.execute("DELETE FROM schedule_items WHERE id = 'seed-sched-miguel-visit'")
    assert client.get("/assistant/log", headers=editor).json()[0]["records"] == [
        {"id": "seed-sched-miguel-visit", "type": "deleted", "label": None, "detail": None, "trust": None}
    ]


def test_flag_and_unflag(client, seeded, editor):
    ask(client, "What is next?")
    ask(client, "What is my blood type?")
    log_id = logs(seeded)[0]["id"]

    flagged = client.post(f"/assistant/log/{log_id}/flag", headers=editor)
    assert flagged.status_code == 200 and flagged.json()["flagged"] == 1
    assert flagged.json()["records"][0]["id"] == "seed-sched-miguel-visit"
    assert [r["id"] for r in client.get("/assistant/log?flagged=true", headers=editor).json()] == [log_id]
    assert len(client.get("/assistant/log?flagged=false", headers=editor).json()) == 1
    admin = {"X-Role": "caregiver", "X-Caregiver-Id": "seed-cg-ana"}
    assert [r["id"] for r in client.get("/dashboard", headers=admin).json()["flagged_answers"]] == [log_id]

    cleared = client.post(f"/assistant/log/{log_id}/flag", json={"flagged": False}, headers=editor)
    assert cleared.json()["flagged"] == 0
    assert client.get("/assistant/log?flagged=true", headers=editor).json() == []


def test_flag_errors(client, seeded, editor):
    ask(client, "What is next?")
    log_id = logs(seeded)[0]["id"]
    assert client.post("/assistant/log/nope/flag", headers=editor).status_code == 404
    assert client.post(f"/assistant/log/{log_id}/flag", json={"flagged": "yes"}, headers=editor).status_code == 422


def test_patient_and_viewer_cannot_flag(client, seeded):
    ask(client, "What is next?")
    log_id = logs(seeded)[0]["id"]
    viewer = factories.caregiver_headers(factories.make_caregiver(seeded, access_level=ACCESS_VIEWER))

    assert client.get("/assistant/log", headers=PATIENT_HEADERS).status_code == 403
    assert client.post(f"/assistant/log/{log_id}/flag", headers=PATIENT_HEADERS).status_code == 403
    assert client.get("/assistant/log").status_code == 401
    assert client.get("/assistant/log", headers=viewer).status_code == 200  # a viewer may read
    assert client.post(f"/assistant/log/{log_id}/flag", headers=viewer).status_code == 403
    assert logs(seeded)[0]["flagged"] == 0
