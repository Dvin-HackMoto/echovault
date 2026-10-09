# unverified/conflicting counts, unconfirmed meds, activity
#
# SET-3 (GET /dashboard) endpoint body is owned by FEAT-002. FEAT-001 only
# exposes an importable `router` object so main.py can register it without churn.

from fastapi import APIRouter

router = APIRouter(tags=["dashboard"])
