# MODULE: Mobile Foundation

Owner: TBD

Goal:
Get the Expo app running on Android, connected to the hub, with the shared pieces both modes need.

Features:
- Expo project and navigation
- Hub connection setup
- Mode picker
- API client
- Theme and shared components

Tasks:
- [ ] MOB-1 Expo project setup
- [ ] MOB-2 API client and hub address
- [ ] MOB-3 Types and theme
- [ ] MOB-4 Mode picker and root layout
- [ ] MOB-5 Shared components
- [ ] MOB-6 Feature API files

Dependencies:
- Hub Foundation

Definition of Done:
- The app installs and opens on an Android phone
- After entering the hub IP once, the app reaches the hub on later launches
- Picking a mode opens the right set of screens

## MOB-1

MODULE FROM: Mobile Foundation
Task: Expo project setup
Owner: N/A
Goal: Turn `mobile/` into a working Expo project with expo-router, TypeScript, and the libraries the architecture names (expo-av, expo-speech, notifications, AsyncStorage).
Priority: P0
Dependencies: None
Acceptance Criteria:
- [ ] `npx expo start` runs and the app opens on an Android phone
- [ ] The existing folder layout in `mobile/app` and `mobile/src` is kept
- [ ] The app is allowed to call a plain `http://` LAN address on Android
Status: TODO

## MOB-2

MODULE FROM: Mobile Foundation
Task: API client and hub address
Owner: N/A
Goal: Fill in `src/api/client.ts`: a fetch wrapper using the saved hub base URL and sending `X-Role` and `X-Caregiver-Id`.
Priority: P0
Dependencies: MOB-1, HUB-3
Acceptance Criteria:
- [ ] The hub address is saved on the phone and reused on the next launch
- [ ] Every request carries the current role header
- [ ] A network failure or timeout surfaces as one error type screens can handle
- [ ] File uploads (photo, audio) are supported
Status: TODO

## MOB-3

MODULE FROM: Mobile Foundation
Task: Types and theme
Owner: N/A
Goal: Fill in `src/types.ts` (row shapes mirroring the database) and `src/theme.ts` (large text, high contrast, scaled by `font_scale`).
Priority: P0
Dependencies: MOB-1
Acceptance Criteria:
- [ ] There is a type for every table the app reads
- [ ] Text sizes scale with the patient's `font_scale`
- [ ] Text and background colors meet high-contrast needs
Status: TODO

## MOB-4

MODULE FROM: Mobile Foundation
Task: Mode picker and root layout
Owner: N/A
Goal: Fill in `app/_layout.tsx` and `app/index.tsx`: ask for the hub IP on first run, then show Patient or Caregiver.
Priority: P0
Dependencies: MOB-2
Acceptance Criteria:
- [ ] First launch asks for the hub IP and checks it against the hub's health endpoint
- [ ] Patient opens directly; Caregiver goes to the PIN screen
- [ ] The hub IP can be changed later
- [ ] A wrong or unreachable IP shows a clear message
Status: TODO

## MOB-5

MODULE FROM: Mobile Foundation
Task: Shared components
Owner: N/A
Goal: Build `BigButton` and `PersonCard` in `src/components/`.
Priority: P0
Dependencies: MOB-3
Acceptance Criteria:
- [ ] `BigButton` has a large touch target, a readable label and an optional icon
- [ ] `PersonCard` shows photo, name, relationship and short notes, with a placeholder when there is no photo
- [ ] Both follow the theme and font scale
Status: TODO

## MOB-6

MODULE FROM: Mobile Foundation
Task: Feature API files
Owner: N/A
Goal: Fill in one file per feature in `src/api/` with typed functions for that feature's endpoints.
Priority: P0
Dependencies: MOB-2, MOB-3
Acceptance Criteria:
- [ ] `people.ts`, `memories.ts`, `schedule.ts`, `medications.ts`, `assistant.ts` and `auth.ts` cover the P0 endpoints
- [ ] The remaining files are filled in as their backend endpoints land
- [ ] Screens call these functions and never call `fetch` directly
Status: TODO
