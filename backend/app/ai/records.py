"""Record_Filter and small record helpers shared by prompts.py and fallback.py.

Records are plain dicts shaped like rows of the ``memories`` / ``people``
tables. Only "usable" records (verified, not archived, not conflicting, and
currently valid in Manila local time) may reach a prompt or a fallback answer.
"""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta, timezone, tzinfo
from typing import Iterable

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    MANILA: tzinfo = ZoneInfo("Asia/Manila")
except (ImportError, ZoneInfoNotFoundError):  # tzdata missing (e.g. Windows)
    # Manila has no DST, so a fixed offset gives the same local time.
    MANILA = timezone(timedelta(hours=8), "Asia/Manila")

_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
_DATETIME_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}")
_WHITESPACE_RE = re.compile(r"\s+")


def now_manila() -> datetime:
    """Current Manila local time as a naive datetime (seconds precision)."""
    return datetime.now(MANILA).replace(tzinfo=None, microsecond=0)


def _parse(value: object) -> tuple[datetime, bool]:
    """Parse a bound value. Returns (datetime, is_date_only); ValueError if invalid."""
    if not isinstance(value, str):
        raise ValueError(f"timestamp must be a string, got {type(value).__name__}")
    text = value.strip()
    if _DATETIME_RE.fullmatch(text):
        return datetime.strptime(text, "%Y-%m-%d %H:%M:%S"), False
    if _DATE_RE.fullmatch(text):
        return datetime.strptime(text, "%Y-%m-%d"), True
    raise ValueError(f"unrecognised timestamp: {value!r}")


def parse_timestamp(value: str) -> datetime:
    """Parse ``YYYY-MM-DD`` (midnight) or ``YYYY-MM-DD HH:MM:SS``; ValueError otherwise."""
    return _parse(value)[0]


def _is_set(value: object) -> bool:
    return value is not None and value != ""


def _normalize_now(now: datetime | None) -> datetime:
    if now is None:
        return now_manila()
    if now.tzinfo is not None:
        # Aware input: express it in Manila local time so comparisons stay naive.
        return now.astimezone(MANILA).replace(tzinfo=None)
    return now


def _usable_at(record: object, now: datetime) -> bool:
    if not isinstance(record, dict):
        return False
    if record.get("trust") != "verified":
        return False
    if record.get("validity") == "archived":
        return False
    if record.get("conflicts_with"):
        return False

    valid_from = record.get("valid_from")
    if _is_set(valid_from):
        try:
            start, _ = _parse(valid_from)
        except ValueError:
            return False
        if start > now:
            return False

    valid_until = record.get("valid_until")
    if _is_set(valid_until):
        try:
            end, date_only = _parse(valid_until)
        except ValueError:
            return False
        if date_only:
            end = datetime.combine(end.date(), time(23, 59, 59))
        if end < now:
            return False

    return True


def is_usable(record: object, now: datetime | None = None) -> bool:
    """True when ``record`` may be shown to the patient at ``now`` (Manila time)."""
    return _usable_at(record, _normalize_now(now))


def usable_records(records: Iterable[object], now: datetime | None = None) -> list[dict]:
    """Return the usable records (original objects, input order). Never mutates input."""
    current = _normalize_now(now)  # computed once per call
    return [record for record in records if _usable_at(record, current)]


def is_person(record: dict) -> bool:
    """A record is a person when it has ``name``/``relationship`` and no ``content``/``title``."""
    has_person_key = "name" in record or "relationship" in record
    has_memory_key = "content" in record or "title" in record
    return has_person_key and not has_memory_key


def clean(value: object) -> str:
    """``str(value)`` with newlines/tabs/runs of whitespace collapsed; ``""`` for None."""
    if value is None:
        return ""
    return _WHITESPACE_RE.sub(" ", str(value)).strip()


def display_name(person: dict | None) -> str | None:
    """Nickname, else name, else None (stripped, non-empty)."""
    if not isinstance(person, dict):
        return None
    for key in ("nickname", "name"):
        name = clean(person.get(key))
        if name:
            return name
    return None
