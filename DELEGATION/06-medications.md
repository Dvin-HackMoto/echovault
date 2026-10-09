# MODULE: Medications

Owner: TBD

Goal:
Let caregivers set medication schedules and track each dose as unconfirmed, taken or skipped, without the system ever marking a dose taken on its own.

Features:
- Medication and dose time CRUD
- Daily generation of due doses
- Patient and caregiver confirmation

Tasks:
- [ ] MED-1 Medication and time CRUD
- [ ] MED-2 Daily dose log generation
- [ ] MED-3 Dose confirmation

Dependencies:
- Hub Foundation
- Auth and Access Control

Definition of Done:
- A caregiver can add a medication with one or more daily times
- Today's doses exist as `unconfirmed` rows
- Patient and caregiver confirmations are stored separately

## MED-1

MODULE FROM: Medications
Task: Medication and time CRUD
Owner: N/A
Goal: Fill in `features/medications/repository.py` and `router.py` with CRUD for `medications` and their `medication_times`.
Priority: P0
Dependencies: HUB-4
Acceptance Criteria:
- [ ] A medication can be created with name, dose, instructions and one or more times
- [ ] `time_of_day` and `days` formats are validated
- [ ] Only caregivers can create, update or delete
- [ ] Deleting a medication removes its times and logs
Status: TODO

## MED-2

MODULE FROM: Medications
Task: Daily dose log generation
Owner: N/A
Goal: Fill in `features/medications/service.py` to insert an `unconfirmed` `medication_logs` row for every active dose due today, on the first request of the day.
Priority: P1
Dependencies: MED-1
Acceptance Criteria:
- [ ] Every active time due today gets exactly one log row
- [ ] Running the generation again creates no duplicates
- [ ] Medications outside `start_date` to `end_date`, inactive, or not due on that weekday are skipped
Status: TODO

## MED-3

MODULE FROM: Medications
Task: Dose confirmation
Owner: N/A
Goal: Add `POST /medications/logs/{id}` to set `taken` or `skipped`, plus a list of today's doses with their status.
Priority: P1
Dependencies: MED-2
Acceptance Criteria:
- [ ] A patient confirmation stores `confirmed_by = patient` and `responded_at`
- [ ] A caregiver can confirm or correct a dose, stored as `confirmed_by = caregiver`
- [ ] No code path sets `taken` without an explicit request
- [ ] Doses still `unconfirmed` past `due_at` are queryable for the dashboard
Status: TODO
