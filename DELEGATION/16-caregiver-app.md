# MODULE: Caregiver App

Owner: TBD

Goal:
Let an authorized caregiver manage everything the patient sees: memories, people, schedule, medications and activity settings.

Features:
- PIN unlock
- Memory management and verification
- People and photo management
- Schedule management
- Medication management and confirmation tracking
- Dashboard
- Game and trivia settings, activity history
- Backup and restore

Tasks:
- [ ] CGV-1 PIN screen and caregiver layout
- [ ] CGV-2 Memory management screens
- [ ] CGV-3 People management screen
- [ ] CGV-4 Schedule management screen
- [ ] CGV-5 Medication management screen
- [ ] CGV-6 Dashboard screen
- [ ] CGV-7 Activities screen
- [ ] CGV-8 Backup screen

Dependencies:
- Mobile Foundation
- Auth and Access Control
- Memories
- People and Places
- Schedule
- Medications
- Settings and Dashboard

Definition of Done:
- A caregiver can unlock, add a person with a photo, add and verify a memory, and see the patient app use it
- Every change is visible on the patient phone at its next fetch

## CGV-1

MODULE FROM: Caregiver App
Task: PIN screen and caregiver layout
Owner: N/A
Goal: Build the PIN entry and the `(caregiver)` layout with navigation between caregiver screens.
Priority: P0
Dependencies: MOB-4, AUTH-2
Acceptance Criteria:
- [ ] A correct PIN opens caregiver mode and sets the caregiver headers on the client
- [ ] A wrong PIN shows an error and stays on the PIN screen
- [ ] Leaving caregiver mode clears the caregiver id, so the PIN is needed again
Status: TODO

## CGV-2

MODULE FROM: Caregiver App
Task: Memory management screens
Owner: N/A
Goal: Build `app/(caregiver)/memories/`: list with trust and category filters, add and edit form, verify and delete.
Priority: P0
Dependencies: CGV-1, MEM-2
Acceptance Criteria:
- [ ] The form sets content, category, importance, validity, validity dates, and an optional person
- [ ] The list shows each memory's trust status and can filter by it
- [ ] Verify is one tap from the list
- [ ] Conflicting pairs can be resolved once MEM-4 is done
Status: TODO

## CGV-3

MODULE FROM: Caregiver App
Task: People management screen
Owner: N/A
Goal: Build `app/(caregiver)/people.tsx`: add, edit, verify and remove people, with a photo from the camera or gallery.
Priority: P0
Dependencies: CGV-1, PPL-2
Acceptance Criteria:
- [ ] A person can be added with name, nickname, relationship, notes and photo
- [ ] One person can be marked as the caregiver the assistant refers the patient to
- [ ] A new person appears in the patient's directory once verified
Status: TODO

## CGV-4

MODULE FROM: Caregiver App
Task: Schedule management screen
Owner: N/A
Goal: Build `app/(caregiver)/schedule.tsx`: add, edit and remove one-off and recurring items.
Priority: P1
Dependencies: CGV-1, SCH-1
Acceptance Criteria:
- [ ] The form sets title, kind, start time, recurrence, reminder lead time, and an optional person
- [ ] Recurrence is chosen from simple options, not typed as a string
- [ ] An item can be marked as a quiet period
Status: TODO

## CGV-5

MODULE FROM: Caregiver App
Task: Medication management screen
Owner: N/A
Goal: Build `app/(caregiver)/medications.tsx`: manage medications and times, and review today's doses.
Priority: P1
Dependencies: CGV-1, MED-3
Acceptance Criteria:
- [ ] A medication can be added with name, dose, instructions, photo and times
- [ ] Today's doses show unconfirmed, taken or skipped, and who confirmed them
- [ ] The caregiver can confirm or correct a dose
Status: TODO

## CGV-6

MODULE FROM: Caregiver App
Task: Dashboard screen
Owner: N/A
Goal: Build `app/(caregiver)/dashboard.tsx` from `GET /dashboard`.
Priority: P1
Dependencies: CGV-1, SET-3
Acceptance Criteria:
- [ ] Shows counts and lists for memories to review, conflicts, outdated memories, unconfirmed doses and flagged answers
- [ ] Each item links to the screen where it can be fixed
- [ ] Activity is shown as what was played or skipped, with no scores
Status: TODO

## CGV-7

MODULE FROM: Caregiver App
Task: Activities screen
Owner: N/A
Goal: Build `app/(caregiver)/activities.tsx`: game topics, difficulty, trivia frequency, quiet hours, and activity history.
Priority: P1
Dependencies: CGV-1, SET-1
Acceptance Criteria:
- [ ] Topics, difficulty, frequency and quiet hours can be changed and are saved to the hub
- [ ] History lists recent games and prompts with outcome and topic
- [ ] The screen states that activity is not a clinical assessment
Status: TODO

## CGV-8

MODULE FROM: Caregiver App
Task: Backup screen
Owner: N/A
Goal: Build `app/(caregiver)/backup.tsx`: export a backup to the phone and import one, with a confirmation step.
Priority: P2
Dependencies: CGV-1, BKP-2
Acceptance Criteria:
- [ ] Export saves the zip where the caregiver can find it
- [ ] Import asks for confirmation and explains that current data will be replaced
- [ ] Success and failure are both reported clearly
Status: TODO
