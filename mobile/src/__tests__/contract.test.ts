// the row types in hub.ts must list exactly the fields the hub sends
//
// Each list below is checked by the compiler against its type (a missing or extra field
// is a type error) and by the test against the recorded responses. So if the hub adds,
// removes or renames a field and the recordings are refreshed, this fails until hub.ts follows.

import { DoseLog, Medication, PatientProfile, Person, ScheduleAck, ScheduleOccurrence } from '../hub';
import { dosesToday, medications, people, profile, schedule, TODAY, TOMORROW } from '../testing/fixtures';
import peopleJson from '../testing/recorded/people.json';
import placesJson from '../testing/recorded/places.json';
import games from '../testing/recorded/games.json';
import trivia from '../testing/recorded/trivia.json';
import writes from '../testing/recorded/writes.json';
import type { GameChoice, GameQuestion, GameRound } from '../api/games';
import type { ActivityLog, Person as PersonRow, Place, TriviaPrompt } from '../types';

/** Accepts only an array that names every key of T, once. */
const fieldsOf =
  <T>() =>
  <K extends (keyof T)[]>(...keys: [keyof T] extends [K[number]] ? K : never) =>
    [...keys].sort() as string[];

const SCHEDULE_FIELDS = fieldsOf<ScheduleOccurrence>()(
  'id', 'title', 'kind', 'starts_at', 'duration_min', 'recurrence', 'ends_on', 'person_id', 'place_id',
  'notes', 'remind_before_min', 'is_quiet_period', 'is_active', 'updated_at', 'person_name',
  'person_relationship', 'person_photo_path', 'place_name', 'occurrence_at', 'ends_at', 'remind_at', 'ack',
);
const ACK_FIELDS = fieldsOf<ScheduleAck>()('id', 'schedule_item_id', 'occurrence_at', 'response', 'responded_at');
const DOSE_FIELDS = fieldsOf<DoseLog>()(
  'id', 'medication_id', 'due_at', 'status', 'confirmed_by', 'responded_at', 'note', 'name', 'dose',
  'instructions', 'photo_path', 'time_of_day', 'photo_url',
);
const MEDICATION_FIELDS = fieldsOf<Medication>()(
  'id', 'name', 'dose', 'instructions', 'photo_path', 'start_date', 'end_date', 'is_active', 'created_by',
  'updated_at', 'times', 'photo_url',
);
const PROFILE_FIELDS = fieldsOf<PatientProfile>()(
  'id', 'full_name', 'preferred_name', 'birth_date', 'photo_path', 'language', 'font_scale', 'voice_enabled',
  'managed_mode', 'updated_at',
);
// photo_uri is not from the hub: cache.ts adds it on the phone
const PERSON_FIELDS = fieldsOf<Omit<Person, 'photo_uri'>>()(
  'id', 'name', 'nickname', 'relationship', 'photo_path', 'notes', 'is_caregiver', 'trust', 'created_by',
  'created_at', 'updated_at', 'photo_url',
);
// src/types.ts has its own Person and Place, used by src/api/ and PersonCard
const PERSON_ROW_FIELDS = fieldsOf<PersonRow>()(
  'id', 'name', 'nickname', 'relationship', 'photo_path', 'notes', 'is_caregiver', 'trust', 'created_by',
  'created_at', 'updated_at', 'photo_url',
);
const PLACE_FIELDS = fieldsOf<Place>()(
  'id', 'name', 'description', 'address', 'photo_path', 'trust', 'updated_at', 'photo_url',
);
// trivia prompts and their people use the src/types.ts shapes the patient screens use
const TRIVIA_FIELDS = fieldsOf<TriviaPrompt>()(
  'id', 'kind', 'topic', 'question', 'answer', 'choices', 'memory_id', 'difficulty', 'source', 'is_active', 'people',
);
const ACTIVITY_FIELDS = fieldsOf<ActivityLog>()(
  'id', 'activity', 'topic', 'question_ref', 'outcome', 'difficulty', 'duration_sec', 'created_at',
);
// src/api/games.ts: one round shape for every game type
const ROUND_FIELDS = fieldsOf<GameRound>()('activity', 'topic', 'difficulty', 'available', 'reason', 'questions');
const QUESTION_FIELDS = fieldsOf<GameQuestion>()(
  'id', 'prompt', 'photo_url', 'choice_style', 'choices', 'answer_id', 'answer_label',
);
const CHOICE_FIELDS = fieldsOf<GameChoice>()('id', 'label', 'photo_url');

const keys = (row: object) => Object.keys(row).sort();

test('GET /schedule/today rows', () => {
  const rows = [...schedule[TODAY], ...schedule[TOMORROW]];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(keys(row)).toEqual(SCHEDULE_FIELDS);
});

test('schedule ack rows, as returned by POST /schedule/{id}/ack and inside /schedule/today', () => {
  expect(keys(writes.ack_ok.body)).toEqual(ACK_FIELDS);
  expect(keys(writes.after_ack[0])).toEqual(ACK_FIELDS);
});

test('GET /medications/today rows, and the POST /medications/logs/{id} reply', () => {
  expect(dosesToday.length).toBeGreaterThan(0);
  for (const row of dosesToday) expect(keys(row)).toEqual(DOSE_FIELDS);
  expect(keys(writes.dose_ok.body)).toEqual(DOSE_FIELDS);
});

test('GET /medications rows', () => {
  for (const row of medications) {
    expect(keys(row)).toEqual(MEDICATION_FIELDS);
    for (const time of row.times) expect(keys(time)).toEqual(['days', 'id', 'medication_id', 'time_of_day']);
  }
});

test('GET /patient', () => {
  expect(keys(profile)).toEqual(PROFILE_FIELDS);
});

test('GET /people rows', () => {
  expect(peopleJson.length).toBeGreaterThan(0);
  for (const row of peopleJson) {
    expect(keys(row)).toEqual(PERSON_FIELDS);
    expect(keys(row)).toEqual(PERSON_ROW_FIELDS);
    expect(row.trust).toBe('verified'); // recorded as the patient
    expect(row.photo_url).toBe(row.photo_path ? `/photos/${row.photo_path}` : null);
  }
  for (const row of people) expect(keys(row)).toEqual(PERSON_FIELDS);
});

test('GET /places rows', () => {
  expect(placesJson.length).toBeGreaterThan(0);
  for (const row of placesJson) expect(keys(row)).toEqual(PLACE_FIELDS);
});

test('GET /trivia/next, and the POST /trivia/result reply', () => {
  expect(keys(trivia.next)).toEqual(TRIVIA_FIELDS);
  expect(trivia.next.people.length).toBeGreaterThan(0);
  // the people on a prompt are the same rows GET /people returns
  for (const person of trivia.next.people) expect(keys(person)).toEqual(PERSON_ROW_FIELDS);
  // choices are a JSON array string that includes the answer
  expect(JSON.parse(trivia.next.choices)).toContain(trivia.next.answer);

  expect(keys(trivia.result)).toEqual(ACTIVITY_FIELDS);
  expect(trivia.result).toMatchObject({ activity: 'trivia_prompt', question_ref: trivia.next.id, outcome: 'completed' });
  // once answered, the hub stays quiet for trivia_frequency_min, and never stores right or wrong
  expect(trivia.next_after_result).toBeNull();
  expect(trivia.result_rejected.status).toBe(422);
});

test('GET /games/{type}/round, and the POST /games/result reply', () => {
  for (const round of [games.family_matching, games.memory_quiz, games.picture_matching]) {
    expect(keys(round)).toEqual(ROUND_FIELDS);
    for (const q of round.questions) {
      expect(keys(q)).toEqual(QUESTION_FIELDS);
      for (const c of q.choices) expect(keys(c)).toEqual(CHOICE_FIELDS);
      // open recall has no choices and no answer_id; otherwise the answer is one of the choices
      if (q.choices.length) expect(q.choices.map((c) => c.id)).toContain(q.answer_id);
      else expect(q.answer_id).toBeNull();
    }
  }
  expect(games.family_matching.available).toBe(true);
  for (const q of games.family_matching.questions) {
    expect(q.choice_style).toBe('photo');
    for (const c of q.choices) expect(c.photo_url).toMatch(/^\/photos\//);
  }
  // the default game_topics don't include familiar_places or recent_events
  expect(games.picture_matching).toMatchObject({ available: false, reason: 'topic_not_selected', questions: [] });

  // one engagement row per round; trivia prompts are logged by /trivia/result instead
  expect(keys(games.result)).toEqual(ACTIVITY_FIELDS);
  expect(games.result).toMatchObject({ activity: 'family_matching', outcome: 'completed' });
  expect(games.result_rejected.status).toBe(422);
});

test('times are hub local time strings the phone can parse', () => {
  const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  for (const row of schedule[TODAY]) {
    expect(row.occurrence_at).toMatch(stamp);
    expect(row.remind_at).toMatch(stamp);
  }
  for (const row of dosesToday) expect(row.due_at).toMatch(stamp);
  for (const med of medications) for (const time of med.times) expect(time.time_of_day).toMatch(/^\d{2}:\d{2}$/);
});
