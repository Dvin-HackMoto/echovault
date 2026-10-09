# demo patient, family, routine, meds, memories, photos
#
# Mock data for demos and for developing other modules. Every row has a fixed id and
# is inserted only if that id is missing, so running this twice changes nothing and
# never overwrites a caregiver's edits. Dates are fixed calendar dates: move the
# one-off appointments below forward before a demo. clear_demo() (or --clear) removes
# these rows again and leaves real data alone.
import argparse
import json
import shutil
import sqlite3
import sys

from app import config
from app.constants import (
    ACCESS_ADMIN, ACCESS_EDITOR,
    CATEGORY_CARE_SAFETY, CATEGORY_HISTORY, CATEGORY_IDENTITY, CATEGORY_PREFERENCE, CATEGORY_ROUTINE,
    IMPORTANCE_CRITICAL, IMPORTANCE_GENERAL, IMPORTANCE_IMPORTANT,
    SCHEDULE_ACTIVITY, SCHEDULE_APPOINTMENT, SCHEDULE_MEAL, SCHEDULE_ROUTINE, SCHEDULE_VISIT,
    SOURCE_AI_SUGGESTED, SOURCE_CAREGIVER, SOURCE_PATIENT,
    TRIVIA_FAMILY, TRIVIA_ROUTINE, TRIVIA_SOURCE_CAREGIVER,
    TRUST_CONFLICTING, TRUST_OUTDATED, TRUST_UNVERIFIED, TRUST_VERIFIED,
    VALIDITY_PERSISTENT, VALIDITY_TEMPORARY,
)
from app.database.connection import connect, migrate
from app.features.auth.service import hash_pin

SEED_PHOTOS_DIR = config.ASSETS_DIR / "seed_photos"

# known demo PINs (caregiver id -> PIN); never reuse these outside the demo
DEMO_PINS = {"seed-cg-ana": "1234", "seed-cg-liza": "5678"}

VERIFIED_AT = "2026-10-01 09:00:00"
ANA, LIZA = "seed-cg-ana", "seed-cg-liza"

PATIENT = {
    "id": 1, "full_name": "Maria Elena Santos", "preferred_name": "Lola Nena",
    "birth_date": "1948-03-12", "photo_path": "seed-nena.png", "language": "fil-en",
    "font_scale": 1.4, "voice_enabled": 1, "managed_mode": 0,
}

CAREGIVERS = [
    {"id": ANA, "name": "Ana Santos-Reyes", "relationship": "daughter", "access_level": ACCESS_ADMIN},
    {"id": LIZA, "name": "Liza Cruz", "relationship": "nurse", "access_level": ACCESS_EDITOR},
]

SETTINGS = {
    "game_topics": ["family_names", "relationships", "routines"],
    "trivia_frequency_min": 120,
    "quiet_hours": {"start": "21:00", "end": "07:00"},
    "game_difficulty": 1,
}


def _person(slug, name, relationship, *, nickname=None, notes=None, photo=True,
            is_caregiver=0, trust=TRUST_VERIFIED):
    return {
        "id": f"seed-person-{slug}", "name": name, "nickname": nickname,
        "relationship": relationship, "photo_path": f"seed-{slug}.png" if photo else None,
        "notes": notes, "is_caregiver": is_caregiver, "trust": trust, "created_by": ANA,
    }


PEOPLE = [
    _person("ana", "Ana Santos-Reyes", "daughter", nickname="Ana", is_caregiver=1,
            notes="Your eldest. She lives with you and helps you every day."),
    _person("miguel", "Miguel Santos", "son", nickname="Migs",
            notes="Your son. He visits every Saturday afternoon."),
    _person("paolo", "Paolo Reyes", "grandson", nickname="Pao",
            notes="Ana's son. He is in college."),
    _person("bea", "Beatriz Reyes", "granddaughter", nickname="Bea",
            notes="Ana's daughter. She loves to bake with you."),
    _person("rosa", "Rosa Dela Cruz", "neighbor", nickname="Aling Rosa",
            notes="Your neighbor and friend for many years."),
    _person("dr-cruz", "Dr. Ramon Cruz", "doctor", nickname="Dr. Cruz",
            notes="Your doctor at the health center."),
    _person("liza", "Liza Cruz", "nurse", nickname="Nurse Liza",
            notes="She checks on you on weekday mornings."),
    # waiting for a caregiver to verify
    _person("carmen", "Carmen Villanueva", "cousin", photo=False, trust=TRUST_UNVERIFIED,
            notes="Cousin from Pampanga."),
]

PLACES = [
    {"id": "seed-place-home", "name": "Home", "description": "Your house, where you live with Ana.",
     "address": "Malolos, Bulacan", "trust": TRUST_VERIFIED},
    {"id": "seed-place-church", "name": "Malolos Church", "description": "Where you hear Mass on Sundays.",
     "address": "Malolos, Bulacan", "trust": TRUST_VERIFIED},
    {"id": "seed-place-health-center", "name": "Barangay Health Center",
     "description": "Where Dr. Cruz holds your check-ups.", "address": "Malolos, Bulacan", "trust": TRUST_VERIFIED},
    {"id": "seed-place-palengke", "name": "Malolos Public Market", "description": "The palengke.",
     "address": "Malolos, Bulacan", "trust": TRUST_UNVERIFIED},
]


def _item(slug, title, kind, starts_at, *, recurrence=None, duration=None, person=None,
          place=None, notes=None, remind=30, quiet=0):
    return {
        "id": f"seed-sched-{slug}", "title": title, "kind": kind, "starts_at": starts_at,
        "duration_min": duration, "recurrence": recurrence,
        "person_id": f"seed-person-{person}" if person else None,
        "place_id": f"seed-place-{place}" if place else None,
        "notes": notes, "remind_before_min": remind, "is_quiet_period": quiet,
    }


SCHEDULE_ITEMS = [
    # daily routine
    _item("wake", "Wake up and morning prayer", SCHEDULE_ROUTINE, "2026-10-01 06:30:00", recurrence="daily", remind=0),
    _item("breakfast", "Breakfast", SCHEDULE_MEAL, "2026-10-01 07:00:00", recurrence="daily", duration=30, remind=10),
    _item("plants", "Water the plants", SCHEDULE_ACTIVITY, "2026-10-01 09:00:00", recurrence="daily", duration=20,
          remind=10),
    _item("lunch", "Lunch", SCHEDULE_MEAL, "2026-10-01 12:00:00", recurrence="daily", duration=45, remind=10),
    _item("nap", "Afternoon rest", SCHEDULE_ROUTINE, "2026-10-01 13:30:00", recurrence="daily", duration=60, remind=0,
          quiet=1),
    _item("merienda", "Merienda", SCHEDULE_MEAL, "2026-10-01 15:30:00", recurrence="daily", duration=20, remind=10),
    _item("dinner", "Dinner", SCHEDULE_MEAL, "2026-10-01 18:30:00", recurrence="daily", duration=45, remind=10),
    _item("bedtime", "Bedtime", SCHEDULE_ROUTINE, "2026-10-01 21:00:00", recurrence="daily", remind=15, quiet=1),
    # weekly
    _item("mass", "Sunday Mass", SCHEDULE_ACTIVITY, "2026-10-04 08:00:00", recurrence="weekly:SU", duration=75,
          person="ana", place="church", remind=60),
    _item("miguel-visit", "Miguel visits", SCHEDULE_VISIT, "2026-10-03 15:00:00", recurrence="weekly:SA",
          duration=120, person="miguel", place="home"),
    # one-off: fixed dates, move these forward before a demo
    _item("checkup", "Check-up with Dr. Cruz", SCHEDULE_APPOINTMENT, "2026-10-20 10:00:00", duration=45,
          person="dr-cruz", place="health-center", notes="Ana will bring you.", remind=60),
    _item("paolo-birthday", "Paolo's birthday merienda", SCHEDULE_VISIT, "2026-10-25 15:00:00", duration=120,
          person="paolo", place="home"),
]

# demo medicines only, not medical advice
MEDICATIONS = [
    {"id": "seed-med-losartan", "name": "Losartan", "dose": "1 tablet", "instructions": "after dinner",
     "photo_path": "seed-losartan.png", "start_date": "2026-01-10", "created_by": ANA},
    {"id": "seed-med-metformin", "name": "Metformin", "dose": "1 tablet", "instructions": "after breakfast",
     "photo_path": "seed-metformin.png", "start_date": "2026-01-10", "created_by": ANA},
    {"id": "seed-med-vitamin-b", "name": "Vitamin B complex", "dose": "1 capsule", "instructions": "after breakfast",
     "photo_path": "seed-vitamin-b.png", "start_date": "2026-06-01", "created_by": LIZA},
]

MEDICATION_TIMES = [
    {"id": "seed-medtime-losartan-pm", "medication_id": "seed-med-losartan", "time_of_day": "20:00", "days": "daily"},
    {"id": "seed-medtime-metformin-am", "medication_id": "seed-med-metformin", "time_of_day": "08:00", "days": "daily"},
    {"id": "seed-medtime-vitamin-b-am", "medication_id": "seed-med-vitamin-b", "time_of_day": "08:00", "days": "MO,WE,FR"},
]


def _memory(slug, title, content, category, *, importance=IMPORTANCE_GENERAL, trust=TRUST_VERIFIED,
            validity=VALIDITY_PERSISTENT, valid_from=None, valid_until=None, event_date=None,
            person=None, place=None, source=SOURCE_CAREGIVER, conflicts_with=None):
    verified = trust == TRUST_VERIFIED
    return {
        "id": f"seed-mem-{slug}", "title": title, "content": content, "category": category,
        "importance": importance, "trust": trust, "validity": validity,
        "valid_from": valid_from, "valid_until": valid_until, "event_date": event_date,
        "person_id": f"seed-person-{person}" if person else None,
        "place_id": f"seed-place-{place}" if place else None,
        "source": source,
        "conflicts_with": f"seed-mem-{conflicts_with}" if conflicts_with else None,
        "verified_by": ANA if verified else None,
        "verified_at": VERIFIED_AT if verified else None,
    }


MEMORIES = [
    # identity
    _memory("ana-daughter", "Who Ana is", "Ana is your daughter. She is your eldest child and lives with you.",
            CATEGORY_IDENTITY, importance=IMPORTANCE_IMPORTANT, person="ana"),
    _memory("miguel-son", "Who Miguel is", "Miguel is your son. He works in Quezon City and visits every Saturday.",
            CATEGORY_IDENTITY, importance=IMPORTANCE_IMPORTANT, person="miguel"),
    _memory("paolo-grandson", "Who Paolo is", "Paolo is your grandson. He is Ana's son.",
            CATEGORY_IDENTITY, importance=IMPORTANCE_IMPORTANT, person="paolo"),
    _memory("bea-granddaughter", "Who Bea is", "Bea is your granddaughter. She is Ana's daughter.",
            CATEGORY_IDENTITY, importance=IMPORTANCE_IMPORTANT, person="bea"),
    _memory("husband", "Your husband Ernesto",
            "Your husband was Ernesto Santos. You were married for 45 years. He passed away in 2015.",
            CATEGORY_IDENTITY, importance=IMPORTANCE_IMPORTANT),
    # preference
    _memory("ana-flower", "Ana's favorite flower", "Ana loves sunflowers.", CATEGORY_PREFERENCE, person="ana"),
    _memory("bea-baking", "Baking with Bea", "Bea loves to bake ensaymada with you on weekends.",
            CATEGORY_PREFERENCE, person="bea"),
    _memory("favorite-food", "Your favorite food", "Your favorite food is sinigang na hipon.", CATEGORY_PREFERENCE),
    _memory("favorite-singer", "Your favorite singer", "You enjoy listening to Nora Aunor songs in the afternoon.",
            CATEGORY_PREFERENCE),
    # routine
    _memory("plants", "Watering the plants", "You water your orchids and gumamela every morning after breakfast.",
            CATEGORY_ROUTINE, place="home"),
    _memory("sunday-mass", "Sunday Mass", "You hear Mass at Malolos Church every Sunday morning with Ana.",
            CATEGORY_ROUTINE, person="ana", place="church"),
    # history
    _memory("teacher", "Your work as a teacher",
            "You taught Grade 3 at Malolos Central School for 32 years.", CATEGORY_HISTORY,
            importance=IMPORTANCE_IMPORTANT),
    _memory("birthday-2026", "Your 78th birthday",
            "You celebrated your 78th birthday at home with Ana, Miguel, Paolo and Bea. Bea baked the cake.",
            CATEGORY_HISTORY, event_date="2026-03-12", place="home"),
    # care and safety
    _memory("cane", "Using your cane", "Use your cane when you walk outside the house.",
            CATEGORY_CARE_SAFETY, importance=IMPORTANCE_CRITICAL),
    _memory("dizzy", "If you feel dizzy", "If you feel dizzy, sit down and call Ana.",
            CATEGORY_CARE_SAFETY, importance=IMPORTANCE_CRITICAL, person="ana"),
    # temporary and still valid
    _memory("bea-sembreak", "Bea is home for the sem break", "Bea is staying at home until the end of December.",
            CATEGORY_ROUTINE, validity=VALIDITY_TEMPORARY, valid_from="2026-10-05 00:00:00",
            valid_until="2026-12-31 23:59:59", person="bea"),
    # --- rows the caregiver dashboard should surface ---
    _memory("ana-cebu", "Ana's trip to Cebu", "Ana is in Cebu for work until September 30.",
            CATEGORY_ROUTINE, trust=TRUST_OUTDATED, validity=VALIDITY_TEMPORARY, valid_from="2026-09-24 00:00:00",
            valid_until="2026-09-30 23:59:59", person="ana"),
    _memory("rosa-visit", "Aling Rosa's visit", "Aling Rosa visited yesterday and brought suman.",
            CATEGORY_HISTORY, trust=TRUST_UNVERIFIED, source=SOURCE_PATIENT, person="rosa"),
    _memory("miguel-children", "Miguel's children", "Miguel may have two children.",
            CATEGORY_IDENTITY, trust=TRUST_UNVERIFIED, source=SOURCE_AI_SUGGESTED, person="miguel"),
    _memory("paolo-school-a", "Where Paolo studies", "Paolo studies engineering at Bulacan State University.",
            CATEGORY_IDENTITY, trust=TRUST_CONFLICTING, person="paolo"),
    _memory("paolo-school-b", "Where Paolo studies", "Paolo studies engineering at the University of Santo Tomas.",
            CATEGORY_IDENTITY, trust=TRUST_CONFLICTING, person="paolo", conflicts_with="paolo-school-a"),
]

# personal questions must link to a verified memory
TRIVIA_QUESTIONS = [
    {"id": "seed-trivia-ana-flower", "kind": TRIVIA_FAMILY, "topic": "relationships",
     "question": "Ana is your daughter. Do you remember her favorite flower?", "answer": "Sunflowers",
     "choices": ["Sunflowers", "Roses", "Sampaguita"], "memory_id": "seed-mem-ana-flower",
     "source": TRIVIA_SOURCE_CAREGIVER},
    {"id": "seed-trivia-paolo", "kind": TRIVIA_FAMILY, "topic": "family_names",
     "question": "Who is Paolo?", "answer": "My grandson",
     "choices": ["My grandson", "My neighbor", "My doctor"], "memory_id": "seed-mem-paolo-grandson",
     "source": TRIVIA_SOURCE_CAREGIVER},
    {"id": "seed-trivia-plants", "kind": TRIVIA_ROUTINE, "topic": "routines",
     "question": "What do you usually do every morning after breakfast?", "answer": "Water the plants",
     "choices": None, "memory_id": "seed-mem-plants", "source": TRIVIA_SOURCE_CAREGIVER},
]


def _insert(conn: sqlite3.Connection, table: str, row: dict) -> bool:
    columns = ", ".join(row)
    marks = ", ".join("?" for _ in row)
    cursor = conn.execute(
        f"INSERT INTO {table} ({columns}) VALUES ({marks}) ON CONFLICT DO NOTHING", tuple(row.values())
    )
    return cursor.rowcount == 1


def _copy_photos() -> None:
    config.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    for source in SEED_PHOTOS_DIR.glob("*.png"):
        target = config.PHOTO_DIR / f"seed-{source.name}"
        if not target.exists():
            shutil.copyfile(source, target)


def _seed_rows(conn: sqlite3.Connection) -> dict:
    inserted = {}

    def add(table: str, rows: list[dict]) -> None:
        inserted[table] = sum(_insert(conn, table, row) for row in rows)

    add("patient", [PATIENT])
    existing = {row["id"] for row in conn.execute("SELECT id FROM caregivers")}
    add("caregivers", [
        {**caregiver, "pin_hash": hash_pin(DEMO_PINS[caregiver["id"]])}
        for caregiver in CAREGIVERS if caregiver["id"] not in existing
    ])
    add("settings", [{"key": key, "value": json.dumps(value)} for key, value in SETTINGS.items()])
    add("people", PEOPLE)
    add("places", PLACES)
    add("schedule_items", SCHEDULE_ITEMS)
    add("medications", MEDICATIONS)
    add("medication_times", MEDICATION_TIMES)

    inserted_ids: set[str] = set()
    for memory in MEMORIES:
        if not _insert(conn, "memories", memory):
            continue
        inserted_ids.add(memory["id"])
        partner = memory["conflicts_with"]
        # link both ways only when both rows are new; never edit a row that existed before the run
        if partner and partner in inserted_ids:
            conn.execute("UPDATE memories SET conflicts_with = ? WHERE id = ?", (memory["id"], partner))
    inserted["memories"] = len(inserted_ids)

    add("trivia_questions", [
        {**question, "choices": json.dumps(question["choices"]) if question["choices"] else None}
        for question in TRIVIA_QUESTIONS
    ])
    return inserted


def seed(conn: sqlite3.Connection | None = None) -> dict:
    """Insert the demo data. Returns how many rows were added per table."""
    own_connection = conn is None
    conn = conn or connect()
    try:
        _copy_photos()
        conn.execute("BEGIN")
        try:
            inserted = _seed_rows(conn)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        return inserted
    finally:
        if own_connection:
            conn.close()


# tables clear_demo reports, children first; the last two only lose rows through ON DELETE CASCADE
CLEARED_TABLES = ("trivia_questions", "memories", "medication_times", "medications", "schedule_items",
                  "places", "people", "caregivers", "settings", "patient", "medication_logs", "schedule_acks")


def _seed_ids() -> dict[str, list[str]]:
    # read at call time so tests can patch the lists; children before parents
    return {
        "trivia_questions": [row["id"] for row in TRIVIA_QUESTIONS],
        "memories": [row["id"] for row in MEMORIES],
        "medication_times": [row["id"] for row in MEDICATION_TIMES],
        "medications": [row["id"] for row in MEDICATIONS],
        "schedule_items": [row["id"] for row in SCHEDULE_ITEMS],
        "places": [row["id"] for row in PLACES],
        "people": [row["id"] for row in PEOPLE],
        "caregivers": [row["id"] for row in CAREGIVERS],
    }


def _marks(values) -> str:
    return ", ".join("?" for _ in values)


def _blocking_references(conn: sqlite3.Connection, ids: dict[str, list[str]]) -> list[str]:
    """Non-demo rows that point at demo rows through a foreign key with no ON DELETE action."""
    found = []
    tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    for table in tables:
        for fk in conn.execute(f"PRAGMA foreign_key_list({table})"):
            parent, column, on_delete = fk[2], fk[3], fk[6]
            if parent not in ids or on_delete != "NO ACTION":
                continue
            own = ids.get(table, [])
            count = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {column} IN ({_marks(ids[parent])})"
                f" AND id NOT IN ({_marks(own)})",
                (*ids[parent], *own),
            ).fetchone()[0]
            if count:
                found.append(f"{table}.{column} -> {parent} ({count} row{'s' if count > 1 else ''})")
    return found


def _clear_rows(conn: sqlite3.Connection) -> None:
    ids = _seed_ids()
    for table, table_ids in ids.items():
        conn.execute(f"DELETE FROM {table} WHERE id IN ({_marks(table_ids)})", table_ids)
    # The patient row (id 1) and the settings keys are singletons that real data reuses:
    # remove them only while they still hold the seed values, so a caregiver's edits stay.
    for key, value in SETTINGS.items():
        conn.execute("DELETE FROM settings WHERE key = ? AND value = ?", (key, json.dumps(value)))
    row = conn.execute(f"SELECT {', '.join(PATIENT)} FROM patient WHERE id = ?", (PATIENT["id"],)).fetchone()
    if row is not None and tuple(row) == tuple(PATIENT.values()):
        conn.execute("DELETE FROM patient WHERE id = ?", (PATIENT["id"],))


def _remove_photos() -> None:
    # only files still identical to the bundled asset; a replaced photo is the caregiver's
    for source in SEED_PHOTOS_DIR.glob("*.png"):
        target = config.PHOTO_DIR / f"seed-{source.name}"
        if target.is_file() and target.read_bytes() == source.read_bytes():
            target.unlink()


def clear_demo(conn: sqlite3.Connection | None = None) -> dict:
    """Remove the demo rows and unedited demo photos. Returns how many rows went per table.

    Only rows with seed ids are deleted. Logs and questions attached to a demo row with
    ON DELETE CASCADE go with it. If a real row still points at a demo row (for example
    people.created_by = a demo caregiver), nothing is removed and IntegrityError is raised.
    """
    own_connection = conn is None
    conn = conn or connect()
    try:
        def counts():
            return {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in CLEARED_TABLES}

        conn.execute("BEGIN")
        try:
            before = counts()
            _clear_rows(conn)
            removed = {table: before[table] - count for table, count in counts().items()}
            conn.execute("COMMIT")
        except sqlite3.IntegrityError as error:
            conn.execute("ROLLBACK")
            blocking = _blocking_references(conn, _seed_ids())
            problem = ", ".join(blocking) if blocking else str(error)
            raise sqlite3.IntegrityError(
                f"Cannot clear demo data: real rows still reference demo rows: {problem}. "
                "Reassign or delete them first. Nothing was removed."
            ) from error
        except Exception:
            conn.execute("ROLLBACK")
            raise
        _remove_photos()
        return removed
    finally:
        if own_connection:
            conn.close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.database.seed", description="Add or remove the demo data.")
    parser.add_argument("--clear", action="store_true",
                        help="remove the demo rows and unedited demo photos; real data stays")
    args = parser.parse_args(argv)
    migrate()
    if not args.clear:
        for table, count in seed().items():
            print(f"{table}: {count} added")
        return
    try:
        removed = clear_demo()
    except sqlite3.IntegrityError as error:
        sys.exit(str(error))
    for table, count in removed.items():
        print(f"{table}: {count} removed")


if __name__ == "__main__":
    main()
