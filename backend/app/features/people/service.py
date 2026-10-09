# validation, photo upload, and the people lookups other modules use
#
# Other modules should call these instead of querying the table themselves. Each takes
# a connection and returns plain people rows with `photo_url` added:
#   verified_people(conn)         patient directory, anything shown to the patient
#   people_with_photos(conn)      games: family_matching / name_recall (verified, has a photo)
#   find_by_name(conn, "Ana")     assistant `who_is`: verified people by name or nickname
#   fallback_caregiver(conn)      assistant `no_data`: the person in "You can ask Ana", or None

from fastapi import HTTPException

from . import photos, repository
from .deps import TRUST_STATUSES, TRUST_UNVERIFIED, TRUST_VERIFIED

PHOTO_PREFIX = "person"

with_photo_url = photos.with_photo_url


def _text(value):
    if value is None:
        return None
    return str(value).strip() or None


def _flag(value, field):
    if value in (True, 1, "1", "true"):
        return 1
    if value in (False, 0, "0", "false"):
        return 0
    raise HTTPException(422, f"{field} must be true or false")


def validate_trust(payload):
    trust = payload.get("trust", TRUST_UNVERIFIED)
    if trust not in TRUST_STATUSES:
        raise HTTPException(422, f"trust must be one of {', '.join(TRUST_STATUSES)}")
    return trust


def validate_person(payload):
    """Checks a complete person (create, or saved row merged with an update)."""
    person = {
        "name": _text(payload.get("name")),
        "nickname": _text(payload.get("nickname")),
        "relationship": _text(payload.get("relationship")),
        "notes": _text(payload.get("notes")),
        "is_caregiver": _flag(payload.get("is_caregiver", 0), "is_caregiver"),
        "trust": validate_trust(payload),
    }
    if not person["name"]:
        raise HTTPException(422, "name is required")
    if not person["relationship"]:
        raise HTTPException(422, "relationship is required, e.g. 'daughter' or 'neighbor'")
    return person


def save_photo(conn, person, upload):
    name = photos.save(upload, PHOTO_PREFIX)
    repository.set_photo(conn, person["id"], name)
    photos.remove(person.get("photo_path"), PHOTO_PREFIX)
    return name


def delete(conn, person):
    repository.delete_person(conn, person["id"])
    photos.remove(person.get("photo_path"), PHOTO_PREFIX)


# ───────────────────────────── lookups for other modules ────────────────────────


def verified_people(conn):
    return [with_photo_url(p) for p in repository.list_people(conn, trust=TRUST_VERIFIED)]


def people_with_photos(conn):
    return [with_photo_url(p) for p in repository.list_people(conn, trust=TRUST_VERIFIED, with_photo=True)]


def find_by_name(conn, text):
    """Verified people called `text`, ignoring case: a full name or nickname first
    ("Aling Rosa"), then anyone with it as one word of their name ("Ana", "Santos")."""
    wanted = " ".join(str(text or "").lower().split())
    if not wanted:
        return []
    exact, partial = [], []
    for person in verified_people(conn):
        names = [" ".join(n.lower().split()) for n in (person["name"], person["nickname"]) if n]
        if wanted in names:
            exact.append(person)
        elif any(wanted in n.split() for n in names):
            partial.append(person)
    return exact + partial


def fallback_caregiver(conn):
    person = repository.get_fallback_caregiver(conn)
    return with_photo_url(person) if person else None
