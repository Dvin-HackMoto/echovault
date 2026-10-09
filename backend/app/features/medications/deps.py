# The only place Medications imports from other modules (HUB-1, HUB-2, HUB-4).
#
# These used to fall back to medications/mock.py while the hub foundation was missing.
# The hub is merged now, so they are the real constants, database and role checks:
#   get_role()          returns "patient" or "caregiver"
#   require_caregiver   returns the caregiver row (dict)
#   get_db()            autocommit connection (repository.py still commits explicitly)
from app import config
from app.constants import MED_STATUSES, ROLE_CAREGIVER
from app.database.connection import get_db
from app.middleware.dependencies import get_role, require_caregiver

__all__ = [
    "MED_STATUSES", "ROLE_CAREGIVER", "get_db", "get_role", "require_caregiver",
    "role_of", "caregiver_id_of", "photo_dir",
]


def role_of(identity):
    """What get_role returned -> 'patient' or 'caregiver'."""
    return identity["role"] if isinstance(identity, dict) else identity


def caregiver_id_of(caregiver):
    """What require_caregiver returned -> the caregiver's id."""
    return caregiver["id"] if isinstance(caregiver, dict) else caregiver


def photo_dir():
    # read on every call (not copied at import) so tests can monkeypatch app.config
    return config.PHOTO_DIR
