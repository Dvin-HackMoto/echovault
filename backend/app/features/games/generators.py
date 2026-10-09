# build questions from verified people/memories/routine
#
# Every game type returns the same round shape, so the phone needs one player:
#
#   {
#     "activity":   "family_matching",
#     "topic":      "family_names" | None,      # which caregiver topic the round practices
#     "difficulty": 1..3,
#     "available":  True,
#     "reason":     None | "not_enough_data" | "topic_not_selected",
#     "questions": [{
#       "id":           "seed-person-ana",       # sent back as question_ref if needed
#       "prompt":       "Which one is Ana?",
#       "photo_url":    None | "/photos/...",    # picture shown with the prompt
#       "choice_style": "photo" | "text",        # photo: show choice photos, label is alt text
#       "choices":      [{"id", "label", "photo_url"}],   # [] = open recall, reveal the answer
#       "answer_id":    "seed-person-ana" | None,
#       "answer_label": "Ana",
#     }],
#   }
#
# Rules every generator follows:
#   - rows only come from sources.py, which returns verified, currently valid data only;
#     wrong choices are drawn from the same verified rows, never invented
#   - choices per question = difficulty + 1 (2, 3 or 4), fewer if there are not enough
#     verified rows, never fewer than 2; with no playable question the round is
#     available=False / not_enough_data
#   - the round carries the correct answer so the phone gives feedback offline; the hub
#     never scores anything

import json
import random

from app.ai.records import display_name

from . import sources

QUESTIONS_PER_ROUND = 3
MIN_CHOICES = 2

NOT_ENOUGH_DATA = "not_enough_data"
TOPIC_NOT_SELECTED = "topic_not_selected"

PHOTO = "photo"
TEXT = "text"


class Context:
    """What a generator needs for one round."""

    def __init__(self, conn, difficulty, topics, rng, day=None):
        self.conn = conn
        self.difficulty = difficulty
        self.topics = topics  # caregiver topics enabled for this game, in settings order
        self.rng = rng
        self.day = day
        self.topic = None  # set by generators that pick their own topic (memory_quiz)

    @property
    def choice_count(self):
        return self.difficulty + 1


# ─────────────────────────────────── helpers ────────────────────────────────────


def _key(text):
    return " ".join(str(text or "").lower().split())


def _choice(choice_id, label, photo_url=None):
    return {"id": choice_id, "label": label, "photo_url": photo_url}


def _question(qid, prompt, answer, distractors, *, photo_url=None, style=TEXT):
    """`answer` and `distractors` are choice dicts; _finish shuffles them."""
    return {
        "id": qid,
        "prompt": prompt,
        "photo_url": photo_url,
        "choice_style": style,
        "choices": [answer, *distractors],
        "answer_id": answer["id"],
        "answer_label": answer["label"],
    }


def _distractors(ctx, pool, answer_key, key_fn):
    """Up to choice_count - 1 rows from `pool` whose key differs from the answer and
    from each other, so no two choices mean the same thing."""
    candidates = list(pool)
    ctx.rng.shuffle(candidates)
    picked, seen = [], {answer_key}
    for row in candidates:
        key = key_fn(row)
        if key and key not in seen:
            seen.add(key)
            picked.append(row)
        if len(picked) == ctx.choice_count - 1:
            break
    return picked


def _finish(ctx, questions):
    """Keeps playable questions only, shuffles each one's choices, caps the round."""
    playable = []
    for q in questions:
        if q["choices"] and len(q["choices"]) < MIN_CHOICES:
            continue
        ctx.rng.shuffle(q["choices"])
        playable.append(q)
    return playable[:QUESTIONS_PER_ROUND]


def _sample(ctx, rows, n=QUESTIONS_PER_ROUND):
    rows = list(rows)
    return ctx.rng.sample(rows, min(n, len(rows)))


def _name(person):
    return display_name(person) or person["name"]


def _relation(person):
    return f"your {person['relationship'].strip().lower()}"


def _relation_label(person):
    text = _relation(person)
    return text[0].upper() + text[1:]


# ────────────────────────────── GAM-1: people games ─────────────────────────────


def family_matching(ctx, topic):
    """Prompt names a person (or a relationship); choices are photos."""
    people = sources.people_with_photos(ctx.conn)
    by_relation = topic == "relationships"
    key_fn = (lambda p: _key(p["relationship"])) if by_relation else (lambda p: _key(_name(p)))
    questions = []
    for person in _sample(ctx, people, len(people)):
        others = [p for p in people if p["id"] != person["id"]]
        wrong = _distractors(ctx, others, key_fn(person), key_fn)
        prompt = f"Which one is {_relation(person)}?" if by_relation else f"Which one is {_name(person)}?"
        questions.append(_question(
            person["id"], prompt,
            _choice(person["id"], _name(person), person["photo_url"]),
            [_choice(p["id"], _name(p), p["photo_url"]) for p in wrong],
            style=PHOTO,
        ))
    return _finish(ctx, questions)


def name_recall(ctx, topic):
    """Prompt shows a photo; choices are names (or relationships)."""
    people = sources.people_with_photos(ctx.conn)
    by_relation = topic == "relationships"
    label_fn = _relation_label if by_relation else _name
    key_fn = lambda p: _key(label_fn(p))  # noqa: E731
    pool = sources.verified_people(ctx.conn)  # wrong names need no photo
    questions = []
    for person in _sample(ctx, people, len(people)):
        others = [p for p in pool if p["id"] != person["id"]]
        wrong = _distractors(ctx, others, key_fn(person), key_fn)
        prompt = "Who is this person to you?" if by_relation else "Who is this?"
        questions.append(_question(
            person["id"], prompt,
            _choice(person["id"], label_fn(person)),
            [_choice(p["id"], label_fn(p)) for p in wrong],
            photo_url=person["photo_url"],
        ))
    return _finish(ctx, questions)


# ─────────────────────────── GAM-3: memory and routine ──────────────────────────


def event_recall(ctx, topic):
    """Verified history memories, asked through the verified person or place they link to,
    plus caregiver trivia written about those memories."""
    people = {p["id"]: p for p in sources.verified_people(ctx.conn)}
    places = {p["id"]: p for p in sources.verified_places(ctx.conn)}
    questions = []
    for memory in sources.usable_memories(ctx.conn, category="history"):
        title = memory.get("title") or memory["content"]
        place = places.get(memory.get("place_id"))
        if place:
            others = [p for p in places.values() if p["id"] != place["id"]]
            wrong = _distractors(ctx, others, _key(place["name"]), lambda p: _key(p["name"]))
            questions.append(_question(
                f"{memory['id']}:place", f"{title}. Where did this happen?",
                _choice(place["id"], place["name"], place.get("photo_url")),
                [_choice(p["id"], p["name"], p.get("photo_url")) for p in wrong],
                photo_url=memory["photo_url"],
            ))
        person = people.get(memory.get("person_id"))
        if person:
            others = [p for p in people.values() if p["id"] != person["id"]]
            wrong = _distractors(ctx, others, _key(_name(person)), lambda p: _key(_name(p)))
            questions.append(_question(
                f"{memory['id']}:person", f"{title}. Who was part of this?",
                _choice(person["id"], _name(person), person["photo_url"]),
                [_choice(p["id"], _name(p), p["photo_url"]) for p in wrong],
                photo_url=memory["photo_url"],
            ))
    for trivia in sources.personal_trivia(ctx.conn, ctx.difficulty):
        if trivia["memory"]["category"] == "history":
            questions.append(_trivia_question(ctx, trivia))
    return _finish(ctx, _sample(ctx, [q for q in questions if q], len(questions)))


def _trivia_question(ctx, trivia):
    """A caregiver trivia row as a round question; None if its choices are unusable."""
    memory = trivia["memory"]
    answer = str(trivia["answer"]).strip()
    base = {
        "id": trivia["id"], "prompt": trivia["question"], "photo_url": memory.get("photo_url"),
        "choice_style": TEXT, "answer_label": answer,
    }
    if not trivia.get("choices"):
        return {**base, "choices": [], "answer_id": None}  # open recall
    try:
        options = [str(c).strip() for c in json.loads(trivia["choices"]) if str(c).strip()]
    except (TypeError, ValueError):
        return None
    if _key(answer) not in {_key(o) for o in options}:
        return None  # the caregiver's answer is not among the choices: skip, don't guess
    answer_index = next(i for i, o in enumerate(options) if _key(o) == _key(answer))
    rows = [{"id": f"{trivia['id']}:{i}", "label": o} for i, o in enumerate(options)]
    correct = rows[answer_index]
    wrong = _distractors(ctx, [r for r in rows if r is not correct], _key(correct["label"]),
                         lambda r: _key(r["label"]))
    return {
        **base,
        "choices": [_choice(correct["id"], correct["label"]), *(_choice(r["id"], r["label"]) for r in wrong)],
        "answer_id": correct["id"],
    }


def memory_quiz(ctx, topic):
    """Caregiver trivia linked to verified memories, on the selected topics.
    Questions without a topic are included: they still come from a verified memory."""
    selected = set(ctx.topics)
    rows = [t for t in sources.personal_trivia(ctx.conn, ctx.difficulty)
            if t.get("topic") is None or t["topic"] in selected]
    topic_of, questions = {}, []
    for row in _sample(ctx, rows, len(rows)):
        question = _trivia_question(ctx, row)
        if question:
            topic_of[question["id"]] = row.get("topic")
            questions.append(question)
    questions = _finish(ctx, questions)
    # the round's topic is the shared one, or None when the quiz mixes topics
    shared = {topic_of[q["id"]] for q in questions}
    ctx.topic = shared.pop() if len(shared) == 1 else None
    return questions


def routine_recall(ctx, topic):
    """'What comes after Breakfast?' over today's routine in time order."""
    routine = sources.routine_today(ctx.conn, ctx.day)
    pairs = list(zip(routine, routine[1:]))
    questions = []
    for before, after in sorted(_sample(ctx, pairs), key=lambda pair: pair[0]["occurrence_at"]):
        others = [o for o in routine if o["id"] not in (before["id"], after["id"])]
        wrong = _distractors(ctx, others, _key(after["title"]), lambda o: _key(o["title"]))
        questions.append(_question(
            f"{before['id']}>{after['id']}", f"After {before['title']}, what comes next?",
            _choice(after["id"], after["title"]),
            [_choice(o["id"], o["title"]) for o in wrong],
        ))
    # keep the round in the order the day happens; _finish only shuffles choices
    return _finish(ctx, questions)


def picture_matching(ctx, topic):
    """A photo of a familiar place or a recorded event, matched to its name."""
    if topic == "familiar_places":
        items = [{"id": p["id"], "label": p["name"], "photo_url": p["photo_url"]}
                 for p in sources.verified_places(ctx.conn) if p.get("photo_url")]
        prompt = "Which place is this?"
    else:  # recent_events
        items = [{"id": m["id"], "label": m.get("title") or m["content"], "photo_url": m["photo_url"]}
                 for m in sources.usable_memories(ctx.conn) if m.get("photo_url")]
        prompt = "What is this picture from?"
    pool = items
    questions = []
    for item in _sample(ctx, items, len(items)):
        others = [i for i in pool if i["id"] != item["id"]]
        wrong = _distractors(ctx, others, _key(item["label"]), lambda i: _key(i["label"]))
        questions.append(_question(
            item["id"], prompt, _choice(item["id"], item["label"]),
            [_choice(i["id"], i["label"]) for i in wrong], photo_url=item["photo_url"],
        ))
    return _finish(ctx, questions)


# ──────────────────────────────────── rounds ────────────────────────────────────

# game type → (caregiver topics that unlock it, generator, one topic per round?)
GAMES = {
    "family_matching": (("family_names", "relationships"), family_matching, True),
    "name_recall": (("family_names", "relationships"), name_recall, True),
    "event_recall": (("recent_events",), event_recall, True),
    "routine_recall": (("routines",), routine_recall, True),
    "picture_matching": (("familiar_places", "recent_events"), picture_matching, True),
    # trivia rows carry their own topic, so one quiz can mix the selected topics
    "memory_quiz": (("family_names", "relationships", "routines", "familiar_places", "recent_events"),
                    memory_quiz, False),
}

GAME_TYPES = tuple(GAMES)


def build_round(conn, activity, *, rng=None, day=None):
    """One playable round of `activity`. Raises KeyError for an unknown game type."""
    unlocks, generate, per_topic = GAMES[activity]
    rng = rng or random.Random()
    topics, difficulty = sources.game_settings(conn)
    enabled = [t for t in topics if t in unlocks]
    result = {"activity": activity, "topic": None, "difficulty": difficulty,
              "available": False, "reason": None, "questions": []}
    if not enabled:
        return {**result, "reason": TOPIC_NOT_SELECTED}

    ctx = Context(conn, difficulty, enabled, rng, day)
    if per_topic:
        # try the enabled topics in random order; the first with playable questions wins
        for topic in rng.sample(enabled, len(enabled)):
            questions = generate(ctx, topic)
            if questions:
                return {**result, "topic": topic, "available": True, "questions": questions}
        return {**result, "reason": NOT_ENOUGH_DATA}

    questions = generate(ctx, None)
    if not questions:
        return {**result, "reason": NOT_ENOUGH_DATA}
    return {**result, "topic": ctx.topic, "available": True, "questions": questions}
