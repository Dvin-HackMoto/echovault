# validation, generating today's due logs as 'unconfirmed', dose confirmation
#
# A dose is only ever 'taken' or 'skipped' because someone pressed a button that sent
# POST /medications/logs/{id}. Generation inserts 'unconfirmed' rows and nothing else.
#
# Other modules should call these instead of querying the tables themselves:
#   today_doses(conn)    patient card, caregiver review
#   next_doses(conn)     assistant `medication` intent ("Your next medicine is ...")
#   overdue_doses(conn)  dashboard: unconfirmed doses past due_at
#   generate_logs(conn)  MED-2 job; the functions above already call it

import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException

from . import repository
from .deps import MED_STATUSES, ROLE_CAREGIVER, photo_dir

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")  # index = date.weekday()
MANILA = timezone(timedelta(hours=8))
DT_FORMAT = "%Y-%m-%d %H:%M:%S"
PATIENT_STATUSES = ("taken", "skipped")
PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
NEXT_HORIZON_DAYS = 8  # every 'days' value repeats within a week


def manila_now():
    return datetime.now(MANILA).replace(tzinfo=None, microsecond=0)


# ────────────────────────────────── parsing ─────────────────────────────────────


def parse_date(value, field):
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        raise HTTPException(422, f"{field} must be 'YYYY-MM-DD'")


def parse_time_of_day(value):
    """'8:00' or '08:00' -> '08:00'."""
    hour, _, minute = str(value or "").strip().partition(":")
    if hour.isdigit() and minute.isdigit() and len(minute) == 2 and int(hour) < 24 and int(minute) < 60:
        return f"{int(hour):02d}:{minute}"
    raise HTTPException(422, "time_of_day must be 'HH:MM' (24-hour), e.g. '08:00' or '20:00'")


def parse_days(value):
    """'daily' or weekday codes like 'MO,WE,FR' (any case, any order)."""
    days = str(value or "daily").strip()
    if days.lower() == "daily":
        return "daily"
    codes = [d.strip().upper() for d in days.split(",") if d.strip()]
    if codes and all(c in WEEKDAYS for c in codes):
        if len(set(codes)) == 7:
            return "daily"
        return ",".join(sorted(set(codes), key=WEEKDAYS.index))
    raise HTTPException(422, "days must be 'daily' or weekday codes like 'MO,WE,FR'")


def _flag(value, field):
    if value in (True, 1, "1", "true"):
        return 1
    if value in (False, 0, "0", "false"):
        return 0
    raise HTTPException(422, f"{field} must be true or false")


def _text(value):
    if value is None:
        return None
    return str(value).strip() or None


def validate_medication(payload):
    """Checks a complete medication (create, or saved row merged with an update)."""
    med = {
        "name": _text(payload.get("name")),
        "dose": _text(payload.get("dose")),
        "instructions": _text(payload.get("instructions")),
        "photo_path": _text(payload.get("photo_path")),
        "start_date": None,
        "end_date": None,
        "is_active": _flag(payload.get("is_active", 1), "is_active"),
    }
    if not med["name"]:
        raise HTTPException(422, "name is required")
    if not med["dose"]:
        raise HTTPException(422, "dose is required, e.g. '1 tablet' or '5 ml'")
    if payload.get("start_date"):
        med["start_date"] = parse_date(payload["start_date"], "start_date").isoformat()
    if payload.get("end_date"):
        med["end_date"] = parse_date(payload["end_date"], "end_date").isoformat()
    if med["start_date"] and med["end_date"] and med["end_date"] < med["start_date"]:
        raise HTTPException(422, "end_date cannot be before start_date")
    return med


def validate_times(times):
    if not isinstance(times, list) or not times:
        raise HTTPException(422, "times must be a list with at least one {time_of_day, days}")
    cleaned, seen = [], set()
    for t in times:
        if not isinstance(t, dict):
            raise HTTPException(422, "each time must be an object like {\"time_of_day\": \"08:00\"}")
        row = {"time_of_day": parse_time_of_day(t.get("time_of_day")), "days": parse_days(t.get("days"))}
        if (row["time_of_day"], row["days"]) not in seen:
            seen.add((row["time_of_day"], row["days"]))
            cleaned.append(row)
    return cleaned


# ──────────────────────────────── due doses ─────────────────────────────────────


def is_due_on(med, time_row, day):
    if not med["is_active"]:
        return False
    if med.get("start_date") and day < date.fromisoformat(med["start_date"]):
        return False
    if med.get("end_date") and day > date.fromisoformat(med["end_date"]):
        return False
    return time_row["days"] == "daily" or WEEKDAYS[day.weekday()] in time_row["days"].split(",")


def _due_at(day, time_row):
    return f"{day.isoformat()} {time_row['time_of_day']}:00"


def generate_logs(conn, day=None):
    """MED-2: one 'unconfirmed' log per active dose due on `day` (default today).
    Safe to call on every request: UNIQUE (medication_id, due_at) keeps it to one row."""
    day = day or manila_now().date()
    doses = [
        (med["id"], _due_at(day, t))
        for med in repository.list_medications(conn, active_only=True)
        for t in med["times"]
        if is_due_on(med, t, day)
    ]
    return repository.insert_unconfirmed_logs(conn, doses)


def refresh_today(conn, med_id):
    """After a medicine changes: drop today's untouched doses for it and generate again."""
    today = manila_now().date()
    repository.delete_untouched_logs(conn, med_id, f"{today.isoformat()} 00:00:00")
    generate_logs(conn, today)


def today_doses(conn, now=None):
    day = (now or manila_now()).date()
    generate_logs(conn, day)
    return [with_photo_url(d) for d in repository.list_logs(conn, day=day.isoformat())]


def overdue_doses(conn, now=None):
    """Unconfirmed doses whose due_at has passed, oldest first (for the dashboard)."""
    now = now or manila_now()
    generate_logs(conn, now.date())
    logs = repository.list_logs(conn, status="unconfirmed", due_before=now.strftime(DT_FORMAT))
    return [with_photo_url(d) for d in logs]


def next_doses(conn, now=None):
    """The soonest upcoming dose time and every medicine due then, e.g. two at 08:00.
    Returns [] when nothing is scheduled in the coming week."""
    now = now or manila_now()
    meds = repository.list_medications(conn, active_only=True)
    for offset in range(NEXT_HORIZON_DAYS):
        day = now.date() + timedelta(days=offset)
        due = sorted(
            ((_due_at(day, t), med)
             for med in meds
             for t in med["times"]
             if is_due_on(med, t, day) and _due_at(day, t) >= now.strftime(DT_FORMAT)),
            key=lambda pair: (pair[0], pair[1]["name"]),
        )
        if due:
            first = due[0][0]
            return [
                with_photo_url({
                    "medication_id": med["id"], "name": med["name"], "dose": med["dose"],
                    "instructions": med["instructions"], "photo_path": med["photo_path"],
                    "due_at": due_at, "time_of_day": due_at[11:16],
                })
                for due_at, med in due if due_at == first
            ]
    return []


def with_photo_url(row):
    # main.py serves PHOTO_DIR at /photos, and photo_path is a file name inside it
    return {**row, "photo_url": f"/photos/{row['photo_path']}" if row.get("photo_path") else None}


# ─────────────────────────────── confirmation ───────────────────────────────────


def confirm(conn, log_id, payload, role):
    """MED-3. The patient may answer taken/skipped and change their own answer; a
    caregiver may also correct it, including back to unconfirmed."""
    log = repository.get_log(conn, log_id)
    if log is None:
        raise HTTPException(404, "Dose not found")
    status = payload.get("status")
    by_caregiver = role == ROLE_CAREGIVER
    allowed = MED_STATUSES if by_caregiver else PATIENT_STATUSES
    if status not in allowed:
        raise HTTPException(422, f"status must be one of {', '.join(allowed)}")
    if not by_caregiver and log["confirmed_by"] == "caregiver":
        raise HTTPException(409, "A caregiver already recorded this dose")
    confirmed_by = "none" if status == "unconfirmed" else ("caregiver" if by_caregiver else "patient")
    repository.set_log_status(conn, log_id, status, confirmed_by, _text(payload.get("note")))
    return with_photo_url(repository.get_log(conn, log_id))


# ──────────────────────────────────── photo ─────────────────────────────────────


def save_photo(conn, med, upload):
    ext = PHOTO_TYPES.get(upload.content_type)
    if ext is None:
        raise HTTPException(422, "photo must be a JPEG, PNG or WebP image")
    folder = Path(photo_dir())
    folder.mkdir(parents=True, exist_ok=True)
    name = f"med-{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(upload.file.read())
    repository.set_photo(conn, med["id"], name)
    old = med.get("photo_path")
    if old and old.startswith("med-"):  # only files this module created; seeded photos stay
        (folder / old).unlink(missing_ok=True)
    return name
