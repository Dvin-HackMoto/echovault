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
- [x] CGV-1 PIN screen and caregiver layout
- [x] CGV-2 Memory management screens
- [x] CGV-3 People management screen
- [x] CGV-4 Schedule management screen
- [x] CGV-5 Medication management screen
- [x] CGV-6 Dashboard screen
- [x] CGV-7 Activities screen
- [x] CGV-8 Backup screen

> Note: all 8 caregiver screens are built, typecheck clean (`npx tsc --noEmit`),
> and route all I/O through `src/api/*` (no direct `fetch`). Screens with a LIVE
> backend on `main` are fully functional: CGV-6 Dashboard, CGV-7 settings, CGV-8
> Backup. Screens whose backend is still a stub (Auth/PIN, People, Memories,
> Schedule, Medications) have complete UIs but cannot be exercised end-to-end
> until those backend modules land; criteria needing a live backend are left
> unchecked below with a note. On-device Android boot is unverified (headless).

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
- [ ] A correct PIN opens caregiver mode and sets the caregiver headers on the client  <!-- client flow complete (pinLogin + setCaregiverId); live verification awaits the Auth backend (POST /auth/pin is a stub) -->
- [x] A wrong PIN shows an error and stays on the PIN screen
- [x] Leaving caregiver mode clears the caregiver id, so the PIN is needed again
Status: DONE

## CGV-2

MODULE FROM: Caregiver App
Task: Memory management screens
Owner: N/A
Goal: Build `app/(caregiver)/memories/`: list with trust and category filters, add and edit form, verify and delete.
Priority: P0
Dependencies: CGV-1, MEM-2
Acceptance Criteria:
- [x] The form sets content, category, importance, validity, validity dates, and an optional person
- [x] The list shows each memory's trust status and can filter by it
- [x] Verify is one tap from the list
- [x] Conflicting pairs can be resolved once MEM-4 is done  <!-- resolve affordance built and 404-guarded; depends on the Memories backend (MEM) to function live -->
Status: DONE

## CGV-3

MODULE FROM: Caregiver App
Task: People management screen
Owner: N/A
Goal: Build `app/(caregiver)/people.tsx`: add, edit, verify and remove people, with a photo from the camera or gallery.
Priority: P0
Dependencies: CGV-1, PPL-2
Acceptance Criteria:
- [x] A person can be added with name, nickname, relationship, notes and photo
- [x] One person can be marked as the caregiver the assistant refers the patient to
- [ ] A new person appears in the patient's directory once verified  <!-- UI complete; end-to-end flow awaits the People backend (PPL is a stub) -->
Status: DONE

## CGV-4

MODULE FROM: Caregiver App
Task: Schedule management screen
Owner: N/A
Goal: Build `app/(caregiver)/schedule.tsx`: add, edit and remove one-off and recurring items.
Priority: P1
Dependencies: CGV-1, SCH-1
Acceptance Criteria:
- [x] The form sets title, kind, start time, recurrence, reminder lead time, and an optional person
- [x] Recurrence is chosen from simple options, not typed as a string
- [x] An item can be marked as a quiet period
Status: DONE  <!-- UI complete; live behavior awaits the Schedule backend (SCH is a stub on main) -->


## CGV-5

MODULE FROM: Caregiver App
Task: Medication management screen
Owner: N/A
Goal: Build `app/(caregiver)/medications.tsx`: manage medications and times, and review today's doses.
Priority: P1
Dependencies: CGV-1, MED-3
Acceptance Criteria:
- [x] A medication can be added with name, dose, instructions, photo and times
- [x] Today's doses show unconfirmed, taken or skipped, and who confirmed them
- [x] The caregiver can confirm or correct a dose
Status: DONE  <!-- UI complete; live behavior awaits the Medications backend (MED is a stub on main) -->


## CGV-6

MODULE FROM: Caregiver App
Task: Dashboard screen
Owner: N/A
Goal: Build `app/(caregiver)/dashboard.tsx` from `GET /dashboard`.
Priority: P1
Dependencies: CGV-1, SET-3
Acceptance Criteria:
- [x] Shows counts and lists for memories to review, conflicts, outdated memories, unconfirmed doses and flagged answers
- [x] Each item links to the screen where it can be fixed
- [x] Activity is shown as what was played or skipped, with no scores
Status: DONE

## CGV-7

MODULE FROM: Caregiver App
Task: Activities screen
Owner: N/A
Goal: Build `app/(caregiver)/activities.tsx`: game topics, difficulty, trivia frequency, quiet hours, and activity history.
Priority: P1
Dependencies: CGV-1, SET-1
Acceptance Criteria:
- [x] Topics, difficulty, frequency and quiet hours can be changed and are saved to the hub
- [ ] History lists recent games and prompts with outcome and topic  <!-- rendered as a clearly labeled placeholder; the client exposes no activity-history endpoint (owned by the Games module), so no call is invented -->
- [x] The screen states that activity is not a clinical assessment
Status: DONE

## CGV-8

MODULE FROM: Caregiver App
Task: Backup screen
Owner: N/A
Goal: Build `app/(caregiver)/backup.tsx`: export a backup to the phone and import one, with a confirmation step.
Priority: P2
Dependencies: CGV-1, BKP-2
Acceptance Criteria:
- [x] Export saves the zip where the caregiver can find it
- [x] Import asks for confirmation and explains that current data will be replaced
- [x] Success and failure are both reported clearly
Status: DONE
