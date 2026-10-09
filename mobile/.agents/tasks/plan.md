# Implementation Plan — EchoVault Module 13 "Mobile Foundation" (MOB)

## Scope and ground rules

- ALL work happens in the worktree `/Users/lex/Hackathon_App_Builders/echovault/.worktrees/mobile-foundation`, and only under its `mobile/` subtree. Do NOT touch `backend/`.
- Preserve the existing folder layout under `mobile/app` and `mobile/src` exactly — do not move or rename any file. Every listed file currently is a one-line comment stub; fill them in.
- FOUNDATION ONLY. The real patient (Module 14) and caregiver (Module 16) screens are out of scope. Route-group screens are MINIMAL PLACEHOLDERS, clearly marked, that only have to let the route resolve and the app boot.
- Verification for every code item is `npx tsc --noEmit` from `mobile/` (after deps are installed in item 1). Grep is not verification.

## Design decisions (made here, grounded in the repo + docs)

- **Expo SDK.** Primary path: scaffold with `npx create-expo-app@latest` and resolve native deps with `npx expo install` so peer versions are always correct for whatever "latest stable" resolves to. The npm registry is reachable from this machine (verified), so this path should work. If scaffolding fails, FALL BACK to the hand-authored config pinned to **Expo SDK 52** (verified known-good: `expo ~52.0.0`, React Native `0.76.x`, React `18.3.1`). SDK 52 is chosen because the architecture mandates **expo-av** for recording, and expo-av is still bundled in SDK 52 (`~15.0.2`); it is removed in newer SDKs. Pinned fallback versions from the SDK 52 `bundledNativeModules.json` (verified):
  - `expo-router ~4.0.22`, `expo-av ~15.0.2`, `expo-speech ~13.0.1`, `expo-notifications ~0.29.14`, `@react-native-async-storage/async-storage 1.23.1`
  - supporting: `expo-status-bar ~2.0.1`, `expo-constants ~17.0.8`, `expo-linking ~7.0.5`, `expo-system-ui ~4.0.9`, `react-native-safe-area-context 4.12.0`, `react-native-screens ~4.4.0`, `react-native-gesture-handler ~2.20.2`
  - dev: `typescript ~5.3.3`, `@types/react ~18.3.x`
  - Whichever path is used, record the EXACT resolved versions in `.agents/tasks/plan.md` findings or a short note so later steps know what shipped.
- **Health check.** MOB-4 checks the hub `GET /health` endpoint before saving the IP (named in HUB-3 and the task). `/health` is not yet implemented backend-side; the mobile client calls it per the documented contract and treats any non-2xx or network failure as "unreachable."
- **Header contract (verified in `backend/app/middleware/dependencies.py`).** Every request sends `X-Role: patient|caregiver`; caregiver requests additionally send `X-Caregiver-Id`. The client reads role + caregiver id from AsyncStorage and attaches them automatically.
- **Backend endpoints that are REAL today (verified by reading routers):**
  - `GET /settings`, `PUT /settings` (settings/router.py)
  - `GET /patient`, `PUT /patient` (settings/router.py — profile lives here)
  - `GET /dashboard` (dashboard/router.py — returns full lists: `unverified_memories`, `conflicting_pairs`, `outdated_memories`, `medication_attention`, `flagged_answers`, `activity_summary`)
  - `GET /backup/export` (zip download), `POST /backup/import` (multipart: form field `file` = zip, form field `confirm` = `"true"`)
  - `auth/router.py` is still a stub, but `POST /auth/pin` and `GET /auth/me` are the documented contract; type `auth.ts` against that contract with a comment that the backend lands later.
  - People/memories/schedule/medications/assistant/games/trivia routers are stubs; type those `api/*.ts` files against the ARCHITECTURE-named routes with a one-line comment that they are wired to the documented contract pending their backend modules.
- **No DTOs backend-side.** Repositories return raw `dict(row)`. So `src/types.ts` mirrors the SQLite schema row shapes directly; API functions are typed with those row shapes.
- **Enum string unions** come verbatim from the schema CHECK constraints / `backend/app/constants.py` (verified): trust `verified|unverified|conflicting|outdated`, importance `critical|important|general`, category `identity|routine|history|preference|care_safety|engagement`, validity `persistent|scheduled|temporary|archived`, med status `unconfirmed|taken|skipped`, roles `patient|caregiver`, access levels `admin|editor|viewer`, languages `fil|en|fil-en`, schedule kind `appointment|routine|meal|visit|activity`, ack response `acknowledged|dismissed|snoozed`, trivia kind `general|personal|routine|family`, activity_log activity + outcome unions, assistant_log input_mode/answer_mode/source unions.
- **Cleartext HTTP on Android.** The hub is a plain LAN IP over HTTP with no internet, so enable cleartext in `app.json` Android config (`android.usesCleartextTraffic: true`).

---

# Implementation Plan

- [ ] 1. Scaffold a real, installable Expo project rooted at `mobile/` while preserving the existing `app/` and `src/` trees.
      Run `npx create-expo-app@latest` into a TEMP dir (e.g. `/tmp/ev-expo`) non-interactively with the TypeScript + expo-router template, then MERGE its generated config into `mobile/` WITHOUT overwriting any existing file under `mobile/app` or `mobile/src`: copy/merge `package.json` (name stays `echovault-mobile`, keep `"private": true`, take its `dependencies`/`devDependencies`/`scripts`/`main`/`expo` fields), `tsconfig.json`, `app.json`, `babel.config.js`, and metro config if present. Delete the template's own `app/` so the existing route tree is the only one. Then add the architecture-named libraries via `npx expo install expo-av expo-speech expo-notifications @react-native-async-storage/async-storage` so versions match the resolved SDK. If `create-expo-app` fails, hand-author `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, and `mobile/babel.config.js` pinned to the SDK 52 versions listed in Design decisions. In `app.json`, set `expo.scheme`, enable `expo-router` (plugins), set `expo.plugins` to include `expo-notifications` if required, and set `android.usesCleartextTraffic: true` (plus a network-security note comment) to allow plain `http://` LAN calls. Set `tsconfig.json` to extend `expo/tsconfig.base` with `strict: true` and a `@/*` path alias to `src/` if convenient (optional).
      Files: `mobile/package.json`, `mobile/tsconfig.json`, `mobile/app.json`, `mobile/babel.config.js` (+ metro config if scaffold emits one). No changes to existing `app/` or `src/` files in this item.
      Verify: `cd mobile && npm install` completes without peer-dependency errors; `npx tsc --noEmit` runs (type errors from the still-stub `.tsx`/`.ts` files are expected at this point and are resolved by later items — the gate here is that the toolchain, config, and `expo-env.d.ts`/router types resolve). Record the exact resolved versions of expo, react-native, react, expo-router, expo-av, expo-speech, expo-notifications, async-storage.

- [ ] 2. (MOB-3) Fill in `src/types.ts` with one exported type per table, mirroring the schema with exact enum string unions.
      Create exported interfaces/types for: `Patient`, `Caregiver`, `Settings` (plus a `SettingsValues` shape for the parsed `GET /settings` response: `game_topics: GameTopic[]`, `game_difficulty: 1|2|3`, `trivia_frequency_min: number`, `quiet_hours: {start:string; end:string}`), `Person`, `Place`, `Memory`, `ScheduleItem`, `ScheduleAck`, `Medication`, `MedicationTime`, `MedicationLog`, `TriviaQuestion`, `ActivityLog`, `AssistantLog`. Export the enum unions as named types: `Trust`, `Importance`, `Category`, `Validity`, `MedStatus`, `Role`, `AccessLevel`, `Language`, `ScheduleKind`, `AckResponse`, `TriviaKind`, `ActivityKind`, `ActivityOutcome`, `InputMode`, `AnswerMode`, `MemorySource`, `GameTopic`. Nullable schema columns are `field?: T | null`. Dashboard response rows reuse `Memory`/`MedicationLog` (with the joined `medication_name`/`medication_dose`) and `AssistantLog`.
      Files: `mobile/src/types.ts`
      Verify: `cd mobile && npx tsc --noEmit` — `types.ts` compiles with no errors (other stub files may still error until their items land).

- [ ] 3. (MOB-3) Fill in `src/theme.ts` with high-contrast, large-text tokens and `font_scale` scaling (schema default 1.4).
      Export a `theme` object with color tokens (high-contrast fg/bg, primary, danger, muted, card, border), base spacing scale, base font sizes, large touch-target sizes (min 56–64px per PRODUCT accessibility), and radii. Export a `scaleFont(base: number, fontScale: number)` helper and a `makeTheme(fontScale = 1.4)` (or `fontSizes(fontScale)`) that returns font sizes multiplied by `font_scale`, defaulting to 1.4 to match the `patient.font_scale` schema default. Keep it a plain module (no React dependency) so `src/api` and components can both import it.
      Files: `mobile/src/theme.ts`
      Verify: `cd mobile && npx tsc --noEmit` — `theme.ts` compiles.

- [ ] 4. (MOB-2) Fill in `src/api/client.ts`: typed fetch wrapper + hub/role storage helpers.
      Implement: AsyncStorage-backed getters/setters `getHubUrl()/setHubUrl(url)`, `getRole()/setRole(role)`, `getCaregiverId()/setCaregiverId(id)` under namespaced keys (e.g. `ev.hubUrl`, `ev.role`, `ev.caregiverId`). A single `request<T>(path, { method, body, headers, timeoutMs, isFormData })` that: resolves the saved base URL (throws a typed `ApiError` if unset), attaches `X-Role` always and `X-Caregiver-Id` when role is caregiver, sets JSON `Content-Type` for object bodies but LEAVES it unset for `FormData` (so RN sets the multipart boundary), uses `AbortController` with a default ~8s timeout, and normalizes ALL failures (network, timeout/abort, non-2xx) into one exported `ApiError` class carrying `{ status?: number; kind: 'network'|'timeout'|'http'|'config'; message: string }`. Add thin helpers `get<T>`, `put<T>`, `post<T>`, and `postForm<T>(path, formData)` plus a `uploadFile` convenience for photo/audio multipart (`FormData` with `{ uri, name, type }` parts, as RN expects). Export a `checkHealth(baseUrl)` that GETs `${baseUrl}/health` with a short timeout and returns boolean, used by MOB-4 before saving.
      Files: `mobile/src/api/client.ts`
      Verify: `cd mobile && npx tsc --noEmit` — `client.ts` compiles.

- [ ] 5. (MOB-4) Fill in `app/_layout.tsx` (expo-router root): Stack + theme provider.
      Implement the root layout as an expo-router `Stack` wrapped in a lightweight theme context/provider that loads `patient.font_scale` lazily (fallback 1.4) and exposes the scaled theme from `src/theme.ts` to children. Include `expo-status-bar`, `SafeAreaProvider`, and `GestureHandlerRootView` as the SDK template expects. Define the Stack with the three groups/screens: `index`, `(patient)`, `(caregiver)`. Keep it minimal — no feature logic.
      Files: `mobile/app/_layout.tsx`
      Verify: `cd mobile && npx tsc --noEmit` — compiles; `_layout.tsx` default-exports a component.

- [ ] 6. (MOB-4) Fill in `app/index.tsx`: first-launch hub IP entry + mode picker.
      On mount, read the saved hub URL. If unset (or user chooses to change it), show a text input for the hub IP/URL; on submit, normalize to `http://<ip>:<port>` (default port per README/architecture — assume 8000 if unspecified; document the assumption), call `checkHealth()` against `GET /health`, and only save via `setHubUrl` on success. On failure show a clear message distinguishing "wrong/unreachable IP" from a bad format. Once a hub URL exists, show the mode picker using `BigButton`: Patient → `setRole('patient')` then `router.replace('/(patient)/home')`; Caregiver → `setRole('caregiver')` then navigate to a PIN placeholder (route to `/(caregiver)/dashboard` is NOT correct yet; instead push an inline PIN placeholder screen or a `(caregiver)` entry that shows "PIN screen placeholder" — keep it a clearly-marked placeholder, Module 16 owns the real PIN flow). Provide an always-available "Change hub IP" affordance.
      Files: `mobile/app/index.tsx` (depends on items 4 and 7 — `client.ts` helpers and `BigButton`)
      Verify: `cd mobile && npx tsc --noEmit` — compiles.

- [ ] 7. (MOB-5) Fill in shared components `BigButton` and `PersonCard`, plus trivial `MicButton` and `ReminderBanner` stubs.
      `BigButton`: large touch target (min height from theme ~56–64px), readable themed label, optional `icon` prop and `onPress`, `disabled`/`variant` (primary/danger) support, honors font scale. `PersonCard`: shows photo (from a hub photo URL built off the saved base URL), name, relationship, and short notes; renders a placeholder block/initials when `photo_path` is null; typed with the `Person` row shape from `types.ts`. `MicButton` and `ReminderBanner`: minimal themed placeholder components with clearly-marked "placeholder — wired in Modules 14/16" comments, correct prop types so screens can import them. All four consume `src/theme.ts` and the font scale.
      Files: `mobile/src/components/BigButton.tsx`, `mobile/src/components/PersonCard.tsx`, `mobile/src/components/MicButton.tsx`, `mobile/src/components/ReminderBanner.tsx`
      Verify: `cd mobile && npx tsc --noEmit` — all four compile and export default components.

- [ ] 8. (MOB-6) Fill in the P0 feature API files typed against the REAL backend endpoints.
      `auth.ts`: `pinLogin(pin): Promise<{ id: string; access_level: AccessLevel }>` → `POST /auth/pin`; `me(): Promise<Caregiver | null>` → `GET /auth/me` (comment: backend auth router lands later). `settings.ts`: `getSettings(): Promise<SettingsValues>` → `GET /settings`; `updateSettings(partial): Promise<SettingsValues>` → `PUT /settings`; `getPatient(): Promise<Patient | {}>` → `GET /patient`; `updatePatient(partial): Promise<Patient>` → `PUT /patient`. `dashboard.ts`: `getDashboard(): Promise<DashboardResponse>` → `GET /dashboard`, with a `DashboardResponse` type matching the verified response keys (`unverified_memories`, `conflicting_pairs`, `outdated_memories`, `medication_attention`, `flagged_answers`, `activity_summary`). `backup.ts`: `exportBackup()` note that it returns a downloadable zip (document that file-save is a screen concern; expose a typed call that hits `GET /backup/export`); `importBackup(file, confirm=true)` → `POST /backup/import` as multipart form with fields `file` and `confirm`. All functions call `client` helpers, never `fetch` directly, and are typed with `src/types.ts` shapes.
      Files: `mobile/src/api/auth.ts`, `mobile/src/api/settings.ts`, `mobile/src/api/dashboard.ts`, `mobile/src/api/backup.ts`
      Verify: `cd mobile && npx tsc --noEmit` — all four compile.

- [ ] 9. (MOB-6) Fill in the remaining feature API files against ARCHITECTURE-named routes (backend modules pending).
      Each file: typed functions using `client` helpers, with a one-line comment noting it is wired to the documented ARCHITECTURE contract pending its backend module. `people.ts`: list/get/create/update/delete `/people`, `uploadPhoto(id, file)` → `POST /people/{id}/photo` (multipart). `memories.ts`: CRUD `/memories`, `verify(id)` → `POST /memories/{id}/verify`, list with `?trust=&category=` query. `schedule.ts`: CRUD `/schedule`, `today()` → `GET /schedule/today`, `next()` → `GET /schedule/next`, `ack(...)` → schedule_acks. `medications.ts`: CRUD `/medications`, `logStatus(id, status, confirmed_by)` → `POST /medications/logs/{id}`. `assistant.ts`: `ask(text)` → `POST /assistant/ask`, `voice(audioFile)` → `POST /assistant/voice` (multipart audio). `games.ts`: `round(type)` → `GET /games/{type}/round`, `result(...)` → `POST /games/result`. `trivia.ts`: `next()` → `GET /trivia/next`. All typed with `src/types.ts` row shapes; no direct `fetch`.
      Files: `mobile/src/api/people.ts`, `mobile/src/api/memories.ts`, `mobile/src/api/schedule.ts`, `mobile/src/api/medications.ts`, `mobile/src/api/assistant.ts`, `mobile/src/api/games.ts`, `mobile/src/api/trivia.ts`
      Verify: `cd mobile && npx tsc --noEmit` — all seven compile.

- [ ] 10. Fill in the remaining `src/` support modules: `cache.ts`, `reminders.ts`, `voice/record.ts`, `voice/speak.ts`.
      `cache.ts`: AsyncStorage read/write helpers for last-fetched schedule and people (typed get/set with JSON serialization), per ARCHITECTURE section 11 offline cache. `reminders.ts`: thin `expo-notifications` wrapper — request permissions, cancel all, schedule a local notification at `starts_at − remind_before_min`; keep it minimal/foundation-level and typed with `ScheduleItem`/medication shapes. `voice/record.ts`: `expo-av` audio recording start/stop returning a file URI (add a one-line comment: using expo-av per ARCHITECTURE even though newer SDKs favor expo-audio). `voice/speak.ts`: `expo-speech` `speak(text, options)` / `stop()` wrapper. These are foundation utilities, not full screens.
      Files: `mobile/src/cache.ts`, `mobile/src/reminders.ts`, `mobile/src/voice/record.ts`, `mobile/src/voice/speak.ts`
      Verify: `cd mobile && npx tsc --noEmit` — all compile.

- [ ] 11. Fill in MINIMAL PLACEHOLDER route-group screens so every route resolves and the app boots.
      Each screen is a small default-exported component that renders a themed "placeholder — built in Module 14/16" message using the theme + `BigButton` where a back/nav affordance helps. Do NOT implement real feature behavior. If expo-router needs group layout files for the route groups to resolve, add minimal `app/(patient)/_layout.tsx` and `app/(caregiver)/_layout.tsx` (Stack) — these are NEW files inside the existing groups, which is allowed (the layout preservation rule forbids moving/renaming existing files, not adding required router layouts). Patient group: `home.tsx`, `ask.tsx`, `schedule.tsx`, `people.tsx`, `games/index.tsx`. Caregiver group: `dashboard.tsx`, `memories/index.tsx`, `people.tsx`, `schedule.tsx`, `medications.tsx`, `activities.tsx`, `backup.tsx`.
      Files: all 12 existing screen stubs listed above, plus (if needed) `mobile/app/(patient)/_layout.tsx` and `mobile/app/(caregiver)/_layout.tsx`.
      Verify: `cd mobile && npx tsc --noEmit` passes with ZERO errors across the whole project (this is the final full-project type gate).

- [ ] 12. Final verification pass.
      From `mobile/`, run a clean install and the full type check; confirm the Expo project is internally consistent (expo-router types generated, no missing deps). Fix any remaining type or config errors.
      Files: none (or small fixes as surfaced).
      Verify: `cd mobile && npm install && npx tsc --noEmit` — exits 0 with no errors. Optionally `npx expo-doctor` if available to confirm dependency version alignment. Clean up any temp scaffold dir created in item 1.

## Notes / assumptions

- Hub default port assumed `8000` (uvicorn default used in architecture run command); the IP-entry screen accepts a full `host:port` so this is overridable.
- `GET /health` is assumed to return 2xx with a small JSON body; the client only checks status, so the exact body does not matter.
- `backup.ts` export is exposed as a typed API call; actually saving the downloaded zip to the phone is a screen-level concern deferred to Module 16.
- The implement-and-review loop runs this plan; the reviewer writes `.agents/tasks/review.json` with top-level `"verdict": "APPROVED"` or `"CHANGES_REQUESTED"`, and the loop stops only on `"APPROVED"`.
