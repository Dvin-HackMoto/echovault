# MODULE: Memory Games

Owner: TBD

Goal:
Offer short, optional memory activities built only from verified data on the caregiver's chosen topics.

Features:
- Round generation per game type
- Difficulty and topic settings
- Activity logging

Tasks:
- [ ] GAM-1 People game generators
- [ ] GAM-2 Round and result endpoints
- [ ] GAM-3 Memory and routine game generators

Dependencies:
- People and Places
- Memories
- Schedule
- Settings and Dashboard

Definition of Done:
- A round of family matching can be fetched, played and logged
- No game question uses unverified information
- Results are stored as engagement, never as a score of ability

## GAM-1

MODULE FROM: Memory Games
Task: People game generators
Owner: N/A
Goal: Fill in `features/games/generators.py` for `family_matching` and `name_recall`, built from verified people who have photos.
Priority: P1
Dependencies: PPL-2
Acceptance Criteria:
- [ ] A round contains photo URLs, the correct answer and wrong choices drawn from other verified people
- [ ] Difficulty changes the number of choices or pairs
- [ ] With too few verified people, the generator returns a clear "not enough data" result
Status: TODO

## GAM-2

MODULE FROM: Memory Games
Task: Round and result endpoints
Owner: N/A
Goal: Fill in `features/games/router.py` and `repository.py` with `GET /games/{type}/round` and `POST /games/result` writing to `activity_log`.
Priority: P1
Dependencies: GAM-1, SET-1
Acceptance Criteria:
- [ ] The round uses the `game_topics` and `game_difficulty` settings
- [ ] A result stores activity, topic, outcome, difficulty and duration
- [ ] `skipped` and `stopped` are accepted outcomes
- [ ] An unknown game type returns 404
Status: TODO

## GAM-3

MODULE FROM: Memory Games
Task: Memory and routine game generators
Owner: N/A
Goal: Add generators for `event_recall` and `memory_quiz` (history memories and linked trivia questions), `routine_recall` (routine schedule items in time order) and `picture_matching`.
Priority: P2
Dependencies: GAM-2, MEM-2, SCH-2, TRV-1
Acceptance Criteria:
- [ ] `event_recall` and `memory_quiz` only use verified memories
- [ ] `routine_recall` asks for the next activity in the actual routine order
- [ ] Each type returns the same round shape as GAM-1 so the phone needs one player
Status: TODO
