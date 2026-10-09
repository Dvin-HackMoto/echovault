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
- [x] PPL-4 Lookups for other modules
- [x] PPL-5 Mobile data layer

Dependencies:
- Hub Foundation
- Auth and Access Control (only `get_role` / `require_caregiver`; PIN login is not needed)

Definition of Done:
- A caregiver can add a person with a name, relationship and photo
- The patient app can list verified people with photo URLs
- Patient mode cannot change any record

## What exists

| File | What it does |
|---|---|
| `backend/app/features/people/router.py` | `/people` endpoints |
| `backend/app/features/people/service.py` | Validation, photo upload, and the lookups other modules call |
| `backend/app/features/people/repository.py` | `people` SQL, including the one-fallback-caregiver rule |
| `backend/app/features/people/photos.py` | Saving, replacing and removing photo files. Shared with places |
| `backend/app/features/people/deps.py` | **The only place People imports from other modules** |
| `backend/app/features/places/` | Same shape for `/places` (`router.py`, `service.py`, `repository.py`, `deps.py`) |
| `backend/tests/test_people.py`, `test_places.py` | Run through the real app and schema |
| `mobile/src/api/people.ts`, `places.ts` | Typed calls for every endpoint below |
| `mobile/src/testing/recorded/people.json`, `places.json` | Real responses; `contract.test.ts` checks the mobile types against them |

Both routers are found by `main.py` on startup; nothing else needs editing to use them.

## Endpoints

Every request needs `X-Role`. Writes need `X-Role: caregiver` and a valid `X-Caregiver-Id`.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/people` | both | By name. Caregiver may add `?trust=`. **Patient always gets verified only** |
| GET | `/people/{id}` | both | Patient gets 404 for anyone not verified |
| POST | `/people` | caregiver | 201. Records `created_by` |
| PUT | `/people/{id}` | caregiver | Partial update |
| DELETE | `/people/{id}` | caregiver | 204. Removes the uploaded photo file |
| POST | `/people/{id}/photo` | caregiver | Multipart field `photo` |
| GET, POST, PUT, DELETE | `/places`, `/places/{id}` | same as people | |
| POST | `/places/{id}/photo` | caregiver | Multipart field `photo` |

**Person fields:** `name`\*, `relationship`\*, `nickname`, `notes`, `is_caregiver` (default 0), `trust` (default `unverified`). Responses also include `id`, `photo_path`, `photo_url`, `created_by`, `created_at`, `updated_at`.

**Place fields:** `name`\*, `description`, `address`, `trust` (default `unverified`). Responses also include `id`, `photo_path`, `photo_url`, `updated_at`.

**Validation errors** return 422 with a readable `detail`.

## Rules worth knowing

- **Trust.** A new record is `unverified` unless the caregiver sends `trust`, so the app can add and verify in one step. Editing a record does not change its trust. Verifying is `PUT {"trust": "verified"}`; there is no separate verify endpoint.
- **Fallback caregiver.** `is_caregiver` marks the one person the assistant names in "You can ask Ana". Setting it on a person clears it on everyone else.
- **Photos.** JPEG, PNG or WebP up to 10 MB. The type is read from the file's first bytes, not from its name or Content-Type. Files are saved as `person-<uuid>.<ext>` / `place-<uuid>.<ext>` and only the file name is stored. `photo_path` cannot be set through JSON.
- **`photo_url`** is `/photos/<photo_path>` (relative to the hub address), or `null`.
- **Deleting** removes the row and its uploaded photo. Memories and schedule items that pointed at it stay, with `person_id` / `place_id` cleared by the schema. The bundled `seed-*.png` demo photos are never deleted.
- **Access levels.** Any active caregiver can write, like medications and schedule. Making `viewer` read-only is AUTH-3.

## For other modules

Call these instead of querying `people` / `places` directly. Each takes a connection and returns rows with `photo_url`.

```python
from app.features.people import service as people
from app.features.places import service as places

people.verified_people(conn)        # patient directory
people.people_with_photos(conn)     # GAM-1: family_matching / name_recall
people.find_by_name(conn, "Ana")    # AST: who_is. Verified only; full name or nickname first, then one word of a name
people.fallback_caregiver(conn)     # AST: the no_data reply. None when nobody is marked
places.verified_places(conn)
```

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
Status: REVIEW

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
Status: REVIEW

## PPL-3

MODULE FROM: People and Places
Task: Places CRUD
Owner: N/A
Goal: Add list, get, create, update and delete for `places` in `features/places/`.
Priority: P2
Dependencies: PPL-1
Acceptance Criteria:
- [x] A caregiver can add a place with name, description, address and photo
- [x] Memories and schedule items can reference a place by id
- [x] Patient mode only receives verified places
Status: REVIEW

## PPL-4

MODULE FROM: People and Places
Task: Lookups for other modules
Owner: N/A
Goal: Give Assistant, Games and Memories tested functions for reading people and places, so the verified-only rule lives in one place.
Priority: P1
Dependencies: PPL-1, PPL-3
Acceptance Criteria:
- [x] Verified-only lists of people and places, and verified people who have a photo
- [x] People can be found by full name, nickname or one word of a name, ignoring case; unverified people never match
- [x] The fallback caregiver can be looked up, and is `None` when nobody is marked
Status: REVIEW

## PPL-5

MODULE FROM: People and Places
Task: Mobile data layer
Owner: N/A
Goal: Make the phone's people and places calls and types match the real hub, so PAT-5 and CGV-3 only have to build screens.
Priority: P1
Dependencies: PPL-1, PPL-2, PPL-3, MOB-2
Acceptance Criteria:
- [x] `src/api/people.ts` and `src/api/places.ts` cover every endpoint, and uploads use the `photo` field
- [x] `Person` and `Place` in `src/types.ts` and `Person` in `src/hub.ts` list exactly the fields the hub sends
- [x] `contract.test.ts` checks those types against responses recorded from the real routers
- [x] `PersonCard` loads photos from `/photos/<file>`
Status: REVIEW
