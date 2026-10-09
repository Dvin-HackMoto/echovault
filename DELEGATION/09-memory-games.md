# MODULE: Memory Games

Owner: TBD

Goal:
Offer short, optional memory activities built only from verified data on the caregiver's chosen topics.

Features:
- Round generation per game type
- Difficulty and topic settings
- Activity logging

Tasks:
- [x] GAM-1 People game generators
- [x] GAM-2 Round and result endpoints
- [x] GAM-3 Memory and routine game generators

Dependencies:
- People and Places
- Memories
- Schedule
- Settings and Dashboard

Definition of Done:
- [x] A round of family matching can be fetched, played and logged
- [x] No game question uses unverified information
- [x] Results are stored as engagement, never as a score of ability

Implementation notes (branch `feature/09-memory-games`):
- `features/games/sources.py` is the only place games reads data. People, places, schedule and
  settings go through their modules. Memories and trivia have no lookups yet (MEM-2, TRV-1), so
  `sources.py` reads those tables read-only and filters with `app.ai.records.is_usable`. When those
  modules publish lookups, swap the two queries there; nothing else changes.
- Every type returns the same round: `{activity, topic, difficulty, available, reason, questions}`,
  each question `{id, prompt, photo_url, choice_style, choices[{id, label, photo_url}], answer_id,
  answer_label}`. `choices: []` is open recall. Contract is in `mobile/src/api/games.ts`.
- `available: false` with `reason` `topic_not_selected` or `not_enough_data` instead of an error.
- Topics that unlock each game: family_matching / name_recall ← family_names, relationships;
  routine_recall ← routines; event_recall ← recent_events; picture_matching ← familiar_places,
  recent_events; memory_quiz ← trivia on any selected topic (or no topic).
- Choices per question = difficulty + 1, fewer if data is short, never fewer than 2. 3 questions per round.
- The phone posts one result per round (`completed`, `skipped` or `stopped`). `trivia_prompt` is rejected
  here; the trivia module logs it.
- Demo seed: picture_matching is `not_enough_data` until a place or memory has a photo.
- Tests: `backend/tests/test_games.py`.

## GAM-1

MODULE FROM: Memory Games
Task: People game generators
Owner: N/A
Goal: Fill in `features/games/generators.py` for `family_matching` and `name_recall`, built from verified people who have photos.
Priority: P1
Dependencies: PPL-2
Acceptance Criteria:
- [x] A round contains photo URLs, the correct answer and wrong choices drawn from other verified people
- [x] Difficulty changes the number of choices or pairs
- [x] With too few verified people, the generator returns a clear "not enough data" result
Status: REVIEW

## GAM-2

MODULE FROM: Memory Games
Task: Round and result endpoints
Owner: N/A
Goal: Fill in `features/games/router.py` and `repository.py` with `GET /games/{type}/round` and `POST /games/result` writing to `activity_log`.
Priority: P1
Dependencies: GAM-1, SET-1
Acceptance Criteria:
- [x] The round uses the `game_topics` and `game_difficulty` settings
- [x] A result stores activity, topic, outcome, difficulty and duration
- [x] `skipped` and `stopped` are accepted outcomes
- [x] An unknown game type returns 404
Status: REVIEW

## GAM-3

MODULE FROM: Memory Games
Task: Memory and routine game generators
Owner: N/A
Goal: Add generators for `event_recall` and `memory_quiz` (history memories and linked trivia questions), `routine_recall` (routine schedule items in time order) and `picture_matching`.
Priority: P2
Dependencies: GAM-2, MEM-2, SCH-2, TRV-1
Acceptance Criteria:
- [x] `event_recall` and `memory_quiz` only use verified memories
- [x] `routine_recall` asks for the next activity in the actual routine order
- [x] Each type returns the same round shape as GAM-1 so the phone needs one player
Status: REVIEW
