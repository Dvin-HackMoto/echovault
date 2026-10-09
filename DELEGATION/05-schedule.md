# MODULE: Schedule

Owner: TBD

Goal:
Store appointments, routines, meals and visits as structured records and answer "what is today" and "what is next".

Features:
- Schedule item CRUD
- Recurrence expansion
- Today and next endpoints
- Reminder acknowledgements

Tasks:
- [ ] SCH-1 Schedule item CRUD
- [ ] SCH-2 Recurrence, today and next
- [ ] SCH-3 Reminder acknowledgements

Dependencies:
- Hub Foundation
- People and Places

Definition of Done:
- A caregiver can create one-off and recurring items
- `GET /schedule/today` and `GET /schedule/next` return correct occurrences
- An acknowledgement is recorded without being treated as proof the activity happened

## SCH-1

MODULE FROM: Schedule
Task: Schedule item CRUD
Owner: N/A
Goal: Fill in `features/schedule/repository.py` and `router.py` with list, get, create, update and delete for `schedule_items`.
Priority: P0
Dependencies: HUB-4
Acceptance Criteria:
- [ ] Create and update validate `title`, `kind`, `starts_at` and the recurrence string format
- [ ] Items can link to a person and a place
- [ ] Write endpoints use `require_caregiver`
Status: TODO

## SCH-2

MODULE FROM: Schedule
Task: Recurrence, today and next
Owner: N/A
Goal: Expand `daily`, `weekly:MO,WE` and `monthly:15` recurrence in Python and add `GET /schedule/today` and `GET /schedule/next`.
Priority: P0
Dependencies: SCH-1
Acceptance Criteria:
- [ ] `today` returns every active occurrence for the current Manila date, in time order
- [ ] `next` returns the nearest future occurrence, including one on a later day
- [ ] Items past `ends_on` or with `is_active = 0` are left out
- [ ] One-off items appear only on their own date
Status: TODO

## SCH-3

MODULE FROM: Schedule
Task: Reminder acknowledgements
Owner: N/A
Goal: Add an endpoint (assumed `POST /schedule/{id}/ack`) that writes `acknowledged`, `dismissed` or `snoozed` to `schedule_acks` for one occurrence.
Priority: P1
Dependencies: SCH-2
Acceptance Criteria:
- [ ] The patient can post an acknowledgement for a specific `occurrence_at`
- [ ] A second response for the same occurrence updates the first instead of failing
- [ ] `today` shows each occurrence's latest response
Status: TODO
