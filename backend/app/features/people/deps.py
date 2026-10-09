# The only place People imports from other modules (HUB-1, HUB-2, HUB-4).
#
#   get_role()          returns "patient" or "caregiver"
#   require_caregiver   returns the caregiver row (dict)
#   get_db()            autocommit connection (repository.py still commits explicitly)
from app import config
from app.constants import ROLE_CAREGIVER, TRUST_STATUSES, TRUST_UNVERIFIED, TRUST_VERIFIED
from app.database.connection import get_db
from app.middleware.dependencies import get_role, require_caregiver

__all__ = [
    "ROLE_CAREGIVER", "TRUST_STATUSES", "TRUST_UNVERIFIED", "TRUST_VERIFIED",
    "get_db", "get_role", "require_caregiver", "photo_dir",
]


def photo_dir():
    # read on every call (not copied at import) so tests can monkeypatch app.config
    return config.PHOTO_DIR
