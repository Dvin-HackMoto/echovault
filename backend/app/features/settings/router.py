# game topics, difficulty, prompt frequency, quiet hours
#
# SET-1 (settings) and SET-2 (patient profile) endpoint bodies are owned by
# FEAT-002. FEAT-001 only exposes an importable `router` object so main.py can
# register it without churn.

from fastapi import APIRouter

router = APIRouter(tags=["settings"])
