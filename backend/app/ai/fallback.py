"""Fallback_Builder: fixed-wording replies that need no model or network.

``no_data_reply`` is the single source of the "I don't have that saved" reply.
``prompts.build_system_prompt`` embeds it, so the model and the template path
say exactly the same thing. This module must not import ``prompts`` (that
module imports from here).

``build_fallback_answer`` turns usable records into plain sentences using the
fixed ``TEMPLATES`` wording. Record values are copied verbatim after
``records.clean`` (whitespace collapsing only); the only added text is the
template's connecting words.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable

from .records import clean, display_name, is_person, usable_records

# Fixed connecting words per fallback language. Placeholders are filled in a
# single pass by ``_fill`` (never str.format), so a record value that contains
# braces or a placeholder name such as "{relationship}" is inserted literally.
TEMPLATES = {
    "en": {
        "person_is": "{who} is your {relationship}.",
        "person_name": "{who}.",
        "notes": " {notes}",
        "memory": "{text}",
    },
    "fil": {
        "person_is": "Si {who} ay ang iyong {relationship}.",
        "person_name": "Si {who}.",
        "notes": " {notes}",
        "memory": "{text}",
    },
}

_PLACEHOLDER_RE = re.compile(r"\{(who|relationship|notes|text)\}")
_TERMINAL = (".", "!", "?")

# (with caregiver name, without a name). ``{name}`` is filled with str.replace,
# never str.format, so a name containing braces cannot break rendering.
NO_DATA = {
    "en": (
        "I don't have that saved yet. You can ask {name}.",
        "I don't have that saved yet. You can ask your caregiver.",
    ),
    "fil": (
        "Wala pa akong naka-save tungkol diyan. Pwede mong tanungin si {name}.",
        "Wala pa akong naka-save tungkol diyan. Pwede mong tanungin ang iyong tagapag-alaga.",
    ),
}


def fallback_language(language: object) -> str:
    """``"fil"`` for Filipino, ``"en"`` for everything else (including ``fil-en``).

    Matching ignores surrounding whitespace and case, consistent with
    ``prompts.normalize_language`` (``" FIL "`` -> ``"fil"``). Missing,
    non-string or unknown values give ``"en"``.
    """
    if isinstance(language, str) and language.strip().lower() == "fil":
        return "fil"
    return "en"


def no_data_reply(language: object = None, caregiver: dict | None = None) -> str:
    """Return the no-data reply in the fallback language, naming the caregiver.

    The caregiver is named by ``records.display_name`` (nickname, else name).
    With no usable name, the "your caregiver" / "ang iyong tagapag-alaga"
    variant is returned. Pure: the caregiver dict is not modified.
    """
    with_name, without_name = NO_DATA[fallback_language(language)]
    name = display_name(caregiver)
    if name:
        return with_name.replace("{name}", name)
    return without_name


def _fill(template: str, values: dict[str, str]) -> str:
    """Replace ``{who}``/``{relationship}``/``{notes}``/``{text}`` in one pass.

    Substituted values are never re-scanned, so a value containing a
    placeholder string cannot be substituted twice.
    """
    return _PLACEHOLDER_RE.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def _memory_sentence(record: dict, templates: dict[str, str]) -> str:
    text = clean(record.get("content")) or clean(record.get("title"))
    if not text:
        return ""
    if not text.endswith(_TERMINAL):
        text += "."
    return _fill(templates["memory"], {"text": text})


def _person_sentence(record: dict, templates: dict[str, str]) -> str:
    name = clean(record.get("name"))
    nickname = clean(record.get("nickname"))
    relationship = clean(record.get("relationship"))
    notes = clean(record.get("notes"))

    # Same head rule as prompts._person_line: name, plus " (nickname)" when the
    # nickname differs case-insensitively; with no name, the nickname alone.
    if name:
        who = name
        if nickname and nickname.casefold() != name.casefold():
            who = f"{name} ({nickname})"
    else:
        who = nickname

    if who:
        key = "person_is" if relationship else "person_name"
        sentence = _fill(templates[key], {"who": who, "relationship": relationship})
        if notes:
            sentence += _fill(templates["notes"], {"notes": notes})
        return sentence

    # No name or nickname: the templates need a subject, so the relationship
    # cannot be rendered without inventing words. Notes (if any) are emitted
    # verbatim on their own; otherwise the record is skipped.
    if notes:
        return _fill(templates["notes"], {"notes": notes}).strip()
    return ""


def render_sentence(record: dict, lang: str) -> str:
    """Render one record with the ``lang`` templates (``"en"``/``"fil"``).

    Memory: ``clean(content)`` or, if empty, ``clean(title)``, with ``.``
    appended unless it already ends in ``.``, ``!`` or ``?``.
    Person: ``who`` is name (plus `` (nickname)`` when it differs), or the
    nickname when there is no name; ``person_is`` when relationship is set,
    else ``person_name``; then `` {notes}`` when notes are set. A person with
    no name or nickname renders only its notes. ``""`` when nothing renders.
    Unknown ``lang`` values use the English templates. Pure.
    """
    if not isinstance(record, dict):
        return ""
    templates = TEMPLATES.get(lang, TEMPLATES["en"])
    if is_person(record):
        return _person_sentence(record, templates)
    return _memory_sentence(record, templates)


def build_fallback_answer(
    records: Iterable[object],
    language: object = None,
    caregiver: dict | None = None,
    now: datetime | None = None,
) -> str:
    """Plain-sentence answer from usable records, with no model or network call.

    Records are filtered with ``usable_records(records, now)``; each renders to
    one sentence in caller order, empty sentences are skipped, and the rest are
    joined by single spaces. With no sentences, returns
    ``no_data_reply(language, caregiver)``. Inputs are not modified.
    """
    lang = fallback_language(language)
    sentences = []
    for record in usable_records(records, now):
        sentence = render_sentence(record, lang)
        if sentence:
            sentences.append(sentence)
    if not sentences:
        return no_data_reply(language, caregiver)
    return " ".join(sentences)
