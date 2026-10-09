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
- [ ] PAT-1 Home screen
- [ ] PAT-2 Ask screen
- [ ] PAT-3 Voice input and read-aloud
- [ ] PAT-4 Schedule screen
- [ ] PAT-5 People directory
- [ ] PAT-6 Medication card
- [ ] PAT-7 Games screens
- [ ] PAT-8 Trivia prompt card

Dependencies:
- Mobile Foundation
- Assistant
- Schedule
- People and Places
- Medications
- Memory Games
- Trivia and Memory Prompts

Definition of Done:
- The patient can open the app, see today, ask a question and get an answer with photos
- Every screen is usable with large text and few taps
- Nothing in patient mode can edit records

## PAT-1

MODULE FROM: Patient App
Task: Home screen
Owner: N/A
Goal: Build `app/(patient)/home.tsx`: date and time, upcoming activities, familiar people, and large buttons to Ask, Schedule, People and Games.
Priority: P0
Dependencies: MOB-5, MOB-6, SCH-2, PPL-1
Acceptance Criteria:
- [ ] Shows today's date, the time, and the next few scheduled items
- [ ] Shows the patient's preferred name and a few familiar people
- [ ] Every main area is one tap away
- [ ] `managed_mode` shows a reduced set of options
Status: TODO

## PAT-2

MODULE FROM: Patient App
Task: Ask screen
Owner: N/A
Goal: Build `app/(patient)/ask.tsx`: type a question, send it to `/assistant/ask`, show the answer with photos of the people mentioned.
Priority: P0
Dependencies: MOB-5, MOB-6, AST-4
Acceptance Criteria:
- [ ] A typed question shows the answer in large text with `PersonCard`s for returned people
- [ ] A waiting state is shown while the hub answers
- [ ] If the hub is unreachable, it shows "Can't reach the helper right now."
- [ ] The `no_data` reply is shown as a normal, calm answer
Status: TODO

## PAT-3

MODULE FROM: Patient App
Task: Voice input and read-aloud
Owner: N/A
Goal: Fill in `src/voice/record.ts` (expo-av hold-to-talk, upload to `/assistant/voice`), `src/voice/speak.ts` (expo-speech) and the `MicButton` component, and add them to the Ask screen.
Priority: P1
Dependencies: PAT-2, AST-5
Acceptance Criteria:
- [ ] Holding the mic records; releasing sends the audio and shows the transcript and answer
- [ ] Answers are read aloud when `voice_enabled` is on, and speech can be stopped
- [ ] "Sorry, I didn't catch that" appears with a text box when transcription fails
- [ ] Microphone permission is requested with a plain explanation
Status: TODO

## PAT-4

MODULE FROM: Patient App
Task: Schedule screen
Owner: N/A
Goal: Build `app/(patient)/schedule.tsx` listing today's items in time order.
Priority: P1
Dependencies: MOB-6, SCH-2
Acceptance Criteria:
- [ ] Shows time, title, and the person or place for each item
- [ ] Past, current and upcoming items are visually distinct
- [ ] The list reads from the cache when the hub is unreachable
Status: TODO

## PAT-5

MODULE FROM: Patient App
Task: People directory
Owner: N/A
Goal: Build `app/(patient)/people.tsx` showing verified people with photo, name and relationship.
Priority: P1
Dependencies: MOB-5, MOB-6, PPL-2
Acceptance Criteria:
- [ ] Shows a scrollable list or grid of `PersonCard`s
- [ ] Tapping a person shows their details and related verified memories
- [ ] Only verified people appear
Status: TODO

## PAT-6

MODULE FROM: Patient App
Task: Medication card
Owner: N/A
Goal: Show a large card for a due dose with name, dose, instructions and pill photo, with "Nainom ko na / I took it" and "Skip".
Priority: P1
Dependencies: MOB-6, MED-3
Acceptance Criteria:
- [ ] The card appears for a dose that is due and unconfirmed
- [ ] Each button posts the matching status and closes the card
- [ ] The wording never claims the app knows the dose was taken
Status: TODO

## PAT-7

MODULE FROM: Patient App
Task: Games screens
Owner: N/A
Goal: Build `app/(patient)/games/`: a game list and one round player that works for every game type.
Priority: P1
Dependencies: MOB-5, MOB-6, GAM-2
Acceptance Criteria:
- [ ] Skip and Stop are always visible
- [ ] Feedback is encouraging for right and wrong answers, with no scores or grades shown
- [ ] Each round posts its result to `/games/result`
- [ ] A "not enough data" round shows a friendly message
Status: TODO

## PAT-8

MODULE FROM: Patient App
Task: Trivia prompt card
Owner: N/A
Goal: Poll `GET /trivia/next` every `trivia_frequency_min` minutes while the app is open and show a small dismissible card.
Priority: P1
Dependencies: MOB-6, TRV-2
Acceptance Criteria:
- [ ] The card can be answered, used to open related photos, or closed
- [ ] The outcome is logged as `trivia_prompt`
- [ ] No card appears while a medication card or a game is on screen
Status: TODO
