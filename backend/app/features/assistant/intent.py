# rule-based: who_is | next_event | medication | general
#
#   detect("Sino si Ana?")            -> {"intent": "who_is", "name": "Ana"}
#   detect("What do I have today?")   -> {"intent": "next_event", "scope": "today"}
#   detect("My next appointment?")    -> {"intent": "next_event", "scope": "next", "kind": "appointment"}
#   detect("Ano ang gamot ko?")       -> {"intent": "medication"}
#
# The rules run in this order and the first match wins: medication, next_event, who_is,
# general. So "What is my next medicine?" is medication and "Who is visiting today?" is
# next_event. Keywords are whole words, in English and Filipino.

import re

MEDICATION = re.compile(r"\b(gamot|medicines?|medications?|meds|pills?|tablets?)\b")
NEXT = re.compile(r"\b(next|susunod|sunod)\b")
TODAY = re.compile(r"\b(today|ngayon|ngayong|mamaya|schedule)\b")
APPOINTMENT = re.compile(r"\b(appointments?|check-?ups?)\b")
WHO_IS = re.compile(r"\b(?:who\s+is|who\s*'s|sino\s+(?:ba\s+)?(?:si|sina|ang))\s+(?P<name>.+)", re.IGNORECASE)

# words people add after the name: "Sino si Ana po?", "Who is Ana again?"
TRAILING_WORDS = ("po", "ba", "nga", "again", "please")


def _name(raw):
    name = " ".join(raw.replace("?", " ").replace("!", " ").split()).strip(" .,;:")
    words = name.split()
    while words and words[-1].lower().strip(".,") in TRAILING_WORDS:
        words.pop()
    return " ".join(words).strip(" .,;:")


def detect(text):
    """The intent of a question, with the name for who_is and the scope for next_event."""
    question = str(text or "").replace("’", "'")
    lowered = question.lower()

    if MEDICATION.search(lowered):
        return {"intent": "medication"}

    asks_next, asks_today = NEXT.search(lowered), TODAY.search(lowered)
    appointment = APPOINTMENT.search(lowered)
    if asks_next or asks_today or appointment:
        # "what is next today?" wants the one next thing, not the whole day
        found = {"intent": "next_event", "scope": "today" if asks_today and not asks_next else "next"}
        if appointment:
            found["kind"] = "appointment"
        return found

    who = WHO_IS.search(question)
    if who and _name(who.group("name")):
        return {"intent": "who_is", "name": _name(who.group("name"))}

    return {"intent": "general"}
