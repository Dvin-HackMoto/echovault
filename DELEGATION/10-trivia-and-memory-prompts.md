# MODULE: Trivia and Memory Prompts

Owner: TBD

Goal:
Show occasional, optional prompts at caregiver-set intervals without interrupting sleep, appointments or quiet periods.

Features:
- Preloaded general trivia
- Personal prompts linked to verified memories
- Quiet-hour and appointment suppression
- Caregiver-written questions

Tasks:
- [ ] TRV-1 Preloaded trivia
- [ ] TRV-2 Next prompt endpoint
- [ ] TRV-3 Caregiver-written questions

Dependencies:
- Memories
- Schedule
- Settings and Dashboard

Definition of Done:
- `GET /trivia/next` returns a prompt when allowed and nothing when it is not
- General trivia works with no internet
- Personal prompts always link to a verified memory

## TRV-1

MODULE FROM: Trivia and Memory Prompts
Task: Preloaded trivia
Owner: N/A
Goal: Write the general questions in `assets/trivia.json` and load them into `trivia_questions` with `source = preloaded`.
Priority: P1
Dependencies: HUB-2
Acceptance Criteria:
- [ ] At least 30 simple questions about everyday life, with answers, topics and difficulty
- [ ] Loading twice does not duplicate questions
- [ ] Questions are suitable for the audience: familiar, short, never trick questions
Status: TODO

## TRV-2

MODULE FROM: Trivia and Memory Prompts
Task: Next prompt endpoint
Owner: N/A
Goal: Fill in `features/trivia/service.py` and `router.py` with `GET /trivia/next` and its suppression rules.
Priority: P1
Dependencies: TRV-1, SCH-2, SET-1
Acceptance Criteria:
- [ ] Returns nothing inside `quiet_hours`
- [ ] Returns nothing within 30 minutes of a schedule item, or during one with `is_quiet_period = 1`
- [ ] Returns nothing if the last prompt was answered or skipped less than `trivia_frequency_min` ago
- [ ] Otherwise returns an active question matching `game_topics`; personal ones only if their memory is verified
Status: TODO

## TRV-3

MODULE FROM: Trivia and Memory Prompts
Task: Caregiver-written questions
Owner: N/A
Goal: Add caregiver CRUD for `trivia_questions` with `source = caregiver`.
Priority: P2
Dependencies: TRV-2, MEM-2
Acceptance Criteria:
- [ ] A personal question cannot be saved without a `memory_id` pointing to a verified memory
- [ ] Deleting the memory removes its questions
- [ ] A caregiver can deactivate a question without deleting it
Status: TODO
