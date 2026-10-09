# Requirements Document

## Introduction

The Reading Comprehension Game is a web-based educational platform for Grade 5–6 students. Teachers photograph a reading passage; the passage text is extracted in the browser, used to generate a question pack via an AI service, and gated by a six-stage validator pipeline before students play. Students join live multiplayer sessions, answer comprehension questions, and the system records per-skill analytics. The platform provides accessibility features including a listen mode, leveled text, and a reading-friendly display.

The frontend is a React 19 + Vite application (`frontend/my-react-app`). The backend is a greenfield FastAPI service (`backend/main.py`) using async request handling, native WebSockets, the Anthropic Python SDK, and SQLite via SQLAlchemy. Optical character recognition runs client-side with Tesseract.js so photographs never leave the browser; only extracted text is transmitted to the backend.

## Glossary

- **System**: The Reading Comprehension Game platform as a whole (frontend plus backend).
- **OCR_Module**: The client-side Tesseract.js component that extracts text from an uploaded photograph in the browser.
- **Pack_Generator**: The backend component that requests a question pack from the Anthropic Claude Sonnet model using extracted passage text.
- **Question_Pack**: A structured set of comprehension questions, answer options, correct answers, and skill tags generated from a source passage.
- **Validator_Pipeline**: The ordered set of six validators (V1–V6) that gate a Question_Pack before it becomes playable.
- **Source_Passage**: The reading text extracted by the OCR_Module from an uploaded photograph.
- **MCQ**: A multiple-choice question with one correct answer and one or more distractor options.
- **Distractor**: An incorrect answer option presented alongside the correct answer in an MCQ.
- **Reading_Level**: A readability measure classifying text difficulty; the target band for this platform is Grade 5–6.
- **Comprehension_Skill**: A targeted reading skill such as main idea, inference, or vocabulary that a question is designed to assess.
- **Session_Manager**: The backend component that manages live multiplayer game sessions over WebSockets using in-memory session state.
- **Game_Session**: A single live multiplayer instance in which a host runs a Question_Pack and participants submit answers.
- **Host**: The user, typically a teacher, who creates and controls a Game_Session.
- **Participant**: A user, typically a student, who joins a Game_Session and submits answers.
- **Analytics_Module**: The backend component that aggregates per-skill performance data from completed sessions.
- **Accessibility_Module**: The frontend component providing listen mode, leveled text, and reading-friendly display controls.
- **Listen_Mode**: A text-to-speech feature that reads passage and question text aloud.
- **Leveled_Text**: A feature that presents passage text adjusted to a selected Reading_Level.
- **Reading_Friendly_Display**: A display mode applying dyslexia-friendly fonts, increased spacing, and adjustable contrast.
- **Data_Store**: The SQLite database, accessed via SQLAlchemy, that persists analytics, user data, Question_Packs, and session results.

## Requirements

### Requirement 1: Photo Upload and In-Browser OCR

**User Story:** As a teacher, I want to photograph a reading passage and have its text extracted in my browser, so that I can create questions without sending student materials to a server.

#### Acceptance Criteria

1. WHEN a Host selects a photograph file in PNG, JPEG, or WebP format with a size of 10 MB or less, THE OCR_Module SHALL extract text from the photograph within the browser using Tesseract.js and SHALL complete extraction within 30 seconds.
2. THE OCR_Module SHALL retain the photograph only in browser memory and SHALL transmit only the extracted text to the backend.
3. WHILE text extraction is in progress, THE System SHALL display a progress indicator showing percentage complete from 0 to 100 to the Host.
4. WHEN text extraction completes, THE System SHALL display the extracted text to the Host in an editable field for review and editing before pack generation.
5. IF the selected file is not in PNG, JPEG, or WebP format, THEN THE System SHALL reject the file, retain any previously extracted text, and display an error message indicating the supported formats to the Host.
6. IF the selected file exceeds 10 MB, THEN THE System SHALL reject the file and display an error message indicating the maximum allowed file size to the Host.
7. IF text extraction produces zero characters, THEN THE System SHALL display a message indicating that no text was detected and SHALL provide a control allowing the Host to upload a different photograph.
8. IF text extraction fails before completion, THEN THE System SHALL retain the photograph in browser memory, display an error message indicating that extraction failed, and provide a control allowing the Host to retry extraction.

### Requirement 2: AI Question Pack Generation

**User Story:** As a teacher, I want the platform to generate comprehension questions from my passage, so that I do not have to author questions manually.

#### Acceptance Criteria

1. WHEN a Host submits reviewed Source_Passage text of between 100 and 10,000 characters, THE Pack_Generator SHALL request a Question_Pack from the Anthropic Claude Sonnet model using that text.
2. IF the submitted Source_Passage text is shorter than 100 characters or longer than 10,000 characters, THEN THE System SHALL NOT request a Question_Pack and SHALL display a validation error indicating the allowed length range to the Host.
3. THE Pack_Generator SHALL request a Question_Pack of between 6 and 12 questions covering the configured targeted Comprehension_Skills.
4. WHEN the Anthropic model returns a response, THE Pack_Generator SHALL submit the resulting Question_Pack to the Validator_Pipeline before the Question_Pack becomes playable.
5. IF the Validator_Pipeline rejects the Question_Pack, THEN THE System SHALL report the rejection to the Host and SHALL allow the Host to regenerate.
6. IF the Anthropic request fails or does not respond within 30 seconds, THEN THE System SHALL report a generation failure to the Host and SHALL allow the Host to retry up to 3 times per submission.

### Requirement 3: Validator Pipeline (V1–V6)

**User Story:** As a teacher, I want generated questions to be checked for correctness, grounding, reading level, answer-key integrity, skill coverage, and safety, so that students receive accurate and age-appropriate content.

#### Acceptance Criteria

1. WHEN a Question_Pack enters the Validator_Pipeline, THE Validator_Pipeline SHALL evaluate validators in the order V1, V2, V3, V4, V5, V6 and SHALL mark the Question_Pack playable only when all six validators return a pass result.
2. THE Validator_Pipeline SHALL verify (V1) that the Question_Pack is valid JSON, contains all schema-required non-empty fields, contains between 1 and 50 MCQs, and that each MCQ has exactly one option flagged correct.
3. THE Validator_Pipeline SHALL verify (V2) that each correct answer is entailed by or inferable from the Source_Passage and SHALL fail the Question_Pack if any answer relies on facts not present in the Source_Passage.
4. THE Validator_Pipeline SHALL verify (V3) that each question and the passage fall within a Flesch-Kincaid Grade Level of 5.0 to 6.9 inclusive.
5. THE Validator_Pipeline SHALL verify (V4) that no MCQ contains duplicate options, comparing options case-insensitively with surrounding whitespace trimmed, and that at most one option per MCQ is entailed by the Source_Passage as correct.
6. THE Validator_Pipeline SHALL verify (V5) that each question is tagged with at least one Comprehension_Skill drawn from the configured targeted skill set.
7. THE Validator_Pipeline SHALL verify (V6), using an Anthropic safety check for a Grade 5–6 audience, that the Question_Pack content is age-appropriate and relevant to the Source_Passage topic, and SHALL fail the Question_Pack if the check flags any content.
8. IF any validator returns a fail result, THEN THE Validator_Pipeline SHALL record the failing validator identifier and reason and SHALL stop evaluating subsequent validators.
9. WHEN the Validator_Pipeline records a validator failure, THE System SHALL present the failing validator identifier and reason to the Host.

### Requirement 4: Live Multiplayer Sessions

**User Story:** As a teacher, I want to run a live session where students answer questions together, so that my class can play in real time.

#### Acceptance Criteria

1. WHEN a Host starts a Game_Session with a playable Question_Pack, THE Session_Manager SHALL create an in-memory Game_Session and SHALL issue a join code of 4 to 8 alphanumeric characters that is unique among active Game_Sessions.
2. WHEN a Participant submits a join code matching an active Game_Session that has fewer than 40 Participants, THE Session_Manager SHALL add the Participant to that Game_Session over a WebSocket connection.
3. WHEN the Host advances to a question, THE Session_Manager SHALL deliver that question to every connected Participant.
4. WHEN a Participant submits an answer for the current question and has no prior recorded answer for that question, THE Session_Manager SHALL record the answer against the Participant and the current question.
5. IF a Participant submits an answer for a question other than the current question, or for a question the Participant has already answered, THEN THE Session_Manager SHALL reject the answer, retain any previously recorded answer, and return a not-accepted indication.
6. WHEN a Game_Session ends, THE Session_Manager SHALL persist the final session results to the Data_Store.
7. IF a Participant's WebSocket connection drops, THEN THE Session_Manager SHALL allow the Participant to rejoin the same Game_Session using the join code while the Game_Session remains active.
8. IF a Participant submits a join code that matches no active Game_Session or matches a Game_Session with 40 Participants, THEN THE Session_Manager SHALL reject the join request and return an error indication distinguishing an invalid code from a full session.

### Requirement 5: Per-Skill Analytics

**User Story:** As a teacher, I want to see how students performed on each comprehension skill, so that I can target my instruction.

#### Acceptance Criteria

1. WHEN a Game_Session's results are persisted, THE Analytics_Module SHALL aggregate every recorded Participant response in that Game_Session by the Comprehension_Skill tagged on the response's question, counting a response as correct when its submitted answer matches the question's correct answer.
2. THE Analytics_Module SHALL compute, for each Comprehension_Skill, the proportion of correct responses as correct responses divided by total responses for that Comprehension_Skill, expressed as a value from 0.0 to 1.0 rounded to two decimal places.
3. IF a Comprehension_Skill has zero recorded responses in the Game_Session, THEN THE Analytics_Module SHALL record that Comprehension_Skill with a total response count of 0 and SHALL NOT compute a proportion for it.
4. WHEN a Host requests analytics for a completed Game_Session, THE System SHALL display, for each Comprehension_Skill, the skill name, the total response count, the correct response count, and the correct-response proportion for that Game_Session.
5. IF a Host requests analytics for a Game_Session that has no persisted results, THEN THE System SHALL display a message indicating that no analytics are available for that Game_Session.
6. THE Analytics_Module SHALL persist per-skill analytics in the Data_Store.

### Requirement 6: Accessibility Features

**User Story:** As a student, I want to hear text read aloud, adjust the reading level, and use a reading-friendly display, so that I can access content that fits my needs.

#### Acceptance Criteria

1. WHERE Listen_Mode is enabled, WHEN the Participant triggers playback for the displayed passage or question, THE Accessibility_Module SHALL read the corresponding displayed text aloud using text-to-speech.
2. WHERE Leveled_Text is enabled, THE Accessibility_Module SHALL present passage text adjusted to the Reading_Level selected by the Participant from the available levels, where the available levels span at least one band below and one band above the Grade 5–6 band.
3. WHERE Reading_Friendly_Display is enabled, THE Accessibility_Module SHALL apply a dyslexia-friendly font, line spacing of at least 1.5 times the font size, character spacing of at least 0.12 times the font size, and the contrast setting selected by the Participant, where each selectable contrast setting provides a text-to-background contrast ratio of at least 4.5 to 1.
4. WHEN a Participant changes an accessibility setting, THE System SHALL apply the changed setting to the current view within 1 second and SHALL NOT end the Game_Session.
5. IF text-to-speech is unavailable in the Participant's browser when Listen_Mode playback is triggered, THEN THE Accessibility_Module SHALL display a message indicating that read-aloud is unavailable and SHALL keep the passage and question text visible.
6. IF a request for a Reading_Level text variant fails, THEN THE Accessibility_Module SHALL display a message indicating the leveled text could not be loaded, SHALL retain the previously displayed passage text, and SHALL allow the Participant to retry.

### Requirement 7: Data Persistence

**User Story:** As a platform operator, I want analytics, user data, packs, and session results stored durably, so that information survives beyond a single session and can migrate to a larger database later.

#### Acceptance Criteria

1. THE Data_Store SHALL persist user data, Question_Packs, session results, and per-skill analytics using SQLAlchemy over SQLite such that each persisted record is retrievable after a backend process restart.
2. WHEN a playable Question_Pack is produced, THE System SHALL persist the Question_Pack in the Data_Store within 5 seconds of the Question_Pack becoming playable.
3. THE System SHALL access the Data_Store exclusively through SQLAlchemy models, and THE System SHALL select the target database (SQLite or PostgreSQL) from connection configuration without modifying model definitions or calling code.
4. IF a persistence write to the Data_Store fails, THEN THE System SHALL roll back the failed write so no partial record is stored, SHALL report a persistence failure to the caller, and SHALL retain the in-memory data so the caller may retry.
