# structured queries + FTS, verified & valid only
#
# One function per intent. Each returns the rows an answer may be built from:
#   who_is(conn, "Ana", now)     {"people": [...], "memories": [...]}
#   next_event(conn, detected, now)  {"scope", "kind", "today": [...], "next": occurrence | None, "people": [...]}
#   medication(conn, now)        {"today": [...], "next": [...]}
#   general(conn, question, now) {"people": [...], "memories": [...]}
#
# People, schedule and medications are read through their own services. Memories has no
# service yet, so the memory queries live here. No memory that is unverified, conflicting,
# outdated, archived or outside its validity dates is ever returned.

import re
from datetime import datetime, time, timedelta

from app.ai.records import usable_records
from app.features.medications import service as medications
from app.features.people import service as people
from app.features.schedule import repository as schedule_items
from app.features.schedule import service as schedule

DT_FORMAT = "%Y-%m-%d %H:%M:%S"
MEMORY_LIMIT = 5

# The filter of the core retrieval query (ARCHITECTURE.md), with `now` passed in. A
# valid_until that is only a date ('2026-12-31') counts until the end of that day.
USABLE = """
    m.trust = 'verified'
    AND m.validity != 'archived'
    AND m.conflicts_with IS NULL
    AND (m.valid_until IS NULL OR m.valid_until = ''
         OR CASE WHEN length(m.valid_until) = 10 THEN m.valid_until || ' 23:59:59'
                 ELSE m.valid_until END >= :now)
    AND (m.valid_from IS NULL OR m.valid_from = '' OR m.valid_from <= :now)
"""
BY_IMPORTANCE = "CASE m.importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END"

# question words and fillers that say nothing about which memory is wanted
STOPWORDS = frozenset(
    # English
    "a about again am an and any are as at be but by can did do does for from has have he her his "
    "how i if in is it me my no not of on or our please remember she so tell that the their them "
    "there they this to us was we were what when where who why will with you your "
    # Filipino
    "ako akin aking alin ang ano at ay ba bakit daw din ikaw ito iyan iyon ka kailan kami kay ko "
    "kong lang may mayroon mga mo na naman namin nasaan natin ng nga ni niya o pa paano po raw rin "
    "sa saan si sina sino siya tayo tungkol yun yung".split()
)


def _words(text):
    return [w for w in re.findall(r"\w+", str(text or "").lower()) if len(w) > 1 and w not in STOPWORDS]


def fts_query(text):
    """'What is Ana's favorite flower?' -> '"ana" OR "favorite"* OR "flower"*'. Every word
    is quoted, so nothing in a question can be read as FTS syntax. Longer words also match
    as a prefix ("flower" finds "flowers")."""
    return " OR ".join(f'"{w}"*' if len(w) >= 4 else f'"{w}"' for w in dict.fromkeys(_words(text)))


def _usable(rows, now):
    # ai/records.py is the rule the prompt and fallback builders apply; run it here too so
    # the ids that get logged are exactly the records that could be used
    return usable_records([dict(r) for r in rows], now)


def search_memories(conn, text, now):
    query = fts_query(text)
    if not query:
        return []
    rows = conn.execute(
        f"SELECT m.* FROM memories_fts f JOIN memories m ON m.rowid = f.rowid "
        f"WHERE memories_fts MATCH :q AND {USABLE} ORDER BY {BY_IMPORTANCE}, rank LIMIT {MEMORY_LIMIT}",
        {"q": query, "now": now.strftime(DT_FORMAT)},
    ).fetchall()
    return _usable(rows, now)


def best_matches(text, memories):
    """The memories that share the most words with the question, in the order given.
    A search matches on any word, so "What is my favorite food?" also finds the favorite
    singer; this keeps only the memory that has both words."""
    wanted = set(_words(text))
    scores = [len(wanted & set(_words(f"{m.get('title')} {m.get('content')}"))) for m in memories]
    return [m for m, score in zip(memories, scores) if score == max(scores)]


def memories_about(conn, person_id, now):
    rows = conn.execute(
        f"SELECT m.* FROM memories m WHERE m.person_id = :person AND {USABLE} "
        f"ORDER BY {BY_IMPORTANCE}, m.updated_at DESC, m.id LIMIT {MEMORY_LIMIT}",
        {"person": person_id, "now": now.strftime(DT_FORMAT)},
    ).fetchall()
    return _usable(rows, now)


def _linked_people(conn, rows):
    """The verified people the given memories or schedule items point to."""
    ids = {r.get("person_id") for r in rows}
    return [p for p in people.verified_people(conn) if p["id"] in ids]


# ─────────────────────────────── one path per intent ────────────────────────────


def who_is(conn, name, now):
    found = people.find_by_name(conn, name)
    if not found:
        # "Dr. Ramon" is saved as "Dr. Ramon Cruz": try the words of the name one by one
        seen = {}
        for word in _words(name):
            for person in people.find_by_name(conn, word):
                seen.setdefault(person["id"], person)
        found = list(seen.values())
    if not found:
        # nobody verified by that name; a verified memory may still mention it
        return general(conn, name, now)
    memories = [m for person in found for m in memories_about(conn, person["id"], now)]
    return {"people": found, "memories": memories}


def _next_of_kind(conn, kind, now):
    """schedule.next_occurrence() for one kind of item, e.g. only appointments."""
    best = None
    for item in schedule_items.list_items(conn, kind, active_only=True):
        at = schedule.next_occurrence_of(item, now)
        if at and (best is None or (at, item["title"]) < (best[0], best[1]["title"])):
            best = (at, item)
    return schedule.occurrence(best[1], best[0]) if best else None


def next_event(conn, detected, now):
    scope, kind = detected.get("scope", "next"), detected.get("kind")
    upcoming = _next_of_kind(conn, kind, now) if kind else None
    if upcoming is None:
        # no kind asked for, or nothing of that kind is coming up: the next item of any kind
        kind, upcoming = None, schedule.next_occurrence(conn, now)
    left = []
    if scope == "today":
        # still to come, or already started and not over yet
        stamp = now.strftime(DT_FORMAT)
        left = [
            o for o in schedule.today(conn, now.date())
            if (o["ends_at"] or o["occurrence_at"]) >= stamp and kind in (None, o["kind"])
        ]
    used = left or ([upcoming] if upcoming else [])
    return {"scope": scope, "kind": kind, "today": left, "next": upcoming, "people": _linked_people(conn, used)}


def medication(conn, now):
    today = medications.today_doses(conn, now)
    # the next dose is the next one nobody has answered yet: a dose already marked as taken
    # or skipped ahead of its time is not announced as still to come
    stamp = now.strftime(DT_FORMAT)
    waiting = [d for d in today if d["status"] == "unconfirmed" and d["due_at"] >= stamp]
    if waiting:
        upcoming = [d for d in waiting if d["due_at"] == min(w["due_at"] for w in waiting)]
    else:
        tomorrow = datetime.combine(now.date() + timedelta(days=1), time.min)
        upcoming = medications.next_doses(conn, tomorrow)
    return {"today": today, "next": upcoming}


def general(conn, question, now):
    memories = search_memories(conn, question, now)
    return {"people": _linked_people(conn, memories), "memories": memories, "from_search": True}


def retrieve(conn, detected, question, now):
    intent = detected["intent"]
    if intent == "who_is":
        return who_is(conn, detected["name"], now)
    if intent == "next_event":
        return next_event(conn, detected, now)
    if intent == "medication":
        return medication(conn, now)
    return general(conn, question, now)
