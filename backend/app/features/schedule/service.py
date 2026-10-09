# validation, recurrence expansion, today / next occurrences
#
# Recurrence strings (ARCHITECTURE.md):
#   NULL            one-off, only on the date of starts_at
#   'daily'         every day from starts_at
#   'weekly:MO,WE'  listed weekdays (MO TU WE TH FR SA SU)
#   'monthly:15'    that day of each month; 29-31 fall on the last day of shorter months
# Every occurrence happens at the time of day of starts_at, on or after its date and
# on or before ends_on.
#
# Other modules (assistant next_event, trivia quiet checks, routine_recall games) should
# call today() / next_occurrence() / occurrences_between() / occurrences_on() rather
# than re-parse recurrence.

import calendar
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from . import repository
from .deps import ACK_RESPONSES, SCHEDULE_KINDS

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")  # index = date.weekday()
MANILA = timezone(timedelta(hours=8))
DT_FORMAT = "%Y-%m-%d %H:%M:%S"
NEXT_HORIZON_DAYS = 400  # long enough for any monthly item to come round again


def manila_now():
    return datetime.now(MANILA).replace(tzinfo=None, microsecond=0)


# ────────────────────────────────── parsing ─────────────────────────────────────


def parse_dt(value, field="starts_at"):
    """Accepts 'YYYY-MM-DD HH:MM[:SS]' or ISO 'T' form; returns a naive local datetime."""
    try:
        dt = datetime.fromisoformat(str(value).strip())
    except ValueError:
        raise HTTPException(422, f"{field} must be 'YYYY-MM-DD HH:MM:SS'")
    if dt.tzinfo is not None:
        dt = dt.astimezone(MANILA).replace(tzinfo=None)
    return dt.replace(microsecond=0)


def parse_date(value, field="date"):
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        raise HTTPException(422, f"{field} must be 'YYYY-MM-DD'")


def parse_recurrence(value):
    """Returns the normalized recurrence string, or None for a one-off item."""
    if value is None or str(value).strip() == "":
        return None
    rec = str(value).strip()
    if rec.lower() == "daily":
        return "daily"
    kind, _, arg = rec.partition(":")
    kind = kind.lower()
    if kind == "weekly":
        days = [d.strip().upper() for d in arg.split(",") if d.strip()]
        if days and all(d in WEEKDAYS for d in days):
            return "weekly:" + ",".join(sorted(set(days), key=WEEKDAYS.index))
    elif kind == "monthly" and arg.strip().isdigit() and 1 <= int(arg) <= 31:
        return f"monthly:{int(arg)}"
    raise HTTPException(
        422, "recurrence must be empty, 'daily', 'weekly:MO,WE' or 'monthly:15'"
    )


def _flag(value, field):
    if value in (True, 1, "1", "true"):
        return 1
    if value in (False, 0, "0", "false"):
        return 0
    raise HTTPException(422, f"{field} must be true or false")


def _int_or_none(value, field, minimum):
    if value is None or value == "":
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise HTTPException(422, f"{field} must be a whole number")
    if number < minimum:
        raise HTTPException(422, f"{field} must be at least {minimum}")
    return number


def validate_item(payload):
    """Checks a complete item (create, or existing row merged with an update)."""
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(422, "title is required")
    if payload.get("kind") not in SCHEDULE_KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(SCHEDULE_KINDS)}")
    if not payload.get("starts_at"):
        raise HTTPException(422, "starts_at is required")
    starts_at = parse_dt(payload["starts_at"])

    ends_on = None
    if payload.get("ends_on"):
        ends_on = parse_date(payload["ends_on"], "ends_on")
        if ends_on < starts_at.date():
            raise HTTPException(422, "ends_on cannot be before starts_at")

    remind = _int_or_none(payload.get("remind_before_min"), "remind_before_min", 0)
    return {
        "title": title,
        "kind": payload["kind"],
        "starts_at": starts_at.strftime(DT_FORMAT),
        "duration_min": _int_or_none(payload.get("duration_min"), "duration_min", 1),
        "recurrence": parse_recurrence(payload.get("recurrence")),
        "ends_on": ends_on.isoformat() if ends_on else None,
        "person_id": payload.get("person_id") or None,
        "place_id": payload.get("place_id") or None,
        "notes": (str(payload["notes"]).strip() or None) if payload.get("notes") else None,
        "remind_before_min": 30 if remind is None else remind,
        "is_quiet_period": _flag(payload.get("is_quiet_period", 0), "is_quiet_period"),
        "is_active": _flag(payload.get("is_active", 1), "is_active"),
    }


def check_links(conn, item):
    if item["person_id"] and not repository.exists(conn, "people", item["person_id"]):
        raise HTTPException(422, "person_id does not match a saved person")
    if item["place_id"] and not repository.exists(conn, "places", item["place_id"]):
        raise HTTPException(422, "place_id does not match a saved place")


# ──────────────────────────────── recurrence ────────────────────────────────────


def occurs_on(item, day):
    start = parse_dt(item["starts_at"])
    if day < start.date():
        return False
    if item.get("ends_on") and day > parse_date(item["ends_on"]):
        return False
    rec = item.get("recurrence")
    if not rec:
        return day == start.date()
    if rec == "daily":
        return True
    kind, _, arg = rec.partition(":")
    if kind == "weekly":
        return WEEKDAYS[day.weekday()] in arg.split(",")
    if kind == "monthly":
        last_day = calendar.monthrange(day.year, day.month)[1]
        return day.day == min(int(arg), last_day)
    return False


def occurrence(item, at, ack=None):
    """One dated instance of an item, shaped for the phones."""
    remind_at = at - timedelta(minutes=item.get("remind_before_min") or 0)
    ends_at = at + timedelta(minutes=item["duration_min"]) if item.get("duration_min") else None
    return {
        **item,
        "occurrence_at": at.strftime(DT_FORMAT),
        "ends_at": ends_at.strftime(DT_FORMAT) if ends_at else None,
        "remind_at": remind_at.strftime(DT_FORMAT),
        "ack": ack,
    }


def occurrences_on(items, day):
    """Every occurrence of the given items on one date, in time order."""
    found = []
    for item in items:
        if item.get("is_active", 1) and occurs_on(item, day):
            at = datetime.combine(day, parse_dt(item["starts_at"]).time())
            found.append(occurrence(item, at))
    return sorted(found, key=lambda o: (o["occurrence_at"], o["title"]))


def next_occurrence_of(item, now):
    if not item.get("is_active", 1):
        return None
    start = parse_dt(item["starts_at"])
    if not item.get("recurrence"):
        return start if start >= now else None
    day = max(now.date(), start.date())
    for _ in range(NEXT_HORIZON_DAYS):
        at = datetime.combine(day, start.time())
        if occurs_on(item, day) and at >= now:
            return at
        if item.get("ends_on") and day > parse_date(item["ends_on"]):
            return None
        day += timedelta(days=1)
    return None


def is_occurrence(item, at):
    return occurs_on(item, at.date()) and at.time() == parse_dt(item["starts_at"]).time()


# ──────────────────────────────── feature calls ─────────────────────────────────


def today(conn, day=None):
    day = day or manila_now().date()
    found = occurrences_on(repository.list_items(conn, active_only=True), day)
    acks = repository.acks_on(conn, day.isoformat())
    for occ in found:
        occ["ack"] = acks.get((occ["id"], occ["occurrence_at"]))
    return found


def occurrences_between(conn, start, end):
    """Occurrences that overlap [start, end], in time order. One already running at
    `start` counts, so TRV-2 can check "within 30 minutes" and "in a quiet period" with
    occurrences_between(conn, now - 30 min, now + 30 min)."""
    items = repository.list_items(conn, active_only=True)
    found = []
    day = start.date() - timedelta(days=1)  # an item from yesterday may still be running
    while day <= end.date():
        for occ in occurrences_on(items, day):
            occ_start = parse_dt(occ["occurrence_at"])
            occ_end = parse_dt(occ["ends_at"]) if occ["ends_at"] else occ_start
            if occ_start <= end and occ_end >= start:
                found.append(occ)
        day += timedelta(days=1)
    return found


def next_occurrence(conn, now=None):
    now = now or manila_now()
    best = None
    for item in repository.list_items(conn, active_only=True):
        at = next_occurrence_of(item, now)
        if at and (best is None or (at, item["title"]) < (best[0], best[1]["title"])):
            best = (at, item)
    if best is None:
        return None
    at, item = best
    return occurrence(item, at, repository.get_ack(conn, item["id"], at.strftime(DT_FORMAT)))


def acknowledge(conn, item_id, payload):
    item = repository.get_item(conn, item_id)
    if item is None:
        raise HTTPException(404, "Schedule item not found")
    if payload.get("response") not in ACK_RESPONSES:
        raise HTTPException(422, f"response must be one of {', '.join(ACK_RESPONSES)}")
    if not payload.get("occurrence_at"):
        raise HTTPException(422, "occurrence_at is required")
    at = parse_dt(payload["occurrence_at"], "occurrence_at")
    if not is_occurrence(item, at):
        raise HTTPException(422, "occurrence_at is not an occurrence of this item")
    # Recording a response means the patient saw the reminder, never that it was done.
    return repository.upsert_ack(conn, item_id, at.strftime(DT_FORMAT), payload["response"])
