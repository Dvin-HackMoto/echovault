# validation, photo upload, and the places lookup other modules use
#
# Other modules should call this instead of querying the table themselves:
#   verified_places(conn)   anything shown to the patient (games topic 'familiar_places')

from fastapi import HTTPException

from . import repository
from .deps import TRUST_STATUSES, TRUST_UNVERIFIED, TRUST_VERIFIED, photos

PHOTO_PREFIX = "place"

with_photo_url = photos.with_photo_url


def _text(value):
    if value is None:
        return None
    return str(value).strip() or None


def validate_place(payload):
    """Checks a complete place (create, or saved row merged with an update)."""
    place = {
        "name": _text(payload.get("name")),
        "description": _text(payload.get("description")),
        "address": _text(payload.get("address")),
        "trust": payload.get("trust", TRUST_UNVERIFIED),
    }
    if not place["name"]:
        raise HTTPException(422, "name is required")
    if place["trust"] not in TRUST_STATUSES:
        raise HTTPException(422, f"trust must be one of {', '.join(TRUST_STATUSES)}")
    return place


def save_photo(conn, place, upload):
    name = photos.save(upload, PHOTO_PREFIX)
    repository.set_photo(conn, place["id"], name)
    photos.remove(place.get("photo_path"), PHOTO_PREFIX)
    return name


def delete(conn, place):
    repository.delete_place(conn, place["id"])
    photos.remove(place.get("photo_path"), PHOTO_PREFIX)


def verified_places(conn):
    return [with_photo_url(p) for p in repository.list_places(conn, trust=TRUST_VERIFIED)]
