# MODULE: People and Places

Owner: TBD

Goal:
Store the people and places the patient knows, with photos, so the assistant, the photo directory and the games can use them.

Features:
- People CRUD
- Photo upload
- Trust status on people
- Places CRUD

Tasks:
- [x] PPL-1 People CRUD
- [x] PPL-2 Person photo upload
- [x] PPL-3 Places CRUD

Dependencies:
- Hub Foundation
- Auth and Access Control

Definition of Done:
- A caregiver can add a person with a name, relationship and photo
- The patient app can list verified people with photo URLs
- Patient mode cannot change any record

## PPL-1

MODULE FROM: People and Places
Task: People CRUD
Owner: N/A
Goal: Fill in `features/people/repository.py` and `router.py` with list, get, create, update and delete for `people`.
Priority: P0
Dependencies: HUB-4
Acceptance Criteria:
- [x] Create and update validate required fields (`name`, `relationship`) and the `trust` enum
- [x] The list can be filtered by `trust`, and patient mode only receives verified people
- [x] Write endpoints use `require_caregiver` and record `created_by`
- [x] Deleting a person leaves their memories in place with `person_id` cleared
Status: DONE

## PPL-2

MODULE FROM: People and Places
Task: Person photo upload
Owner: N/A
Goal: Add `POST /people/{id}/photo` that saves the file to `storage/photos/` and stores only the path in `people.photo_path`.
Priority: P0
Dependencies: PPL-1, HUB-3
Acceptance Criteria:
- [x] An uploaded image is saved under a generated file name and its path is stored on the person
- [x] People responses include a photo URL the phone can load
- [x] A non-image upload or an unknown person id is rejected
- [x] Replacing a photo removes the old file
Status: DONE

## PPL-3

MODULE FROM: People and Places
Task: Places CRUD
Owner: N/A
Goal: Add list, get, create, update and delete for `places` (assumed inside `features/people/`; see open questions).
Priority: P2
Dependencies: PPL-1
Acceptance Criteria:
- [x] A caregiver can add a place with name, description, address and photo
- [x] Memories and schedule items can reference a place by id
- [x] Patient mode only receives verified places
Status: DONE
