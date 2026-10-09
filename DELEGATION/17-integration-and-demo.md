# MODULE: Integration and Demo

Owner: TBD

Goal:
Prove the whole system works together, offline, on the actual demo hardware.

Features:
- Backend tests for the trust rules
- Model choice and speed check
- End-to-end demo rehearsal

Tasks:
- [ ] QA-1 End-to-end demo rehearsal
- [ ] QA-2 Backend tests
- [ ] QA-3 Model and latency check

Dependencies:
- All other modules

Definition of Done:
- The full demo script runs start to finish with the internet off
- The rules that protect the patient from wrong answers are covered by tests

## QA-1

MODULE FROM: Integration and Demo
Task: End-to-end demo rehearsal
Owner: N/A
Goal: Write the demo script and run it on the demo laptop and two phones over a hotspot with no internet.
Priority: P0
Dependencies: All P0 tasks
Acceptance Criteria:
- [ ] Caregiver unlocks, adds a person with a photo, adds and verifies a memory
- [ ] Patient asks about that person and gets the right answer with the photo
- [ ] Patient asks about something not recorded and gets the `no_data` reply
- [ ] The whole run works with mobile data and internet turned off
Status: TODO

## QA-2

MODULE FROM: Integration and Demo
Task: Backend tests
Owner: N/A
Goal: Add pytest tests in `backend/tests/` for the rules that must not break (add `pytest` to the requirements).
Priority: P1
Dependencies: AST-4, MEM-4, MED-3, TRV-2
Acceptance Criteria:
- [ ] Retrieval never returns unverified, conflicting, outdated, archived or out-of-validity memories
- [ ] Patient mode is blocked from every write and management endpoint
- [ ] No dose becomes `taken` without an explicit confirmation
- [ ] Trivia is suppressed in quiet hours and around appointments
Status: TODO

## QA-3

MODULE FROM: Integration and Demo
Task: Model and latency check
Owner: N/A
Goal: Try the candidate models (Qwen2.5-3B, Gemma 3 4B) and Whisper sizes on the demo laptop and pick the ones that answer fast enough.
Priority: P1
Dependencies: AST-4, AI-4
Acceptance Criteria:
- [ ] Answer time for a typical question is measured for each model on the demo laptop
- [ ] The chosen models answer inside the 8 second timeout most of the time
- [ ] Filipino and mixed Filipino-English questions are checked
- [ ] `.env.example` and the README name the chosen models
Status: TODO
