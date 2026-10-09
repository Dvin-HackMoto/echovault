# Lola Nena's demo week. Not a mock: HUB-5 calls this from database/seed.py with the
# ids of the seeded caregiver person and church, e.g.
#     seed_demo_schedule(conn, person_id=ana_id, place_id=church_id)

import uuid
from datetime import timedelta


def seed_demo_schedule(conn, person_id=None, place_id=None):
    """Adds the demo schedule. Does nothing if schedule_items already has rows."""
    from .service import manila_now  # imported here: mock.py -> demo.py runs while deps.py loads

    if conn.execute("SELECT 1 FROM schedule_items LIMIT 1").fetchone():
        return
    today = manila_now().date()
    checkup = today + timedelta(days=3)
    rows = [
        # title, kind, starts_at, duration, recurrence, person, place, notes, quiet period
        ("Breakfast", "meal", f"{today} 07:00:00", 30, "daily", None, None, None, 0),
        ("Morning walk", "routine", f"{today} 07:45:00", 20, "daily", None, None, "Wear your hat", 0),
        ("Lunch", "meal", f"{today} 12:00:00", 45, "daily", None, None, None, 0),
        ("Afternoon nap", "routine", f"{today} 13:30:00", 60, "daily", None, None, None, 1),
        ("Dinner", "meal", f"{today} 18:00:00", 45, "daily", None, None, None, 0),
        ("Ana visits", "visit", f"{today} 15:00:00", 120, "weekly:WE,SA", person_id, None, None, 0),
        ("Sunday Mass", "activity", f"{today} 08:00:00", 60, "weekly:SU", person_id, place_id, None, 1),
        ("Blood pressure check at the health center", "appointment", f"{today} 09:00:00", 30,
         "monthly:15", None, None, "Bring the BP notebook", 0),
        ("Check-up with Dr. Cruz", "appointment", f"{checkup} 10:00:00", 60, None, person_id, None,
         "Ana will drive", 1),
    ]
    for title, kind, starts_at, duration, recurrence, person, place, notes, quiet in rows:
        conn.execute(
            "INSERT INTO schedule_items (id, title, kind, starts_at, duration_min, recurrence, "
            "person_id, place_id, notes, is_quiet_period) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), title, kind, starts_at, duration, recurrence, person, place, notes, quiet),
        )
    conn.commit()
