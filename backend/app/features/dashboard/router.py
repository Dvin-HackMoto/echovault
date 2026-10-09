# unverified/conflicting counts, unconfirmed meds, activity
#
# SET-3 GET /dashboard. Returns FULL LISTS of rows (not counts) for every
# bullet in ARCHITECTURE section 10, plus an engagement-only activity summary.
#
# HARD PRODUCT CONSTRAINT (PRODUCT.md + ARCHITECTURE sections 10 and 11):
# activity is reported as ENGAGEMENT, never as a score or cognitive measure.
# The response MUST NOT contain any score, rating, percentage, accuracy, or a
# separate correct/incorrect field — only played vs skipped counts.

from fastapi import APIRouter, Depends

from app.database.connection import get_db
from app.middleware.dependencies import require_caregiver

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def get_dashboard(caregiver_id=Depends(require_caregiver), conn=Depends(get_db)):
    """Return everything the caregiver needs to review. Caregiver only."""

    # unverified memories, including AI suggestions (source='ai_suggested')
    unverified_memories = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM memories WHERE trust = 'unverified' "
            "ORDER BY updated_at DESC"
        )
    ]

    # conflicting pairs, deduped so each pair appears once (id < conflicts_with)
    conflicting_pairs = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM memories WHERE trust = 'conflicting' "
            "AND conflicts_with IS NOT NULL AND id < conflicts_with "
            "ORDER BY updated_at DESC"
        )
    ]

    # memories outdated in the last 7 days
    outdated_memories = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM memories WHERE trust = 'outdated' "
            "AND updated_at >= datetime('now','localtime','-7 days') "
            "ORDER BY updated_at DESC"
        )
    ]

    # unconfirmed-past-due or skipped doses, joined to medication name/dose
    medication_attention = [
        dict(r)
        for r in conn.execute(
            "SELECT l.*, m.name AS medication_name, m.dose AS medication_dose "
            "FROM medication_logs l JOIN medications m ON m.id = l.medication_id "
            "WHERE l.status = 'skipped' "
            "OR (l.status = 'unconfirmed' "
            "    AND l.due_at < datetime('now','localtime')) "
            "ORDER BY l.due_at DESC"
        )
    ]

    # flagged assistant answers
    flagged_answers = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM assistant_log WHERE flagged = 1 ORDER BY created_at DESC"
        )
    ]

    # activity summary — ENGAGEMENT ONLY: played vs skipped counts grouped by
    # activity and topic. No score / rating / percentage / accuracy, and no
    # separate correct/incorrect field. "played" rolls up every non-skipped
    # outcome; "skipped" is outcome='skipped'.
    activity_summary = [
        dict(r)
        for r in conn.execute(
            "SELECT activity, topic, "
            "SUM(CASE WHEN outcome = 'skipped' THEN 0 ELSE 1 END) AS played_count, "
            "SUM(CASE WHEN outcome = 'skipped' THEN 1 ELSE 0 END) AS skipped_count "
            "FROM activity_log GROUP BY activity, topic ORDER BY activity, topic"
        )
    ]

    return {
        "unverified_memories": unverified_memories,
        "conflicting_pairs": conflicting_pairs,
        "outdated_memories": outdated_memories,
        "medication_attention": medication_attention,
        "flagged_answers": flagged_answers,
        "activity_summary": activity_summary,
    }
