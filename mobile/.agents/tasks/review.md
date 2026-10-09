# Expo mobile foundation for EchoVault (Module 13)

Module 13 turns the empty `mobile/` stub tree into a real, installable Expo SDK 52 project and fills in the shared pieces both the patient and caregiver apps will build on: a typed hub API client, row types mirroring the hub schema, an accessibility-first theme, the first-run hub-connection + mode-picker flow, two shared components, and one typed API file per backend feature. Everything the task asked for is present and internally consistent. The feature API files split cleanly into those typed against endpoints that exist today (settings, patient, dashboard, backup) and those typed against the documented ARCHITECTURE contract for backend modules that are still stubs — each of the latter carries an inline "pending its backend module" note. Route-group screens are deliberately minimal placeholders so both groups resolve and the app boots.

Watch for: the caregiver mode routes straight to `(caregiver)/dashboard`, which is itself the clearly-marked PIN placeholder rather than a dedicated `pin` route — this matches the plan but is worth knowing (confirmed). The `/health`, auth, and most feature endpoints are typed against contracts the backend has not implemented yet, so those calls will fail until later modules land — this is expected and documented (confirmed). On-device boot is not verified and cannot be in a headless environment (confirmed, expected).

**Verdict**: APPROVED

## High-level view

The project is a hand-authored SDK 52 config (the `create-expo-app` scaffold timed out, so the plan's documented fallback was used). Dependency versions are mutually compatible for SDK 52 — expo-router 4, expo-av 15, expo-speech 13, expo-notifications 0.29, AsyncStorage 1.23 — and `expo-av` is pinned deliberately because it is the last SDK bundling it before `expo-audio`. Verification evidence records a clean `npm install` (exit 0), a clean `npx tsc --noEmit` (exit 0, zero errors), and `expo-doctor` 18/18. Per the task I did not re-run install or typecheck; the evidence is present and passing.

Android cleartext HTTP to a plain LAN IP is enabled through the `expo-build-properties` plugin (`android.usesCleartextTraffic: true`), not the invalid top-level `android` schema key that expo-doctor rejected — the correct supported mechanism. iOS gets `NSAllowsArbitraryLoads` for LAN parity.

The API client is the spine: it reads the saved hub URL from AsyncStorage, attaches `X-Role` on every request and `X-Caregiver-Id` for caregivers (matching the backend middleware exactly), normalizes every failure — missing config, network, timeout via `AbortController`, non-2xx — into one `ApiError` with a `kind` discriminant, leaves `Content-Type` unset for `FormData` so React Native sets the multipart boundary, and exposes a `checkHealth` probe plus `uploadFile` for photo/audio. Every feature file routes through it; no screen calls `fetch` directly.

Types mirror the SQLite schema row shapes directly (there are no backend DTOs) with the enum string unions copied verbatim from the CHECK constraints. The theme carries high-contrast tokens with documented WCAG AA contrast ratios, large touch targets, and `font_scale` scaling defaulting to 1.4; the React-free `theme.ts` plus a `theme-context.tsx` provider that lazily loads `patient.font_scale` keeps the token module importable from `src/api`.

The first-run flow asks for the hub IP, normalizes bare `host`/`host:port` input to `http://host:port` (default port 8000), checks it against `GET /health` before saving, and shows distinct messages for bad format vs unreachable. Patient opens the `(patient)` group directly; Caregiver lands on the PIN placeholder. "Change hub IP" is always available.

The existing `mobile/app` and `mobile/src` layout is preserved exactly — the diff shows zero renames or deletes. The four added files under those trees (two route-group `_layout.tsx`, `Placeholder.tsx`, `theme-context.tsx`) are the ones the plan explicitly sanctions.

<details>
<summary>Issues (4)</summary>

1. **Caregiver PIN is the dashboard route, not a `pin` screen** — `(caregiver)/dashboard.tsx` is the clearly-marked PIN placeholder and the mode picker routes there; matches the plan, but Module 16 should introduce a real `pin` route rather than overload `dashboard`. Non-blocking.
2. **Pending-backend endpoints will 404 until their modules land** — `/health`, `/auth/*`, people/memories/schedule/medications/assistant/games/trivia are typed against the documented contract only. Expected and noted inline; no action for Module 13.
3. **`checkHealth` omits `X-Role`** — the pre-save health probe sends no role header, so if `/health` is later placed behind the role middleware the probe would 403. Worth a glance when HUB-3 `/health` lands. Non-blocking.
4. **On-device boot unverified** — `npx expo start` on a physical Android device is not and cannot be verified headless. MOB-1's device box is honestly left unchecked with a note; do not treat as a defect.

</details>

<details>
<summary>Details</summary>

### Project is installable and the version set is coherent (MOB-1)

`package.json` pins SDK 52 (`expo ~52.0.0`, `react-native 0.76.9`, `react 18.3.1`) with expo-router 4, expo-av 15, expo-speech 13, expo-notifications 0.29, AsyncStorage 1.23, plus the supporting `expo-constants`/`expo-linking`/`expo-status-bar`/`expo-system-ui` and the three gesture/screens/safe-area natives at their SDK-52 versions. `main` is `expo-router/entry`; scripts include `start`, `android`, `ios`, `web`. `tsconfig.json` extends `expo/tsconfig.base`, sets `strict`, and maps `@/*` to `src/*`. `babel.config.js` uses `babel-preset-expo`. verification.md records `npm install` exit 0, `npx tsc --noEmit` exit 0 with zero errors, and expo-doctor 18/18 — the install/typecheck evidence the task says to trust rather than re-run. The one first-run type error (`resizeMode` on a `View` style) was fixed by moving it to the `Image` prop, which matches the shipped `PersonCard.tsx`.

`expo-av` is deliberately pinned and excluded from the React Native Directory doctor check with an inline comment, because it is the recording library ARCHITECTURE mandates and the last SDK to bundle it.

### Android cleartext via the supported plugin

Cleartext HTTP to a plain LAN IP is enabled through `expo-build-properties` (`android.usesCleartextTraffic: true`) rather than a top-level `android.usesCleartextTraffic` key — the latter is not a valid Expo config field and expo-doctor rejected it. Using the build-properties plugin is the correct mechanism and is what lets the app reach `http://<lan-ip>:8000`. iOS mirrors this with `NSAllowsArbitraryLoads`.

### API client: one error type, role headers, multipart (MOB-2)

`client.ts` resolves the saved base URL from AsyncStorage (throwing a `config` `ApiError` when unset), attaches `Accept` plus `X-Role` on every request and `X-Caregiver-Id` only for caregivers — which lines up exactly with `backend/app/middleware/dependencies.py` (403 on missing/unknown role, 403 when a caregiver omits the id). Failures collapse into a single `ApiError` carrying `kind: 'config'|'network'|'timeout'|'http'` and an optional `status`, with the `AbortController` timeout mapped to `timeout`. For `FormData` bodies it leaves `Content-Type` unset so React Native injects the multipart boundary, and `uploadFile`/`postForm` cover the photo and audio uploads MOB-2 asks for.

`checkHealth` is a separate short-timeout probe that returns a boolean and swallows errors, used before saving the hub URL. It does not send `X-Role`. That is fine today because `/health` is unauthenticated by design, but if `/health` later moves behind the role middleware the probe would 403 and read as "unreachable". Worth a glance when HUB-3 lands; not a Module 13 blocker.

### Types mirror the schema, enums verbatim (MOB-3)

`types.ts` has a type per table — `Patient`, `Caregiver`, `Settings`/`SettingsValues`, `Person`, `Place`, `Memory`, `ScheduleItem`, `ScheduleAck`, `Medication`, `MedicationTime`, `MedicationLog` (plus `MedicationLogWithMed` for the dashboard join), `TriviaQuestion`, `ActivityLog`, `AssistantLog` — with SQLite integer booleans modelled as `number` and nullable columns as `T | null`. The enum unions (`Trust`, `Importance`, `Category`, `Validity`, `MedStatus`, `Role`, `AccessLevel`, `Language`, `ScheduleKind`, `AckResponse`, `TriviaKind`, `MemorySource`, activity/assistant unions, `GameTopic`, `Difficulty` as `1|2|3`) read as the exact string sets the plan quotes from the schema CHECK constraints.

### Theme: contrast, touch targets, font scale (MOB-3)

`theme.ts` is React-free so both `src/api` and components can import it. It documents its fg/bg pairs against WCAG AA 4.5:1 (≈17.4:1 for body text, ≈7:1 for the primary/danger buttons) while correctly noting full conformance needs manual assistive-tech testing. Touch targets start at 56px, and `fontSizes()`/`makeTheme()` scale every base size by `font_scale`, defaulting to the schema's 1.4. `theme-context.tsx` lazily loads the real `patient.font_scale` and falls back to 1.4 when the hub is unset or unreachable, swallowing `ApiError` so the default theme always renders.

### First-run hub entry and mode picker (MOB-4)

`app/index.tsx` reads the saved hub URL on mount and branches to setup or the picker. `normalizeHubInput` accepts a bare IP, `ip:port`, or a full URL and normalizes to `http://host:port` (default 8000, documented), returning null on garbage so the user gets a format-specific message distinct from the "couldn't reach the hub" message shown when `checkHealth` fails. The URL is saved only after a successful health check. Patient routes to `(patient)/home`; Caregiver sets the role and routes to the caregiver PIN placeholder. "Change hub IP" is always present. The caregiver entry is `(caregiver)/dashboard` rather than a dedicated `pin` route — the plan sanctions this and the screen is explicitly labelled a PIN placeholder, but Module 16 should give the PIN flow its own route rather than overloading `dashboard`.

`app/_layout.tsx` wraps the Stack in `GestureHandlerRootView`, `SafeAreaProvider`, and the theme provider, and declares `index`, `(patient)`, `(caregiver)`. The two new group `_layout.tsx` files are minimal Stacks so the groups resolve — additions the layout-preservation rule permits.

### Shared components honor theme + scale (MOB-5)

`BigButton` is a themed `Pressable` with a 64px comfortable target, optional icon, `disabled`/`loading`/`variant`, accessibility role/state, and label sized from the scaled theme. `PersonCard` renders name/relationship/notes and either the hub-hosted photo (built from the saved base URL + stored `photo_path`) or an initials-on-primary placeholder avatar when there is none. `resizeMode` sits on the `Image` prop (the fix from the first typecheck run), so the earlier type error is resolved in the shipped code.

### Feature API files split by backend readiness (MOB-6)

The files typed against endpoints that exist today match the routers I checked: `settings.ts` (`GET`/`PUT /settings`, `GET`/`PUT /patient`), `dashboard.ts` (`GET /dashboard` with the six verified keys and an `ActivitySummaryRow` that deliberately carries played/skipped counts and no score, honoring the engagement-only product constraint), and `backup.ts` — which correctly treats export as a binary zip by exposing `exportBackupUrl()` for a screen to stream rather than parsing JSON, and posts import as multipart with `file` + `confirm="true"`, exactly what `backend/app/features/backup/router.py` requires (it rejects anything but `confirm=="true"` with a 400). `auth.ts` and the remaining feature files (`people`, `memories`, `schedule`, `medications`, `assistant`, `games`, `trivia`) are typed against the ARCHITECTURE-named routes with the "pending its backend module" note. Every function goes through the client helpers; no file calls `fetch` directly. The support utilities (`cache.ts`, `reminders.ts`, `voice/record.ts`, `voice/speak.ts`) are thin, typed, foundation-level wrappers as scoped.

### Placeholder screens and layout preservation

Every `(patient)` and `(caregiver)` screen renders the shared `Placeholder` with a module attribution, so both groups resolve and the app boots without any feature logic. The diff shows zero renames and zero deletes under `mobile/app` and `mobile/src`; the only additions there are the two group layouts, `Placeholder.tsx`, and `theme-context.tsx` — all plan-sanctioned. The DELEGATION checkboxes are honest: MOB-1's on-device `npx expo start` box is left unchecked with a note explaining the headless limitation, the install/typecheck boxes are checked, and Status is DONE.

### Test coverage

There are no automated tests, which is acceptable for a foundation module whose verification gate is `tsc --noEmit` + expo-doctor; the plan defines that as the gate and the evidence shows it passing. Not tested: on-device boot and Metro bundling (headless-impossible, honestly declared), and any live request against the hub (the real endpoints beyond settings/dashboard/backup don't exist yet). These are expected gaps for Module 13, not defects.

</details>

<details>
<summary>File map</summary>

- `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/babel.config.js` — SDK 52 config, cleartext via build-properties, expo-router entry
- `mobile/src/api/client.ts` — typed fetch wrapper, role headers, `ApiError`, multipart, `checkHealth`
- `mobile/src/types.ts` — per-table row shapes + enum unions
- `mobile/src/theme.ts`, `mobile/src/theme-context.tsx` — tokens + font-scale provider
- `mobile/app/_layout.tsx`, `mobile/app/index.tsx` — root layout, hub entry + mode picker
- `mobile/src/components/BigButton.tsx`, `PersonCard.tsx`, `Placeholder.tsx`, `MicButton.tsx`, `ReminderBanner.tsx` — shared UI
- `mobile/src/api/{settings,dashboard,backup}.ts` — real backend contracts
- `mobile/src/api/{auth,people,memories,schedule,medications,assistant,games,trivia}.ts` — ARCHITECTURE contracts, pending backend
- `mobile/src/{cache,reminders}.ts`, `mobile/src/voice/{record,speak}.ts` — foundation utilities
- `mobile/app/(patient)/*`, `mobile/app/(caregiver)/*` — placeholder screens + group layouts
- `mobile/verification.md` — install/typecheck/doctor evidence

Full diff: `git diff main` in the `mobile-foundation` worktree.

</details>
