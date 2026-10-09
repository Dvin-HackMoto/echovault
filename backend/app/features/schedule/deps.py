# The only place Schedule imports from other modules (HUB-1, HUB-2, HUB-4).
#
# Each name is taken from its real module as soon as that module defines it. Only a
# name that does not exist yet falls back to mock.py, with a warning. Any other error
# while importing the real module is raised, so a broken real module is never hidden
# behind mock data.
#
# Set ECHOVAULT_ALLOW_MOCKS=0 to make a missing name an error (use this to check that
# integration is complete). Once nothing falls back, delete mock.py and dev_app.py.

import importlib
import os
import warnings

ALLOW_MOCKS = os.getenv("ECHOVAULT_ALLOW_MOCKS", "1") != "0"


def _real_or_mock(module_name, name):
    real = getattr(importlib.import_module(module_name), name, None)
    if real is not None:
        return real
    if not ALLOW_MOCKS:
        raise ImportError(f"schedule needs {module_name}.{name}, which does not exist yet")
    warnings.warn(f"schedule: {module_name}.{name} not found, using the mock from schedule/mock.py")
    from . import mock

    return getattr(mock, name)


SCHEDULE_KINDS = _real_or_mock("app.constants", "SCHEDULE_KINDS")
ACK_RESPONSES = _real_or_mock("app.constants", "ACK_RESPONSES")
get_db = _real_or_mock("app.database.connection", "get_db")
get_role = _real_or_mock("app.middleware.dependencies", "get_role")
require_caregiver = _real_or_mock("app.middleware.dependencies", "require_caregiver")
