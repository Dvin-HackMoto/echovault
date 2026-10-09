# TRV-1: loads assets/trivia.json into trivia_questions (kind 'general', source 'preloaded')
#
# main.py runs load_preloaded() on every startup, demo mode or not. It is safe to repeat:
# rows are matched by id, a changed question is updated in place, and a question that was
# taken out of the file is removed. A caregiver's choice to switch a question off is kept.
#
# From backend/:  py -m app.features.trivia.loader

import json

from . import repository
from .deps import TRIVIA_GENERAL, TRIVIA_SOURCE_PRELOADED, connect, trivia_file

ID_PREFIX = "preloaded-"  # only rows with this id prefix are ever touched here
REQUIRED = ("id", "topic", "question", "answer", "difficulty")


def read_file(path=None):
    """The file's questions as trivia_questions rows. ValueError names the entry that is wrong."""
    path = path or trivia_file()
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError(f"{path.name} must be a list of questions")
    questions, seen = [], set()
    for number, entry in enumerate(entries, start=1):
        where = f"{path.name} question {number}"
        if not isinstance(entry, dict):
            raise ValueError(f"{where} must be an object")
        missing = [field for field in REQUIRED if not entry.get(field)]
        if missing:
            raise ValueError(f"{where} is missing {', '.join(missing)}")
        where = f"{path.name} question {entry['id']!r}"
        if not str(entry["id"]).startswith(ID_PREFIX):
            raise ValueError(f"{where}: id must start with {ID_PREFIX!r}")
        if entry["id"] in seen:
            raise ValueError(f"{where}: id is used twice")
        seen.add(entry["id"])
        if entry["difficulty"] not in (1, 2, 3):
            raise ValueError(f"{where}: difficulty must be 1, 2 or 3")
        choices = entry.get("choices")
        if choices is not None and (not isinstance(choices, list) or entry["answer"] not in choices):
            raise ValueError(f"{where}: choices must be a list that includes the answer")
        questions.append({
            "id": entry["id"], "kind": TRIVIA_GENERAL, "topic": entry["topic"],
            "question": entry["question"], "answer": entry["answer"],
            "choices": json.dumps(choices, ensure_ascii=False) if choices else None,
            "difficulty": entry["difficulty"],
        })
    return questions


def load_preloaded(conn=None, path=None):
    """Returns {"added": n, "removed": n}."""
    questions = read_file(path)
    own_connection = conn is None
    conn = conn or connect()
    try:
        with repository.transaction(conn):
            added = sum(repository.upsert_preloaded(conn, q, TRIVIA_SOURCE_PRELOADED) for q in questions)
            removed = repository.delete_preloaded_except(conn, ID_PREFIX, {q["id"] for q in questions})
        return {"added": added, "removed": removed}
    finally:
        if own_connection:
            conn.close()


if __name__ == "__main__":
    print(load_preloaded())
