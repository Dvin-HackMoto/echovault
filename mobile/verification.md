# Module 13 "Mobile Foundation" — Verification

This records the verification run for the EchoVault mobile foundation. The
reviewer reads this file instead of re-running the suite, so the evidence below
is complete and honest about what could and could not be checked in a headless
environment.

## Environment

- Node: `v24.14.1`
- npm: `11.11.0`
- OS: macOS (darwin)
- Worktree: `.worktrees/mobile-foundation`, app under `mobile/`

## Expo project setup (MOB-1)

`npx create-expo-app@latest` was attempted first (the plan's primary path) but
timed out in this environment before producing any files, so the plan's
documented FALLBACK was used: a hand-authored config pinned to **Expo SDK 52**
(React Native 0.76, React 18.3.1). SDK 52 is chosen because ARCHITECTURE
mandates **expo-av** for recording and expo-av is still bundled in SDK 52
(removed in newer SDKs). Exact resolved dependency versions (from the installed
`node_modules`):

| Package | Resolved version |
|---|---|
| expo | 52.0.49 |
| react | 18.3.1 |
| react-native | 0.76.9 |
| expo-router | 4.0.22 |
| expo-av | 15.0.2 |
| expo-speech | 13.0.1 |
| expo-notifications | 0.29.14 |
| @react-native-async-storage/async-storage | 1.23.1 |
| expo-constants | 17.0.8 |
| expo-linking | 7.0.5 |
| expo-status-bar | 2.0.1 |
| expo-system-ui | 4.0.9 |
| expo-build-properties | 0.13.1 |
| react-native-screens | 4.4.0 |
| react-native-safe-area-context | 4.12.0 |
| react-native-gesture-handler | 2.20.2 |
| typescript | 5.3.3 |

Config coherence:

- `package.json` `main` is `expo-router/entry` (expo-router entry set); scripts
  include `start`, `android`, `ios`, `web`.
- `tsconfig.json` extends `expo/tsconfig.base`, `strict: true`, `@/*` → `src/*`.
- `babel.config.js` uses `babel-preset-expo`.
- `app.json` enables expo-router + typed routes, declares the `expo-av`,
  `expo-notifications`, and `expo-build-properties` plugins.
- **Android cleartext HTTP** to a plain LAN IP is enabled via the
  `expo-build-properties` plugin (`android.usesCleartextTraffic: true`). NOTE:
  the earlier `android.usesCleartextTraffic` top-level key is NOT a valid Expo
  config field (expo-doctor rejected it); the build-properties plugin is the
  correct supported mechanism, so cleartext is set there. iOS gets
  `NSAllowsArbitraryLoads` in `infoPlist` for parity on the LAN.
- The existing `mobile/app` and `mobile/src` folder layout was preserved
  exactly — no file was moved or renamed. New files added are the ones the
  plan explicitly allows: config files, the two route-group `_layout.tsx`
  files, a React-free-safe `src/theme-context.tsx`, and a shared
  `src/components/Placeholder.tsx`.

## `npm install`

Ran `rm -rf node_modules package-lock.json && npm install` from `mobile/`.
Result (verbatim tail; deprecation warnings are from transitive deps and do not
fail the install):

```
added 945 packages, and audited 946 packages in 52s

99 packages are looking for funding
  run `npm fund` for details

57 vulnerabilities (20 moderate, 36 high, 1 critical)
To address issues that do not require attention, run:
  npm audit fix
To address all issues (including breaking changes), run:
  npm audit fix --force
Run `npm audit` for details.
```

Exit code: **0** (success). A follow-up `npm install` after adding
`expo-build-properties` also exited 0. The reported npm-audit vulnerabilities
are in the transitive dependency tree of the Expo/React Native toolchain
(unchanged from a stock scaffold) and do not affect install success or the
type check.

## `npx tsc --noEmit`

Ran from `mobile/` after install. Output (verbatim):

```
(no output)
TSC_EXIT=0
```

Exit code: **0** — the whole project type-checks with **zero** type errors.
One error surfaced on the first run (`resizeMode` passed as a `View` style in
`PersonCard.tsx`); it was fixed by moving `resizeMode` to the `Image` prop, and
the re-run is clean.

## `npx expo-doctor`

Ran from `mobile/`:

```
Running 18 checks on your project...
18/18 checks passed. No issues detected!
```

Two findings on the first run were resolved:
1. Invalid `android.usesCleartextTraffic` schema field → moved into the
   `expo-build-properties` plugin (the supported mechanism).
2. `expo-av` flagged "unmaintained" → this is intentional per ARCHITECTURE
   (recording uses expo-av; expo-audio only exists in newer SDKs). It is
   excluded from the React Native Directory check via
   `expo.doctor.reactNativeDirectoryCheck.exclude` in `package.json`, with a
   comment explaining why.

## Device boot — NOT verified here (left for the human)

**`npx expo start` opening on an Android phone CANNOT be verified in this
headless environment.** Running the Metro bundler and loading the app in Expo
Go / a dev build requires a physical Android device (or emulator) on the same
LAN as the hub, which is not available here. This step is left for lex to
confirm on-device. No on-device success is claimed and no device test was
fabricated.

What *is* verified gives high confidence the app is installable and
type-correct: dependencies install cleanly, versions are mutually compatible
for SDK 52 (expo-doctor 18/18), the whole TypeScript project compiles, the
expo-router entry/typed-routes config is coherent, and the Android cleartext
setting is present via the correct plugin so the app can call a plain
`http://<lan-ip>:<port>` hub.

## Assumptions recorded

- Hub default port is assumed **8000** (uvicorn default from ARCHITECTURE §1).
  The hub-IP entry field accepts a full `host:port`, so this is overridable.
- `GET /health` is the documented HUB-3 health path; it is not implemented
  backend-side yet, so the client treats any non-2xx/network failure as
  "unreachable". The exact response body is not inspected (status only).
- Feature API files for backend modules that are still stubs (people, memories,
  schedule, medications, assistant, games, trivia, and the auth router) are
  typed against the ARCHITECTURE-named routes and carry an inline comment that
  they are wired to the documented contract pending their backend modules.

## Upgrade to Expo SDK 57 (Module 14)

The foundation above was pinned to SDK 52 for expo-av. The Expo Go app on the
Play Store only runs the current SDK (57), so SDK 52 could not be opened on a
phone without a custom dev build. Module 14 upgraded the foundation:

- `npx expo install --fix` picked the SDK 57 version of every package; the
  install itself was finished by hand (clean `node_modules` + `npm install`).
- **expo-av → expo-audio.** expo-av is not part of SDK 57; its replacement,
  expo-audio, records in Expo Go. `src/voice/record.ts` now exposes
  `useHoldToTalk()` (start on press-in, stop on release returns an
  `UploadFile` for `askVoice`). `app.json` declares the `expo-audio` plugin
  with the same microphone text; the `expo.doctor` exclude for expo-av is gone.
- `newArchEnabled` was removed from `app.json` (the new architecture is the
  only one in SDK 57, and expo-doctor rejects the key).
- `expo-asset` added (a required peer of expo-audio / expo-router).
- `react-dom` + `react-native-web` added so `npm run web` can preview screens.

Resolved versions (Node v24.13.1, npm 11.8.0, Windows 11):

| Package | Resolved version |
|---|---|
| expo | 57.0.27 |
| react | 19.2.3 |
| react-native | 0.86.3 |
| expo-router | 57.0.25 |
| expo-audio | 57.0.5 |
| expo-speech | 57.0.3 |
| expo-notifications | 57.0.22 |
| @react-native-async-storage/async-storage | 2.2.0 |
| expo-asset | 57.0.19 |
| react-native-screens | 4.26.2 |
| react-native-safe-area-context | 5.7.0 |
| react-native-gesture-handler | 2.32.0 |
| typescript | 6.0.3 |

Checks after the upgrade and the Module 14 screens:

- `npx expo install --check` → "Dependencies are up to date".
- `npx expo-doctor` → 21/21 checks passed.
- `npx tsc --noEmit` → no output, exit 0 (with typed routes generated in
  `.expo/types`).
- `npx expo export --platform android` → bundle built (4 MB Hermes bytecode).
- `npm run test:patient` → 21 passed, 5 skipped (the hub contract tests run
  only with `HUB_URL` set).

`checkHealth` now reads `GET /openapi.json` first (every FastAPI app serves
it, and the client uses the route list to decide real vs demo data) and falls
back to `GET /health`.

---

# Module 16 "Caregiver App" — FEAT-005 Verification (CGV-7 Activities + CGV-8 Backup)

This records the build-gate run for FEAT-005 (the final caregiver FEAT):
`app/(caregiver)/activities.tsx` (settings REAL + history placeholder) and
`app/(caregiver)/backup.tsx` (export/import REAL). It also carries the honest
live-vs-stub split for the whole caregiver app.

## Environment

- Node: `v24.14.1`
- npm: `11.11.0`
- OS: macOS (darwin)
- Worktree: `.worktrees/caregiver-app`, app under `mobile/`, branch
  `feature/caregiver-app`

## Native packages installed (CGV-8)

Installed with `npx expo install expo-file-system expo-sharing
expo-document-picker` (NOT plain `npm i`) so SDK-52-compatible versions are
resolved. Versions landed in `package.json`:

| Package | Resolved version |
|---|---|
| expo-file-system | ~18.0.12 |
| expo-sharing | ~13.0.1 |
| expo-document-picker | ~13.0.3 |

- Export streams the zip to the app document directory with
  `FileSystem.downloadAsync` then offers it via `Sharing.isAvailableAsync()` +
  `Sharing.shareAsync(uri)`.
- Import picks a `.zip` with `DocumentPicker.getDocumentAsync({ type:
  "application/zip" })`, shows an explicit "data will be REPLACED" `Alert`, and
  uploads via `importBackup(file, true)` (POST `/backup/import`).
- Import is admin-gated: `auth.me()` is read for `access_level === "admin"`;
  non-admin (or a 404 while auth is a stub, or a 403 from the server) disables
  the control and shows "needs an admin caregiver".

## Build gate

### `npm install`

Ran from `mobile/`. Exit code: **0** (success). Tail:

```
To address all issues (including breaking changes), run:
  npm audit fix --force
Run `npm audit` for details.
```

The npm-audit vulnerabilities are in the Expo/React Native transitive toolchain
(unchanged from the scaffold) and do not affect install success or the type
check.

### `npx tsc --noEmit`

Ran from `mobile/` after install. Output: **(no output)**, exit code **0** —
the whole project, including the two rebuilt screens, type-checks with **zero**
errors (pinned typescript ~5.3.3).

### `grep -rn 'fetch(' app`

Returned **no output** (grep exit 1 = no match). No screen under `app/` performs
a raw fetch; all network I/O goes through `src/api/*`. Activities uses
`getSettings`/`updateSettings`; Backup uses `exportBackupUrl`/`importBackup` and
`auth.me()`.

## Live-vs-stub split (whole caregiver app)

| Screen | Endpoint(s) | Status |
|---|---|---|
| Dashboard | GET `/dashboard` | **LIVE** |
| Activities — settings | GET/PUT `/settings` | **LIVE** |
| Activities — history | (none — Games module GAM-* owns it) | **STUB** — labeled placeholder, UI complete |
| Backup — export | GET `/backup/export` | **LIVE** |
| Backup — import | POST `/backup/import` | **LIVE** (admin-gated) |
| PIN / auth | POST `/auth/pin`, GET `/auth/me` | **STUB (404)** until Auth module (AUTH-2); UI complete |
| Memories | memories routes | **STUB (404)**; UI complete |
| People | people routes | **STUB (404)**; UI complete |
| Schedule | schedule routes | **STUB (404)**; UI complete |
| Medications | medication routes | **STUB (404)**; UI complete |

## No-clinical-score constraint (CGV-7)

The Activities screen states plainly that activities support engagement and are
NOT a clinical assessment or test, and it shows **no scores, grades, percentages
or accuracy** anywhere. The history placeholder reiterates that, when wired, it
will show engagement (played/skipped, topics) only.

## NOT verified here (left for the human)

- On-device Expo Go boot and interaction CANNOT be verified headlessly (needs a
  physical Android device/emulator on the hub's LAN). No on-device success is
  claimed.
- Live calls against the STUB modules (auth, memories, people, schedule,
  medications, and the Games activity-history endpoint) were NOT run — those
  routes 404 until their backend modules land. Dashboard, Settings and Backup
  are the only endpoints backed by a real module on `main`; their live request
  behavior was not exercised headlessly either, only type-checked and gated.
