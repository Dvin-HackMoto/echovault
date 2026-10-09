# MODULE: Patient App

Owner: TBD

Goal:
Give the patient a simple, readable app to orient themselves, ask questions, see their day and familiar people, and play optional activities.

Features:
- Orientation home screen
- Ask by text and voice, with read-aloud answers
- Daily schedule
- Family photo directory
- Medication card
- Memory games
- Trivia prompt card

Tasks:
- [x] PAT-1 Home screen
- [x] PAT-2 Ask screen
- [x] PAT-3 Voice input and read-aloud
- [x] PAT-4 Schedule screen
- [x] PAT-5 People directory
- [x] PAT-6 Medication card
- [x] PAT-7 Games screens
- [x] PAT-8 Trivia prompt card

Dependencies:
- Mobile Foundation (on `main`; upgraded to Expo SDK 57 and extended here, see "Changes to the Mobile Foundation")
- Assistant, Schedule, People and Places, Medications, Memory Games, Trivia and Memory Prompts (each one uses the real hub when its endpoint exists, demo data until then; see "Real hub or demo data")

Definition of Done:
- [x] The patient can open the app, see today, ask a question and get an answer with photos
- [x] Every screen is usable with large text and few taps
- [x] Nothing in patient mode can edit records (patient mode sends only `X-Role: patient`; checked against the real hub, which answers 403)

## Running it

From `mobile/`:

```
npm install
npx expo start
```

1. Install **Expo Go** from the Play Store on the phone. This project uses **Expo SDK 57**, which is the version Expo Go runs.
2. Put the phone on the same Wi-Fi as the laptop and scan the QR code shown by `npx expo start`.
3. In the app:
   - **No hub:** tap **Use demo data (no hub)**, then **Patient**.
   - **With the hub:** type the hub's address (e.g. `192.168.100.93:8000`), tap **Connect**, then **Patient**.
4. After **Patient** is chosen once, the app opens straight to the home screen. **Hub settings (for caregivers)** at the bottom of the home screen goes back to setup.

Press `w` in the `npx expo start` terminal to preview in a laptop browser. Voice is hidden on web.

**Checks** (from `mobile/`):

| Command | What it checks |
|---------|----------------|
| `npx tsc --noEmit` | types (run `npx expo start` once first so typed routes exist in `.expo/types`) |
| `npm run test:patient` | 21 unit tests: real/demo routing, card and schedule rules, the demo hub's rules and shapes |
| `npm test` | Module 15's Jest tests (reminders, cache, queue): 63 pass, 6 skipped (they need a live hub) |
| `HUB_URL=http://<hub>:8000 npm run test:patient` | also 5 **contract tests** against a running real hub: which routes go to the hub, the fields every screen reads, a patient dose confirmation, and the 403 on patient writes. Routes the hub doesn't have yet are skipped |
| `npx expo-doctor` | Expo dependency and config checks (21/21 pass) |

The patient tests use `test:patient` so they don't collide with Module 15's Jest `test` script.

## Real hub or demo data

Most backend modules the patient app needs aren't merged yet. Every request goes through the foundation's `request()` in `src/api/client.ts`, which reads the hub's own route list (`/openapi.json`, published automatically by FastAPI) and decides **per request** (logic in `src/api/routes.ts`). The setup screen saves the mode as `ev.dataMode`:

| Mode (setup screen) | A route the hub has | A route the hub doesn't have yet | Hub not reachable |
|---------------------|---------------------|----------------------------------|-------------------|
| **auto** (default) | real hub | demo hub, labelled **"Demo data"** on that screen and on home | "Can't reach the helper", cached copy if there is one |
| **Hub only** (switch on) | real hub | `ApiError` kind `not_built`. Use this to prove integration is complete | same |
| **Demo data (no hub)** | demo hub | demo hub | — |

- **Demo data never replaces an unreachable hub.** If the hub is down, a patient sees "Can't reach the helper right now" and cached data, never invented medicines or people.
- **When a backend module is merged, its screen switches to the real hub on the next app start, with no app change**, as long as the endpoint matches the contract below.
- The demo hub (`src/mock/hub.ts`) follows the same rules as the real hub: verified people only, doses start `unconfirmed`, the patient can only answer `taken`/`skipped`. It uses the same demo family as the backend seed. Delete a section of it once its real endpoint exists, and the whole file once nothing uses it.

**Checked against the real hub** (`main` + `feature/06-medications`, run locally with demo data):
- **Contract tests:** the app's routing sent `/patient`, `/settings` and `/medications/*` to the real hub and the not-yet-built `/assistant/ask` to the demo hub.
- **Profile:** it had every field the home screen reads.
- **Doses:** they had every field the medication card reads, and a patient answer was saved as `confirmed_by = patient`.
- **Writes:** a patient-mode write was rejected with 403.

## Contracts the backend modules must provide

The app calls these exact paths. **ON MAIN** = already served by `main` or a pushed branch. **ASSUMED** = the backend module isn't built yet, and the app follows ARCHITECTURE.md plus the assumption shown. The owning module should implement it this way, or update `src/api/<feature>.ts` and `src/types.ts`.

| Screen | Call | Status | What the app reads / sends |
|--------|------|--------|----------------------------|
| Home, every screen | `GET /patient` | ON MAIN (SET-2) | `preferred_name`, `font_scale`, `managed_mode`, `voice_enabled`, `language` |
| Trivia card | `GET /settings` | ON MAIN (SET-1) | `trivia_frequency_min` |
| Home, My day | `GET /schedule/today` | `feature/05-schedule` | occurrences with `occurrence_at`, `ends_at`, `title`, `person_name`, `place_name`, `notes` |
| Home, My family | `GET /people?trust=verified` | ASSUMED (PPL-1) | `id`, `name`, `nickname`, `relationship`, `notes`, `trust`, and **`photo_url`** (or `photo_path`, served at `/photos/<photo_path>`) |
| Person details | `GET /memories?trust=verified&person_id=<id>` | ASSUMED (MEM-1): **needs a `person_id` filter** | `content`. The app also drops anything not `verified`, `archived`, or about someone else |
| Ask | `POST /assistant/ask {text}` | `feature/08-assistant` (AST-4) | `{answer, people[], memory_ids, answer_mode, intent}` (people with `photo_url`) |
| Ask (voice) | `POST /assistant/voice` multipart **field `audio`** (m4a) | `feature/08-assistant` (AST-5) | same as ask, plus **`transcript`** (`""` when no words were heard; the answer then says "Sorry, I didn't catch that") |
| Medication card | `GET /medications/today`, `POST /medications/logs/{id} {status}` | `feature/06-medications` | dose rows with `name`, `dose`, `instructions`, `photo_url`, `due_at`, `status` |
| Games | `GET /games/{type}/round` | `feature/09-memory-games` (merged) | `GameRound` in `src/api/games.ts`: `{activity, topic, difficulty, available, reason, questions[]}`. Each question has `prompt`, `photo_url`, `choice_style` (`photo` or `text`), `choices[{id, label, photo_url}]` (empty = "Show the answer"), `answer_id`, `answer_label`. `available: false` with `reason` `not_enough_data` or `topic_not_selected` instead of questions |
| Games | `POST /games/result` | `feature/09-memory-games` (merged) | `{activity, topic, outcome, difficulty, duration_sec}`, **one row per round**. `trivia_prompt` is rejected here; the trivia card uses `POST /trivia/result` |
| Trivia card | `GET /trivia/next` | ASSUMED (TRV-2) | a `trivia_questions` row (`choices` as a JSON array string) or `null`, plus optional **`people[]`** for "See photos" |

## Changes to the Mobile Foundation

The patient app is built on Module 13's foundation (`main`). Its client, theme, components and API files are used as they are, with these additions. Everything is backwards compatible: existing props, exports and function names still work.

| File | Change |
|------|--------|
| `package.json`, `app.json`, `package-lock.json` | **Expo SDK 52 → 57**, the only SDK the Play Store's Expo Go runs. `expo-av` → `expo-audio` (plugin with the same microphone text), `expo-asset` added, `newArchEnabled` removed (rejected by expo-doctor on SDK 57), `react-dom` + `react-native-web` for the browser preview, `test:patient` script. See `mobile/verification.md` |
| `src/api/client.ts` | real/demo routing inside `request()` (`getDataMode`/`setDataMode`, `demoStore`), `ApiError` kind `not_built`, `photoUri()`, optional timeout on `postForm`/`uploadFile`. `checkHealth` reads `/openapi.json` first, then `/health` |
| `src/api/routes.ts` (new) | the per-request real/demo decision, unit-tested |
| `src/api/medications.ts` | **fix:** `todayMedicationLogs()` called `/medications/logs/today`; the real route is `GET /medications/today`, returning `Dose[]` |
| `src/api/schedule.ts` | `todaySchedule()`/`nextSchedule()` return `ScheduleOccurrence` (what Module 05 serves) |
| `src/api/people.ts`, `memories.ts`, `assistant.ts`, `games.ts`, `trivia.ts` | patient helpers: `listVerifiedPeople()`, `verifiedMemoriesAbout()`, `person_id` filter, longer ask/voice timeouts, `transcript`, `GameRound.message`, question `photo_url`, `TriviaPrompt` |
| `src/types.ts` | `ScheduleOccurrence`, `Dose`, `TriviaPrompt`, `Person.photo_url` |
| `src/theme.ts` | color tokens `secondary`/`onSecondary`, `successBg`, `warning`/`warningBg`, `demo`/`demoBg`, `past` |
| `src/components/BigButton.tsx` | `secondary` and `success` variants, `hint`, emoji string icons |
| `src/components/PersonCard.tsx` | **fix:** photos are served at `/photos/<photo_path>` (it built `<hub>/<photo_path>`); uses `photo_url` when present; `onPress`, `compact`, `patientView` ("Your daughter"); initials if the photo fails to load |
| `src/components/MicButton.tsx` | hold-to-talk `onPressIn`/`onPressOut`, `showLabel` |
| `src/voice/record.ts` | expo-audio `useHoldToTalk()`, `ensureMicPermission()`, `hasMicPermission()` |
| `src/voice/speak.ts` | `onDone` also fires on stop/error; `voiceLanguage()` |
| `app/index.tsx` | "Use demo data (no hub)", "Hub only" switch, patient mode reopens straight to home, `?setup=1` returns to setup |

New patient files: `src/patient/*` (state, logic, cards, read-through cache `cached.ts`), `src/components/Notice.tsx`, `src/mock/*` (demo hub), `src/time.ts`, `tests/*`.

Module 15 (reminders and offline) is merged into this branch and moved to SDK 57 with it:
- `app/(patient)/_layout.tsx` starts its reminders loop; `home.tsx` shows its `ReminderBanner` at the top.
- `src/platform.ts`: file functions now come from `expo-file-system/legacy` (moved in SDK 54), and the notification handler uses `shouldShowBanner`/`shouldShowList` (replaced `shouldShowAlert` in SDK 53). `expo-file-system` is `~57.0.7`.
- `query-string` was dropped: SDK 52's expo-router needed it, SDK 57's does not (the Android bundle builds without it).
- TypeScript 6 no longer loads every installed `@types` package, so `tsconfig.json` and `jest.config.js` now list `jest` (and `node`) under `types`; `ts-jest` is `^29.4.14`, which supports TypeScript 6.

Not touched otherwise: `src/cache.ts`, `src/reminders.ts`, `src/hub.ts`, `src/hubClient.ts`, `src/queue.ts` (patient caching lives in `src/patient/cached.ts`), `src/theme-context.tsx`, and `app/(caregiver)/*` (Module 16).


## Decisions made (confirm or change)

- **Expo SDK 57 and `expo-audio` instead of `expo-av`.** ARCHITECTURE.md names expo-av, which SDK 57 no longer includes. Expo Go on the Play Store only runs SDK 57, so staying on SDK 52 would have needed a custom dev build to test on a phone. expo-audio works in Expo Go.
- **The patient's `font_scale` drives the foundation theme.** Patient mode reads `/patient` (cached) and calls `setFontScale`, so every `useTheme()` size follows the caregiver's setting, also in demo mode.
- **The medication card has a third button, "Remind me later"** (15 minutes), next to "Nainom ko na / I took it" and "Skip". The patient is never pushed into an answer that may be untrue. The card asks "Did you take it?" and never says the app knows.
- **A dose shows on the card for 3 hours after its time.** Later than that, the caregiver dashboard follows up (overdue doses), not the patient's screen.
- **Simplified (caregiver-managed) mode** hides Games and shows 2 upcoming items and 2 familiar people instead of 3 and 4.
- **The first trivia check is 30 seconds after the app opens**, then every `trivia_frequency_min`. The hub still decides whether a prompt is allowed (quiet hours, appointments). The app also holds it back while a medication card or a game is on screen.
- **Games log one result per round** (changed when Memory Games was merged): `completed` when the patient reaches the end having answered something, `skipped` when every question was skipped, `stopped` when the patient leaves with Stop. Right or wrong is never sent, so the dashboard's played/skipped counts are per round. Feedback is encouraging both ways, and no score or count of right answers is ever shown.
- **Photo games show photo choices.** When a question's `choice_style` is `photo` (family matching), the choices are tappable photos, with the name as the screen-reader label.
- **Read-aloud** uses the phone's default voice for `fil-en`, `en-US` for `en`, and `fil-PH` for `fil` (phones without a Filipino voice use their default).
- **Once Patient is chosen, the app opens straight to the home screen.** A setup screen on every launch would confuse the patient.

## Not verified yet

Typecheck, the Android bundle, `expo-doctor` and the unit tests pass on SDK 57. The real-hub contract tests passed before the move onto the foundation; run them again against the hub. **Nobody has run it on a physical phone yet:**
- microphone recording and upload
- read-aloud voice
- the medication card as a full-screen card
- text size on a real screen

Do that before marking DONE. Voice also needs AST-5 on the hub; until then the demo answers a fixed question and says so.

## PAT-1

MODULE FROM: Patient App
Task: Home screen
Owner: N/A
Goal: Build `app/(patient)/home.tsx`: date and time, upcoming activities, familiar people, and large buttons to Ask, Schedule, People and Games.
Priority: P0
Dependencies: MOB-5, MOB-6, SCH-2, PPL-1
Acceptance Criteria:
- [x] Shows today's date, the time, and the next few scheduled items
- [x] Shows the patient's preferred name and a few familiar people
- [x] Every main area is one tap away
- [x] `managed_mode` shows a reduced set of options
Status: REVIEW

## PAT-2

MODULE FROM: Patient App
Task: Ask screen
Owner: N/A
Goal: Build `app/(patient)/ask.tsx`: type a question, send it to `/assistant/ask`, show the answer with photos of the people mentioned.
Priority: P0
Dependencies: MOB-5, MOB-6, AST-4
Acceptance Criteria:
- [x] A typed question shows the answer in large text with `PersonCard`s for returned people
- [x] A waiting state is shown while the hub answers
- [x] If the hub is unreachable, it shows "Can't reach the helper right now."
- [x] The `no_data` reply is shown as a normal, calm answer
Status: REVIEW (demo data until AST-4)

## PAT-3

MODULE FROM: Patient App
Task: Voice input and read-aloud
Owner: N/A
Goal: Fill in `src/voice/record.ts` (expo-av hold-to-talk, upload to `/assistant/voice`), `src/voice/speak.ts` (expo-speech) and the `MicButton` component, and add them to the Ask screen.
Priority: P1
Dependencies: PAT-2, AST-5
Acceptance Criteria:
- [x] Holding the mic records; releasing sends the audio and shows the transcript and answer
- [x] Answers are read aloud when `voice_enabled` is on, and speech can be stopped
- [x] "Sorry, I didn't catch that" appears with a text box when transcription fails
- [x] Microphone permission is requested with a plain explanation
Status: REVIEW (uses expo-audio; needs a test on a physical phone and AST-5)

## PAT-4

MODULE FROM: Patient App
Task: Schedule screen
Owner: N/A
Goal: Build `app/(patient)/schedule.tsx` listing today's items in time order.
Priority: P1
Dependencies: MOB-6, SCH-2
Acceptance Criteria:
- [x] Shows time, title, and the person or place for each item
- [x] Past, current and upcoming items are visually distinct (by label as well as color: "Earlier", "Now", "Later")
- [x] The list reads from the cache when the hub is unreachable (a saved list from another day is not shown as today's)
Status: REVIEW

## PAT-5

MODULE FROM: Patient App
Task: People directory
Owner: N/A
Goal: Build `app/(patient)/people.tsx` showing verified people with photo, name and relationship.
Priority: P1
Dependencies: MOB-5, MOB-6, PPL-2
Acceptance Criteria:
- [x] Shows a scrollable list or grid of `PersonCard`s
- [x] Tapping a person shows their details and related verified memories
- [x] Only verified people appear
Status: REVIEW (demo data until PPL-1/2 and MEM-1)

## PAT-6

MODULE FROM: Patient App
Task: Medication card
Owner: N/A
Goal: Show a large card for a due dose with name, dose, instructions and pill photo, with "Nainom ko na / I took it" and "Skip".
Priority: P1
Dependencies: MOB-6, MED-3
Acceptance Criteria:
- [x] The card appears for a dose that is due and unconfirmed
- [x] Each button posts the matching status and closes the card
- [x] The wording never claims the app knows the dose was taken
Status: REVIEW (checked against the real Medications endpoints)

## PAT-7

MODULE FROM: Patient App
Task: Games screens
Owner: N/A
Goal: Build `app/(patient)/games/`: a game list and one round player that works for every game type.
Priority: P1
Dependencies: MOB-5, MOB-6, GAM-2
Acceptance Criteria:
- [x] Skip and Stop are always visible
- [x] Feedback is encouraging for right and wrong answers, with no scores or grades shown
- [x] Each round posts its result to `/games/result`
- [x] A "not enough data" round shows a friendly message
Status: REVIEW (demo data until GAM-2/3)

## PAT-8

MODULE FROM: Patient App
Task: Trivia prompt card
Owner: N/A
Goal: Poll `GET /trivia/next` every `trivia_frequency_min` minutes while the app is open and show a small dismissible card.
Priority: P1
Dependencies: MOB-6, TRV-2
Acceptance Criteria:
- [x] The card can be answered, used to open related photos, or closed
- [x] The outcome is logged as `trivia_prompt`
- [x] No card appears while a medication card or a game is on screen
Status: REVIEW (demo data until TRV-2)
