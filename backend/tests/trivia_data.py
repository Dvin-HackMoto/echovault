# Mock data for the Trivia tests: one small household, built with the factories.
#
# Trivia depends on Memories, Schedule and Settings. This puts rows for all three in the
# test database, so the trivia rules are tested without the demo seed, without the
# Memories router (not built yet) and without assets/trivia.json.
#
#   from tests import trivia_data
#   home = trivia_data.build(db)      # {"questions": {...}, "memories": {...}, ...} of ids
#
# The clock in these tests is NOW unless a test says otherwise.
import json
from datetime import datetime

from app.constants import (
    SCHEDULE_ACTIVITY, SCHEDULE_MEAL, SCHEDULE_ROUTINE, SCHEDULE_VISIT, SETTINGS_DEFAULTS, TRIVIA_FAMILY,
    TRIVIA_GENERAL, TRIVIA_PERSONAL, TRIVIA_ROUTINE, TRIVIA_SOURCE_CAREGIVER, TRUST_CONFLICTING,
    TRUST_OUTDATED, TRUST_UNVERIFIED, VALIDITY_ARCHIVED, VALIDITY_SCHEDULED, VALIDITY_TEMPORARY,
)
from tests.factories import make_caregiver, make_memory, make_person, make_schedule_item, make_trivia_question

NOW = datetime(2026, 10, 10, 10, 30)  # a Saturday, mid-morning, nothing scheduled nearby

# Questions that may be shown at NOW with the default settings (difficulty 1, topics
# family_names / relationships / routines).
ASKABLE_BY_DEFAULT = {"flower", "plants", "paolo", "visit_today", "sky"}
# Questions whose memory must never reach the patient, whatever the settings are.
NEVER_ASKABLE = {"cousin", "old_doctor", "conflict", "archived", "ended", "upcoming", "off", "off_general"}


def set_setting(db, key, value):
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value)),
    )


def build(db):
    caregiver = make_caregiver(db, name="Ana Santos-Reyes")
    for key, value in SETTINGS_DEFAULTS.items():
        set_setting(db, key, value)

    people = {
        "ana": make_person(db, name="Ana Santos-Reyes", nickname="Ana", relationship="daughter",
                           photo_path="ana.png"),
        "carmen": make_person(db, name="Carmen Villanueva", relationship="cousin", trust=TRUST_UNVERIFIED),
    }

    def memory(content, **fields):
        return make_memory(db, content=content, verified_by=caregiver["id"], **fields)

    memories = {
        # usable at NOW
        "flower": memory("Ana loves sunflowers.", person_id=people["ana"]["id"]),
        "plants": memory("You water the plants every morning after breakfast."),
        "paolo": memory("Paolo is your grandson.", person_id=people["carmen"]["id"]),
        "church": memory("You hear Mass at Malolos Church on Sundays."),
        "visit_today": memory("Miguel is visiting this afternoon.", validity=VALIDITY_TEMPORARY,
                              valid_until="2026-10-10"),
        # not usable: each one for a different reason
        "cousin": memory("Carmen is your cousin from Pampanga.", trust=TRUST_UNVERIFIED),
        "old_doctor": memory("Dr. Reyes is your doctor.", trust=TRUST_OUTDATED),
        "conflict": memory("Bea is in high school.", trust=TRUST_CONFLICTING),
        "archived": memory("You used to walk to the plaza every day.", validity=VALIDITY_ARCHIVED),
        "ended": memory("Liza is on leave this week.", validity=VALIDITY_TEMPORARY, valid_until="2026-10-09"),
        "upcoming": memory("Paolo's birthday merienda is on the 25th.", validity=VALIDITY_SCHEDULED,
                           valid_from="2026-10-12 00:00:00"),
    }

    def about(key, memory_key, kind, topic, question, answer, **fields):
        return make_trivia_question(
            db, id=f"mock-{key}", kind=kind, topic=topic, question=question, answer=answer,
            memory_id=memories[memory_key]["id"], source=TRIVIA_SOURCE_CAREGIVER, **fields,
        )

    def general(key, question, answer, choices, **fields):
        return make_trivia_question(
            db, id=f"mock-{key}", kind=TRIVIA_GENERAL, topic="nature", question=question, answer=answer,
            choices=choices, **fields,
        )

    questions = {
        "flower": about("flower", "flower", TRIVIA_FAMILY, "relationships",
                        "Ana is your daughter. Do you remember her favorite flower?", "Sunflowers",
                        choices=["Sunflowers", "Roses", "Sampaguita"]),
        "plants": about("plants", "plants", TRIVIA_ROUTINE, "routines",
                        "What do you usually do every morning after breakfast?", "Water the plants"),
        "paolo": about("paolo", "paolo", TRIVIA_PERSONAL, "family_names", "Who is Paolo?", "My grandson",
                       choices=["My grandson", "My neighbor", "My doctor"]),
        "visit_today": about("visit_today", "visit_today", TRIVIA_FAMILY, "family_names",
                             "Who is visiting you this afternoon?", "Miguel"),
        # usable memory, but only with other settings
        "church": about("church", "church", TRIVIA_PERSONAL, "familiar_places",
                        "Where do you hear Mass on Sundays?", "Malolos Church"),
        "hard": about("hard", "flower", TRIVIA_FAMILY, "relationships",
                      "Which flower did Ana plant by the gate?", "Sunflowers", difficulty=3),
        # never: switched off, or the memory is not verified and valid
        "off": about("off", "flower", TRIVIA_FAMILY, "relationships", "What does Ana love?", "Sunflowers",
                     is_active=0),
        "cousin": about("cousin", "cousin", TRIVIA_FAMILY, "relationships", "Who is Carmen?", "My cousin"),
        "old_doctor": about("old_doctor", "old_doctor", TRIVIA_PERSONAL, "family_names",
                            "Who is your doctor?", "Dr. Reyes"),
        "conflict": about("conflict", "conflict", TRIVIA_FAMILY, "relationships",
                          "Where does Bea study?", "High school"),
        "archived": about("archived", "archived", TRIVIA_ROUTINE, "routines",
                          "Where do you walk every day?", "The plaza"),
        "ended": about("ended", "ended", TRIVIA_PERSONAL, "family_names", "Who is on leave this week?", "Liza"),
        "upcoming": about("upcoming", "upcoming", TRIVIA_FAMILY, "family_names",
                          "Whose birthday is on the 25th?", "Paolo"),
        "sky": general("sky", "What color is the sky on a clear day?", "Blue", ["Blue", "Green", "Red"]),
        "flag": general("flag", "How many stars are on the Philippine flag?", "Three", ["Three", "One", "Eight"],
                        difficulty=2),
        "off_general": general("off_general", "Which animal barks?", "A dog", ["A dog", "A bird"], is_active=0),
    }

    def item(title, kind, time, **fields):
        return make_schedule_item(db, title=title, kind=kind, starts_at=f"2026-10-01 {time}:00",
                                  recurrence="daily", **fields)

    schedule = {
        "breakfast": item("Breakfast", SCHEDULE_MEAL, "07:00", duration_min=30),
        "water_plants": item("Water the plants", SCHEDULE_ACTIVITY, "09:00", duration_min=20),
        "lunch": item("Lunch", SCHEDULE_MEAL, "12:00", duration_min=45),
        "nap": item("Afternoon rest", SCHEDULE_ROUTINE, "13:30", duration_min=60, is_quiet_period=1),
        # one-off, today, with no duration
        "visit": make_schedule_item(db, title="Miguel visits", kind=SCHEDULE_VISIT, starts_at="2026-10-10 16:00:00"),
        "bedtime": item("Bedtime", SCHEDULE_ROUTINE, "21:00", is_quiet_period=1),
    }

    ids = lambda rows: {key: row["id"] for key, row in rows.items()}  # noqa: E731
    return {
        "caregiver": caregiver["id"], "people": ids(people), "memories": ids(memories),
        "questions": ids(questions), "schedule": ids(schedule),
    }
