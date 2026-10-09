# MODULE: Settings and Dashboard

Owner: TBD

Goal:
Give caregivers one place to configure the patient's experience and see what needs their attention.

Features:
- Game, trivia and quiet-hour settings
- Patient profile and accessibility settings
- Dashboard summary

Tasks:
- [] SET-1 Settings endpoints
- [] SET-2 Patient profile endpoints
- [] SET-3 Dashboard endpoint

Dependencies:
- Hub Foundation
- Auth and Access Control
- Memories
- Medications

Definition of Done:
- Changing a setting changes what the games and trivia endpoints return
- `GET /dashboard` returns every list in ARCHITECTURE.md section 10
- Activity is reported as engagement, never as a score

## SET-1

MODULE FROM: Settings and Dashboard
Task: Settings endpoints
Owner: N/A
Goal: Fill in `features/settings/router.py` with read and update for `game_topics`, `game_difficulty`, `trivia_frequency_min` and `quiet_hours`.
Priority: P1
Dependencies: HUB-4
Acceptance Criteria:
- [] All settings are returned in one call as parsed JSON
- [] Updates validate the shape of each value (list, number, start and end times)
- [] Only caregivers can update; the patient app can read
Status: DONE

## SET-2

MODULE FROM: Settings and Dashboard
Task: Patient profile endpoints
Owner: N/A
Goal: Add read and update for the single `patient` row: names, birth date, photo, `language`, `font_scale`, `voice_enabled`, `managed_mode`.
Priority: P1
Dependencies: HUB-4
Acceptance Criteria:
- [] The profile can be created once and updated after, and there is never a second row
- [] `language` is limited to `fil`, `en`, `fil-en`
- [] The patient app can read the profile to apply font scale, voice and managed mode
Status: DONE

## SET-3

MODULE FROM: Settings and Dashboard
Task: Dashboard endpoint
Owner: N/A
Goal: Fill in `features/dashboard/router.py` with `GET /dashboard`.
Priority: P1
Dependencies: MEM-4, MED-3, GAM-2, AST-4
Acceptance Criteria:
- [] Returns unverified memories (including AI suggestions), conflicting pairs, and memories outdated in the last 7 days
- [] Returns unconfirmed or skipped doses and flagged assistant answers
- [] Returns an activity summary of which games and topics were played or skipped, with no score or rating
- [] Caregiver only
Status: DONE
