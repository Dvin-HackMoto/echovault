# templates for meds/schedule, LLM phrasing for the rest
#
# build() turns what retrieve.py found into
#   {"answer", "answer_mode": template | llm | fallback | no_data, "record_ids", "people"}
#
#   medication, next_event   fixed wording below, never the LLM
#   who_is, general          the LLM rephrases only the retrieved records (ai/prompts.py);
#                            if Ollama is down or slow, ai/fallback.py joins them instead
#   nothing verified found   the no-data reply naming the caregiver ("You can ask Ana.")
#
# Wording follows the patient's language: 'fil' gives Filipino, 'en' and 'fil-en' English
# (the same rule as ai/fallback.py). Record values are copied as the caregiver wrote them.
#
# A dose is described as "marked as taken", never as taken: a tap on the phone does not
# prove the medicine was swallowed (PRODUCT.md, Limitations).

import re
from datetime import datetime

from app.ai import fallback, llm, prompts
from app.ai.records import clean
from app.constants import CATEGORY_IDENTITY, TRUST_VERIFIED

from . import retrieve

DT_FORMAT = "%Y-%m-%d %H:%M:%S"
# with no LLM to pick what matters, the fallback reads out only the closest records
FALLBACK_RECORDS = 3

WORDS = {
    "en": {
        "and": "and",
        "at_time": "at {time}",
        "when_today": "at {time}",
        "when_tomorrow": "tomorrow at {time}",
        "when_later": "on {day} at {time}",
        "days": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
        "months": ("January", "February", "March", "April", "May", "June", "July", "August",
                   "September", "October", "November", "December"),
        "next_event": "Next is {title} {when}.",
        "next_appointment": "Your next appointment is {title} {when}.",
        "event_item": "{title} at {time}",
        "today_left": "Today you still have {items}.",
        "today_done": "Nothing more is scheduled today.",
        "meds_today": "Today you take {items}.",
        "next_med": "Your next medicine is {items}.",
        "next_meds": "Your next medicines are {items}.",
        "status": {"taken": " (marked as taken)", "skipped": " (marked as skipped)"},
    },
    "fil": {
        "and": "at",
        "at_time": "{time}",
        "when_today": "mamayang {time}",
        "when_tomorrow": "bukas, {time}",
        "when_later": "sa {day}, {time}",
        "days": ("Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado", "Linggo"),
        "months": ("Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto",
                   "Setyembre", "Oktubre", "Nobyembre", "Disyembre"),
        "next_event": "Ang susunod ay {title} {when}.",
        "next_appointment": "Ang susunod mong appointment ay {title} {when}.",
        "event_item": "{title}, {time}",
        "today_left": "Ngayong araw, mayroon ka pang {items}.",
        "today_done": "Wala nang nakatakda ngayong araw.",
        "meds_today": "Ngayong araw, ang mga gamot mo ay {items}.",
        "next_med": "Ang susunod mong gamot ay {items}.",
        "next_meds": "Ang mga susunod mong gamot ay {items}.",
        "status": {"taken": " (nakamarkang nainom na)", "skipped": " (nakamarkang hindi ininom)"},
    },
}

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _fill(template, **values):
    # one pass, so a title that happens to contain "{when}" is inserted as written
    return _PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def _join(items, words, separator=", "):
    if len(items) < 2:
        return "".join(items)
    return f"{separator.join(items[:-1])} {words['and']} {items[-1]}"


def _clock(stamp):
    """'2026-10-10 20:00:00' -> '8:00 PM'."""
    at = datetime.strptime(stamp, DT_FORMAT)
    return f"{at.hour % 12 or 12}:{at.minute:02d} {'AM' if at.hour < 12 else 'PM'}"


def _when(stamp, now, words):
    at = datetime.strptime(stamp, DT_FORMAT)
    days_away = (at.date() - now.date()).days
    if days_away == 0:
        return _fill(words["when_today"], time=_clock(stamp))
    if days_away == 1:
        return _fill(words["when_tomorrow"], time=_clock(stamp))
    day = f"{words['days'][at.weekday()]}, {words['months'][at.month - 1]} {at.day}"
    return _fill(words["when_later"], day=day, time=_clock(stamp))


def _unique(ids):
    return list(dict.fromkeys(i for i in ids if i))


# ───────────────────────────────── templates ────────────────────────────────────


def _dose(dose, when):
    # "Losartan, 1 tablet, at 8:00 PM, after dinner"
    return ", ".join(p for p in (clean(dose["name"]), clean(dose["dose"]), when, clean(dose["instructions"])) if p)


def _medication(found, now, words):
    today, upcoming = found["today"], found["next"]
    sentences = []
    if today:
        items = [
            _dose(d, _fill(words["at_time"], time=_clock(d["due_at"]))) + words["status"].get(d["status"], "")
            for d in today
        ]
        sentences.append(_fill(words["meds_today"], items=_join(items, words, "; ")))
    if upcoming:
        when = _when(upcoming[0]["due_at"], now, words)
        items = [_dose(d, when) for d in upcoming]
        key = "next_med" if len(items) == 1 else "next_meds"
        sentences.append(_fill(words[key], items=_join(items, words, "; ")))
    return " ".join(sentences), _unique(d["medication_id"] for d in today + upcoming)


def _next_event(found, now, words):
    left, upcoming = found["today"], found["next"]
    if left:
        items = [_fill(words["event_item"], title=clean(o["title"]), time=_clock(o["occurrence_at"])) for o in left]
        return _fill(words["today_left"], items=_join(items, words)), _unique(o["id"] for o in left)
    if not upcoming:
        return "", []
    key = "next_appointment" if found.get("kind") == "appointment" else "next_event"
    text = _fill(words[key], title=clean(upcoming["title"]), when=_when(upcoming["occurrence_at"], now, words))
    notes = clean(upcoming.get("notes"))
    if notes:
        text += f" {notes}" if notes.endswith((".", "!", "?")) else f" {notes}."
    if found.get("scope") == "today" and not found.get("kind"):
        text = f"{words['today_done']} {text}"
    return text, [upcoming["id"]]


# ─────────────────────────────── LLM and fallback ───────────────────────────────


def _normal(text):
    return " ".join(str(text).replace("’", "'").lower().split())


def _is_no_data(text):
    """True when the model answered with the no-data reply it is told to use (in either
    language), with or without the caregiver's name."""
    said = _normal(text)
    return any(_normal(variant.split(".")[0]) in said for pair in fallback.NO_DATA.values() for variant in pair)


def _mentioned(person, text):
    names = [person.get("nickname"), person.get("name"), (person.get("name") or "").split(" ")[0]]
    return any(n and re.search(rf"\b{re.escape(n)}\b", text, re.IGNORECASE) for n in names)


def _no_data(language, caregiver):
    shown = [caregiver] if caregiver and caregiver.get("trust") == TRUST_VERIFIED else []
    return {
        "answer": fallback.no_data_reply(language, caregiver),
        "answer_mode": "no_data", "record_ids": [], "people": shown,
    }


def _fallback_records(question, found, people):
    memories = found["memories"]
    if found.get("from_search"):
        return retrieve.best_matches(question, memories)[:FALLBACK_RECORDS]
    # "Who is Ana?": the person, then who they are, rather than every note about them
    identity = [m for m in memories if m.get("category") == CATEGORY_IDENTITY]
    return (people + (identity or memories))[:FALLBACK_RECORDS]


def _phrased(question, found, language, caregiver, now):
    # a search only found the memories; the people linked to them are for photos, not facts
    people = [] if found.get("from_search") else found["people"]
    records = people + found["memories"]
    if not records:
        return _no_data(language, caregiver)
    try:
        text = llm.complete(prompts.build_prompt(question, records, now),
                            system=prompts.build_system_prompt(language, caregiver))
        mode = "llm"
    except llm.LLMUnavailable:
        records = _fallback_records(question, found, people)
        text = fallback.build_fallback_answer(records, language, caregiver, now)
        mode = "fallback"
    if _is_no_data(text):
        return _no_data(language, caregiver)
    shown = people or [p for p in found["people"] if _mentioned(p, text)]
    return {"answer": text, "answer_mode": mode, "record_ids": _unique(r["id"] for r in records), "people": shown}


def build(question, intent, found, language=None, caregiver=None, now=None):
    """The answer for one question. `found` is what retrieve.retrieve() returned for
    `intent`; `caregiver` is the people row the no-data reply names (or None)."""
    if intent in ("medication", "next_event"):
        words = WORDS[fallback.fallback_language(language)]
        text, ids = (_medication if intent == "medication" else _next_event)(found, now, words)
        if not text:
            return _no_data(language, caregiver)
        return {"answer": text, "answer_mode": "template", "record_ids": ids, "people": found.get("people", [])}
    return _phrased(question, found, language, caregiver, now)
