# Memory Games module (GAM-1, GAM-2, GAM-3). From backend/:  py -m pytest tests/test_games.py
#
# Rounds go through the real app and the real schema in this test's own storage folder.
# Generators are also called directly with a seeded rng and a fixed day where the
# answer depends on randomness or on today's date.

import json
import random
from datetime import date

import pytest

from app.constants import (
    CATEGORY_HISTORY, SCHEDULE_APPOINTMENT, SCHEDULE_MEAL, SCHEDULE_ROUTINE, TRIVIA_FAMILY,
    TRUST_CONFLICTING, TRUST_OUTDATED, TRUST_UNVERIFIED, VALIDITY_ARCHIVED, VALIDITY_TEMPORARY,
)
from app.features.games import generators
from tests.factories import (
    PATIENT_HEADERS, make_memory, make_person, make_place, make_schedule_item, make_trivia_question,
)

ALL_TOPICS = ["family_names", "relationships", "routines", "familiar_places", "recent_events"]
ROUND_KEYS = {"activity", "topic", "difficulty", "available", "reason", "questions"}
QUESTION_KEYS = {"id", "prompt", "photo_url", "choice_style", "choices", "answer_id", "answer_label"}
DAY = date(2026, 10, 10)


def set_settings(db, topics=None, difficulty=None):
    for key, value in (("game_topics", topics), ("game_difficulty", difficulty)):
        if value is not None:
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
    db.commit()


def family(db, n=5):
    """n verified people with photos and distinct names and relationships."""
    relations = ["daughter", "son", "grandson", "granddaughter", "neighbor", "doctor", "nurse"]
    return [
        make_person(db, name=f"Person{i}", relationship=relations[i], photo_path=f"p{i}.png")
        for i in range(n)
    ]


def round_of(db, game, seed=0):
    return generators.build_round(db, game, rng=random.Random(seed), day=DAY)


def choice_ids(rnd):
    return {c["id"] for q in rnd["questions"] for c in q["choices"]}


# ─────────────────────────────────── GAM-1 ──────────────────────────────────────


def test_family_matching_round_has_photos_answer_and_verified_wrong_choices(client, db):
    people = family(db, 4)
    hidden = [
        make_person(db, name="Unverified", trust=TRUST_UNVERIFIED, photo_path="u.png"),
        make_person(db, name="NoPhoto"),
    ]
    set_settings(db, ["family_names"], 3)

    res = client.get("/games/family_matching/round", headers=PATIENT_HEADERS)
    assert res.status_code == 200, res.text
    rnd = res.json()
    assert rnd["available"] is True and rnd["topic"] == "family_names" and rnd["difficulty"] == 3
    assert 1 <= len(rnd["questions"]) <= generators.QUESTIONS_PER_ROUND

    by_id = {p["id"]: p for p in people}
    for q in rnd["questions"]:
        assert q["choice_style"] == "photo"
        assert q["answer_id"] in {c["id"] for c in q["choices"]}
        assert by_id[q["answer_id"]]["name"] in q["prompt"]
        for c in q["choices"]:
            assert c["photo_url"] == f"/photos/{by_id[c['id']]['photo_path']}"
    assert not choice_ids(rnd) & {p["id"] for p in hidden}


def test_difficulty_sets_the_number_of_choices(db):
    family(db, 6)
    for difficulty in (1, 2, 3):
        set_settings(db, ["family_names"], difficulty)
        for game in ("family_matching", "name_recall"):
            rnd = round_of(db, game)
            assert {len(q["choices"]) for q in rnd["questions"]} == {difficulty + 1}


def test_choices_shrink_to_what_exists_but_never_below_two(db):
    family(db, 2)
    set_settings(db, ["family_names"], 3)
    rnd = round_of(db, "family_matching")
    assert rnd["available"] and {len(q["choices"]) for q in rnd["questions"]} == {2}


@pytest.mark.parametrize("game", ["family_matching", "name_recall"])
def test_too_few_verified_people_is_not_enough_data(client, db, game):
    make_person(db, name="Only", photo_path="only.png")
    make_person(db, name="Hidden", trust=TRUST_UNVERIFIED, photo_path="h.png")
    set_settings(db, ["family_names", "relationships"])
    rnd = client.get(f"/games/{game}/round", headers=PATIENT_HEADERS).json()
    assert rnd == {**rnd, "available": False, "reason": "not_enough_data", "questions": []}


def test_relationships_topic_asks_by_relationship_with_distinct_meanings(db):
    people = family(db, 4)
    make_person(db, name="Second Son", relationship="son", photo_path="s2.png")
    set_settings(db, ["relationships"], 3)
    rnd = round_of(db, "family_matching")
    assert rnd["topic"] == "relationships"
    relation = {p["id"]: p["relationship"] for p in people}
    for q in rnd["questions"]:
        assert q["prompt"].startswith("Which one is your ")
        labels = [c["label"] for c in q["choices"]]
        assert len(labels) == len(set(labels))
    nr = round_of(db, "name_recall")
    for q in nr["questions"]:
        assert q["photo_url"] and q["prompt"] == "Who is this person to you?"
        assert len({c["label"] for c in q["choices"]}) == len(q["choices"])
        if q["answer_id"] in relation:
            assert q["answer_label"] == f"Your {relation[q['answer_id']]}"


def test_name_recall_shows_the_photo_and_asks_for_the_name(db):
    people = {p["id"]: p for p in family(db, 3)}
    set_settings(db, ["family_names"], 2)
    for q in round_of(db, "name_recall")["questions"]:
        person = people[q["answer_id"]]
        assert q["photo_url"] == f"/photos/{person['photo_path']}"
        assert q["choice_style"] == "text" and q["answer_label"] == person["name"]


# ─────────────────────────────────── GAM-2 ──────────────────────────────────────


def test_round_needs_a_selected_topic(client, db):
    family(db, 3)
    set_settings(db, ["routines"])
    rnd = client.get("/games/family_matching/round", headers=PATIENT_HEADERS).json()
    assert rnd["available"] is False and rnd["reason"] == "topic_not_selected"


def test_round_uses_the_saved_difficulty(client, db):
    family(db, 5)
    set_settings(db, ["family_names"], 2)
    rnd = client.get("/games/name_recall/round", headers=PATIENT_HEADERS).json()
    assert rnd["difficulty"] == 2 and {len(q["choices"]) for q in rnd["questions"]} == {3}


@pytest.mark.parametrize("game", ["unknown", "trivia_prompt"])
def test_unknown_game_type_is_404(client, db, game):
    assert client.get(f"/games/{game}/round", headers=PATIENT_HEADERS).status_code == 404


def test_games_need_a_role_header(client, db):
    assert client.get("/games/family_matching/round").status_code == 401
    assert client.post("/games/result", json={"activity": "name_recall", "outcome": "completed"}).status_code == 401


def test_result_stores_activity_topic_outcome_difficulty_and_duration(client, db):
    body = {"activity": "family_matching", "topic": "family_names", "outcome": "completed",
            "difficulty": 2, "duration_sec": 95, "question_ref": "round-1"}
    res = client.post("/games/result", json=body, headers=PATIENT_HEADERS)
    assert res.status_code == 201, res.text
    row = dict(db.execute("SELECT * FROM activity_log WHERE id = ?", (res.json()["id"],)).fetchone())
    assert {k: row[k] for k in body} == body
    assert row["created_at"]


@pytest.mark.parametrize("outcome", ["skipped", "stopped", "completed"])
def test_skipped_and_stopped_are_accepted(client, db, outcome):
    res = client.post("/games/result", json={"activity": "routine_recall", "outcome": outcome},
                      headers=PATIENT_HEADERS)
    assert res.status_code == 201 and res.json()["outcome"] == outcome


@pytest.mark.parametrize("body", [
    {"activity": "trivia_prompt", "outcome": "completed"},
    {"activity": "chess", "outcome": "completed"},
    {"activity": "name_recall", "outcome": "won"},
    {"activity": "name_recall", "outcome": "completed", "topic": "politics"},
    {"activity": "name_recall", "outcome": "completed", "difficulty": 4},
    {"activity": "name_recall", "outcome": "completed", "difficulty": True},
    {"activity": "name_recall", "outcome": "completed", "duration_sec": -1},
    {"activity": "name_recall", "outcome": "completed", "question_ref": 7},
])
def test_invalid_results_are_rejected(client, db, body):
    assert client.post("/games/result", json=body, headers=PATIENT_HEADERS).status_code == 422
    assert db.execute("SELECT COUNT(*) FROM activity_log").fetchone()[0] == 0


def test_results_show_on_the_dashboard_as_engagement_only(client, db, caregiver_client_headers):
    for outcome in ("completed", "stopped", "skipped"):
        client.post("/games/result", json={"activity": "name_recall", "topic": "family_names",
                                           "outcome": outcome}, headers=PATIENT_HEADERS)
    summary = client.get("/dashboard", headers=caregiver_client_headers).json()["activity_summary"]
    assert summary == [{"activity": "name_recall", "topic": "family_names",
                        "played_count": 2, "skipped_count": 1}]


# ─────────────────────────────────── GAM-3 ──────────────────────────────────────


def test_event_recall_only_uses_verified_valid_history(db):
    home, church, _ = make_place(db, name="Home"), make_place(db, name="Church"), make_place(db, name="Market")
    hidden_place = make_place(db, name="Unverified place", trust=TRUST_UNVERIFIED)
    good = make_memory(db, title="Your birthday", category=CATEGORY_HISTORY, place_id=home["id"])
    bad = [
        make_memory(db, title="Unverified", category=CATEGORY_HISTORY, place_id=church["id"], trust=TRUST_UNVERIFIED),
        make_memory(db, title="Outdated", category=CATEGORY_HISTORY, place_id=church["id"], trust=TRUST_OUTDATED),
        make_memory(db, title="Conflict", category=CATEGORY_HISTORY, place_id=church["id"], trust=TRUST_CONFLICTING),
        make_memory(db, title="Archived", category=CATEGORY_HISTORY, place_id=church["id"],
                    validity=VALIDITY_ARCHIVED),
        make_memory(db, title="Expired", category=CATEGORY_HISTORY, place_id=church["id"],
                    validity=VALIDITY_TEMPORARY, valid_until="2020-01-01 00:00:00"),
        make_memory(db, title="Linked to hidden place", category=CATEGORY_HISTORY, place_id=hidden_place["id"]),
    ]
    set_settings(db, ["recent_events"], 3)

    rnd = round_of(db, "event_recall")
    assert rnd["available"] and rnd["topic"] == "recent_events"
    assert [q["id"] for q in rnd["questions"]] == [f"{good['id']}:place"]
    q = rnd["questions"][0]
    assert q["answer_id"] == home["id"] and "Your birthday" in q["prompt"]
    assert hidden_place["id"] not in choice_ids(rnd)
    assert not any(m["title"] in q["prompt"] for m in bad)


def test_memory_quiz_only_uses_trivia_linked_to_usable_memories_on_selected_topics(db):
    shown = make_trivia_question(db, kind=TRIVIA_FAMILY, topic="relationships", question="Ana's flower?",
                                 answer="Sunflowers", choices=["Sunflowers", "Roses", "Lilies"],
                                 memory_id=make_memory(db)["id"])
    open_recall = make_trivia_question(db, kind=TRIVIA_FAMILY, topic=None, question="Who visits on Saturday?",
                                       answer="Miguel", memory_id=make_memory(db)["id"])
    hidden = [
        make_trivia_question(db, kind=TRIVIA_FAMILY, topic="relationships", answer="X", choices=["X", "Y"],
                             memory_id=make_memory(db, trust=TRUST_UNVERIFIED)["id"]),
        make_trivia_question(db, kind=TRIVIA_FAMILY, topic="routines", answer="X", choices=["X", "Y"],
                             memory_id=make_memory(db)["id"]),
        make_trivia_question(db, kind=TRIVIA_FAMILY, topic="relationships", answer="X", choices=["X", "Y"],
                             memory_id=make_memory(db)["id"], is_active=0),
        make_trivia_question(db, kind=TRIVIA_FAMILY, topic="relationships", answer="Not listed",
                             choices=["X", "Y"], memory_id=make_memory(db)["id"]),
        make_trivia_question(db, topic="relationships", answer="general trivia", choices=["a", "b"]),
    ]
    set_settings(db, ["relationships"], 1)

    rnd = round_of(db, "memory_quiz")
    by_id = {q["id"]: q for q in rnd["questions"]}
    assert set(by_id) == {shown["id"], open_recall["id"]}
    assert not set(by_id) & {h["id"] for h in hidden}

    mc = by_id[shown["id"]]
    assert len(mc["choices"]) == 2 and mc["answer_label"] == "Sunflowers"
    assert next(c for c in mc["choices"] if c["id"] == mc["answer_id"])["label"] == "Sunflowers"
    assert by_id[open_recall["id"]]["choices"] == [] and by_id[open_recall["id"]]["answer_id"] is None
    assert by_id[open_recall["id"]]["answer_label"] == "Miguel"


def test_routine_recall_asks_for_the_next_activity_in_routine_order(db):
    titles = [("06:30", "Wake up", SCHEDULE_ROUTINE), ("07:00", "Breakfast", SCHEDULE_MEAL),
              ("12:00", "Lunch", SCHEDULE_MEAL), ("18:30", "Dinner", SCHEDULE_MEAL)]
    for at, title, kind in reversed(titles):  # inserted out of order on purpose
        make_schedule_item(db, title=title, kind=kind, starts_at=f"2026-10-01 {at}:00", recurrence="daily")
    make_schedule_item(db, title="Check-up", kind=SCHEDULE_APPOINTMENT, starts_at="2026-10-10 09:00:00")
    make_schedule_item(db, title="Old routine", kind=SCHEDULE_ROUTINE, starts_at="2026-10-01 10:00:00",
                       recurrence="daily", is_active=0)
    set_settings(db, ["routines"], 3)

    rnd = round_of(db, "routine_recall")
    assert rnd["available"] and rnd["topic"] == "routines"
    order = [t for _, t, _ in titles]
    expected = {f"After {a}, what comes next?": b for a, b in zip(order, order[1:])}
    assert [q["prompt"] for q in rnd["questions"]] == list(expected)
    for q in rnd["questions"]:
        assert q["answer_label"] == expected[q["prompt"]]
        labels = {c["label"] for c in q["choices"]}
        assert labels <= set(order) and "Check-up" not in labels and "Old routine" not in labels


def test_picture_matching_uses_verified_place_photos(db):
    places = [make_place(db, name=n, photo_path=f"{n}.png") for n in ("Home", "Church", "Plaza")]
    make_place(db, name="Hidden", photo_path="hidden.png", trust=TRUST_UNVERIFIED)
    set_settings(db, ["familiar_places"], 3)
    rnd = round_of(db, "picture_matching")
    assert rnd["available"] and rnd["topic"] == "familiar_places"
    names = {p["id"]: p["name"] for p in places}
    for q in rnd["questions"]:
        assert q["photo_url"] == f"/photos/{names[q['answer_id']]}.png"
        assert {c["label"] for c in q["choices"]} <= set(names.values())


def test_every_game_returns_the_same_round_shape(client, db):
    people = family(db, 4)
    places = [make_place(db, name=n, photo_path=f"{n}.png") for n in ("Home", "Church")]
    make_memory(db, title="Fiesta", category=CATEGORY_HISTORY, place_id=places[0]["id"], person_id=people[0]["id"])
    make_trivia_question(db, kind=TRIVIA_FAMILY, topic="family_names", answer="A", choices=["A", "B"],
                         memory_id=make_memory(db)["id"])
    for at, title in (("07:00", "Breakfast"), ("12:00", "Lunch"), ("18:00", "Dinner")):
        make_schedule_item(db, title=title, kind=SCHEDULE_MEAL, starts_at=f"2026-01-01 {at}:00", recurrence="daily")
    set_settings(db, ALL_TOPICS, 2)

    for game in generators.GAME_TYPES:
        rnd = client.get(f"/games/{game}/round", headers=PATIENT_HEADERS).json()
        assert set(rnd) == ROUND_KEYS, game
        assert rnd["activity"] == game and rnd["available"], (game, rnd["reason"])
        for q in rnd["questions"]:
            assert set(q) == QUESTION_KEYS, game
            for c in q["choices"]:
                assert set(c) == {"id", "label", "photo_url"}


def test_no_game_ever_shows_unverified_rows(db):
    """Every id in every round, over many shuffles, comes from verified usable rows."""
    people = family(db, 5)
    home = make_place(db, name="Home", photo_path="home.png")
    church = make_place(db, name="Church", photo_path="church.png")
    unverified = {
        make_person(db, name="Stranger", trust=TRUST_UNVERIFIED, photo_path="x.png")["id"],
        make_person(db, name="Old friend", trust=TRUST_OUTDATED, photo_path="y.png")["id"],
        make_place(db, name="Unverified market", trust=TRUST_UNVERIFIED, photo_path="m.png")["id"],
    }
    bad_memory = make_memory(db, title="Rumor", category=CATEGORY_HISTORY, trust=TRUST_UNVERIFIED,
                             place_id=home["id"], photo_path="rumor.png")
    unverified.add(bad_memory["id"])
    unverified.add(make_trivia_question(db, kind=TRIVIA_FAMILY, topic="family_names", answer="A",
                                        choices=["A", "B"], memory_id=bad_memory["id"])["id"])
    make_memory(db, title="Fiesta", category=CATEGORY_HISTORY, place_id=church["id"],
                person_id=people[1]["id"], photo_path="fiesta.png")
    set_settings(db, ALL_TOPICS, 3)

    for seed in range(25):
        for game in generators.GAME_TYPES:
            rnd = round_of(db, game, seed)
            ids = choice_ids(rnd) | {q["id"].split(":")[0] for q in rnd["questions"]}
            assert not ids & unverified, (game, seed)
            assert all("Rumor" not in q["prompt"] for q in rnd["questions"])
