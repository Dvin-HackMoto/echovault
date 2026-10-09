# MODULE: Reminders and Offline

Owner: TBD

Goal:
Keep reminders firing and the essential screens readable when the hub is off or out of range.

Features:
- Local notifications for schedule and medications
- Cached home, schedule and people
- Queued patient actions

Tasks:
- [x] REM-0 Test tooling and contracts
- [ ] REM-1 Local reminders
- [ ] REM-2 Offline cache
- [ ] REM-3 Queued actions

Dependencies:
- Mobile Foundation
- Schedule
- Medications

Definition of Done:
- A reminder fires on the phone with the hub switched off
- With the hub unreachable, the patient still sees home, schedule and people
- Responses made offline reach the hub once it is back

## Decisions

Agreed before the work started. They fill gaps ARCHITECTURE.md leaves open.

- **Real hub client.** `src/hubClient.ts` calls the hub's actual endpoints (`GET /schedule/today?date=`, `POST /schedule/{id}/ack`, `GET /medications/today`, `GET /medications`, `POST /medications/logs/{id}`, `GET /patient`, `GET /people`) with `X-Role: patient`. It has its own `fetch`, so it does not wait for `src/api/client.ts`; it only needs the saved hub address.
- **Tomorrow's doses are worked out on the phone.** `GET /medications/today` has no date parameter and the hub creates a day's logs on that day, so doses after midnight come from `GET /medications` (each medicine's times, days, start and end dates), using the same rule as the hub. Such a dose has no log id; when it is confirmed, the id is looked up from `/medications/today` at send time.
- **Medication reminders hand off.** This module fires the dose notification and exposes `reminders.due().doses` and `reminders.confirmDose(dose, status)`. The card and its buttons are PAT-6.
- **Okay and Later are in the app only.** The notification is plain; `ReminderBanner` shows the buttons.
- **Later** posts `snoozed` and reminds again in 10 minutes, or at the start time if that is sooner. After the start time it only records the response.
- **Answered items are not reminded again.** `acknowledged` or `dismissed` occurrences and doses that are not `unconfirmed` get no notification, including answers still waiting in the queue.
- **Window.** The next 24 hours only, fetched as today plus tomorrow. With the hub unreachable, a refresh leaves the scheduled notifications as they are.
- **Photos** of people are copied to the phone on each successful fetch, so they show offline. A photo's URL is `/photos/<photo_path>`, as the hub serves them.
- **Queue.** A 4xx reply drops the action (404 deleted, 422 time changed, 409 a caregiver already recorded the dose); a network error, timeout, 5xx, 408 or 429 keeps it at the front and stops the flush.
- **One hub request at a time.** `main`'s `get_db` fails when two requests overlap (see Integration notes), so the client queues its requests. It can go back to parallel once every hub uses the restored connection code.
- **Screens.** PAT screens are not touched. They use `useCached` and `StaleNotice`.
- **Time.** Hub time strings are read as the phone's local time (phone assumed to be on Manila time).

## Files

- `src/hub.ts`: interfaces, row types matching the hub's JSON, error types, hub time helpers
- `src/hubClient.ts`: the real `HubApi` over HTTP
- `src/reminders.ts`: plan, sync, 30-minute refresh, Okay, Later, `confirmDose`, `due`
- `src/cache.ts`: hub-first reads with cache fallback, photo saving
- `src/queue.ts`: stored, ordered queue of acks and dose confirmations
- `src/useCached.ts`, `src/components/StaleNotice.tsx`, `src/components/ReminderBanner.tsx`: React pieces
- `src/platform.ts`: Expo adapters (expo-notifications, AsyncStorage, expo-file-system) and `createOffline(hubAddress)`
- `src/testing/recorded/`: responses captured from the real hub code, used as the test data
- `src/testing/fakes.ts`: a hub that can be switched off, plus fake clock, storage, notifier and file store
- `src/__tests__/`: `npm test` in `mobile/`. `contract.test.ts` checks the types against the recordings; `live.test.ts` runs against a running hub when `ECHOVAULT_HUB_URL` is set.

## Integration notes

Found by running this module against the real schedule, medications and settings code:

- **Overlapping requests.** `main`'s `database/connection.py` opens SQLite without `check_same_thread=False`, so two requests at once fail and the connection is dropped. This branch restores the hub-foundation connection code, which does not have the problem (40 overlapping requests all answered). The phone client still sends one request at a time, which is harmless.
- **App shell.** With the hub-foundation `main.py` restored on this branch, feature routers are registered automatically and `/health` and `/photos` exist. The schedule and medications routers themselves are still on their own branches.
- **Schedule constants.** `SCHEDULE_KINDS` and `ACK_RESPONSES` are in `app/constants.py` on this branch, so `schedule/deps.py` no longer needs its mock for them.
- **People:** PPL-1 has landed. `getPeople()` calls the real `GET /people`, and the `Person` type is checked against `recorded/people.json` by `contract.test.ts`.

## Still to verify on a device

These need the Expo project from MOB-1 and cannot be checked with `npm test`:

- `src/platform.ts`, `ReminderBanner`, `StaleNotice` and `useCached` have not been compiled or rendered
- A notification is actually shown by Android with the hub off
- `createOffline()` needs the storage key MOB-2 uses for the hub address

## REM-0

MODULE FROM: Reminders and Offline
Task: Test tooling and contracts
Owner: N/A
Goal: Add Jest and TypeScript to `mobile/`, define the interfaces in `src/hub.ts`, and build the fakes and fixtures in `src/testing/` so the module can be tested without Expo or a hub.
Priority: P1
Dependencies: None
Acceptance Criteria:
- [x] `npm test` runs in `mobile/` with no Expo install
- [x] The fake hub can be switched off and records what it received
- [x] Test data is recorded from the real hub code (schedule, doses, medications, patient)
Status: REVIEW

## REM-1

MODULE FROM: Reminders and Offline
Task: Local reminders
Owner: N/A
Goal: Fill in `src/reminders.ts` and the `ReminderBanner` component: on app open and every 30 minutes, fetch today's schedule and medication times and schedule local notifications for the next 24 hours.
Priority: P1
Dependencies: MOB-6, SCH-2, MED-1
Acceptance Criteria:
- [x] Notifications fire at `starts_at − remind_before_min` and at each dose time
- [x] Old notifications are cancelled before new ones are scheduled, so none are duplicated
- [ ] A reminder fires with the hub off (passes against the fake notifier; not yet seen on a phone)
- [x] Okay and Later post `acknowledged` and `snoozed`
Status: REVIEW

## REM-2

MODULE FROM: Reminders and Offline
Task: Offline cache
Owner: N/A
Goal: Fill in `src/cache.ts` to keep the last-fetched schedule, people and profile in AsyncStorage and serve them when the hub is unreachable.
Priority: P1
Dependencies: MOB-6
Acceptance Criteria:
- [ ] Home, Schedule and People render from the cache with the hub off (data is served from the cache; the screens are PAT-1, PAT-4, PAT-5)
- [ ] Cached screens show that the information may not be current (`stale` flag is tested; `StaleNotice` is not yet rendered)
- [x] The cache refreshes on every successful fetch
Status: REVIEW

## REM-3

MODULE FROM: Reminders and Offline
Task: Queued actions
Owner: N/A
Goal: Queue reminder acknowledgements and medication confirmations in AsyncStorage when the hub is unreachable and send them when it returns.
Priority: P2
Dependencies: REM-1, SCH-3, MED-3
Acceptance Criteria:
- [x] An action taken offline is stored and survives an app restart
- [x] Queued actions are sent in order when the hub is reachable again
- [x] A queued action is sent once and then removed
Status: REVIEW
