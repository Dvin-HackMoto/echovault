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
