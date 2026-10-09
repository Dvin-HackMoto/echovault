# The only place Medications imports from other modules (HUB-1, HUB-2, HUB-4).
#
# Each name is taken from its real module as soon as that module defines it. Only a
# name that does not exist yet falls back to mock.py, with a warning. Any other error
# while importing the real module is raised, so a broken real module is never hidden
# behind mock data.
#
# Two hub foundations exist (the minimal one on main, and feature/01-hub-foundation).
# They differ in names and return shapes, so this file accepts both:
#   status constant    MEDICATION_STATUSES (main)  or  MED_STATUSES (hub branch)
#   get_role()         {"role", "caregiver_id"}     or  "patient" / "caregiver"
#   require_caregiver  the caregiver id             or  the caregiver row (dict)
#   get_db()           commit needed                or  autocommit
# Routers read roles and ids through role_of() / caregiver_id_of(), and repository.py
# commits explicitly, so either foundation works unchanged.
#
# Set ECHOVAULT_ALLOW_MOCKS=0 to make a missing name an error (use this to check that
# integration is complete). Once nothing falls back, delete mock.py and dev_app.py.

import importlib
import os
import warnings

ALLOW_MOCKS = os.getenv("ECHOVAULT_ALLOW_MOCKS", "1") != "0"

ROLE_CAREGIVER = "caregiver"  # the X-Role header value for caregiver mode, in both foundations


def _mock():
    from . import mock

    return mock


def _real_or_mock(module_name, *names):
    module = importlib.import_module(module_name)
    for name in names:
        real = getattr(module, name, None)
        if real is not None:
            return real
    if not ALLOW_MOCKS:
        raise ImportError(f"medications needs {module_name}.{names[0]}, which does not exist yet")
    warnings.warn(f"medications: {module_name}.{names[0]} not found, using the mock from medications/mock.py")
    return getattr(_mock(), names[0])


MED_STATUSES = _real_or_mock("app.constants", "MED_STATUSES", "MEDICATION_STATUSES")
get_db = _real_or_mock("app.database.connection", "get_db")
get_role = _real_or_mock("app.middleware.dependencies", "get_role")
require_caregiver = _real_or_mock("app.middleware.dependencies", "require_caregiver")


def role_of(identity):
    """What get_role returned -> 'patient' or 'caregiver'."""
    return identity["role"] if isinstance(identity, dict) else identity


def caregiver_id_of(caregiver):
    """What require_caregiver returned -> the caregiver's id."""
    return caregiver["id"] if isinstance(caregiver, dict) else caregiver


def photo_dir():
    # read on every call (not copied at import) so tests can monkeypatch app.config
    real = getattr(importlib.import_module("app.config"), "PHOTO_DIR", None)
    if real is not None:
        return real
    if not ALLOW_MOCKS:
        raise ImportError("medications needs app.config.PHOTO_DIR, which does not exist yet")
    return _mock().PHOTO_DIR
