// the row types in hub.ts must list exactly the fields the hub sends
//
// Each list below is checked by the compiler against its type (a missing or extra field
// is a type error) and by the test against the recorded responses. So if the hub adds,
// removes or renames a field and the recordings are refreshed, this fails until hub.ts follows.

import { DoseLog, Medication, PatientProfile, Person, ScheduleAck, ScheduleOccurrence } from '../hub';
import { dosesToday, medications, people, profile, schedule, TODAY, TOMORROW } from '../testing/fixtures';
import peopleJson from '../testing/recorded/people.json';
import placesJson from '../testing/recorded/places.json';
import writes from '../testing/recorded/writes.json';
import type { Person as PersonRow, Place } from '../types';

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

test('times are hub local time strings the phone can parse', () => {
  const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  for (const row of schedule[TODAY]) {
    expect(row.occurrence_at).toMatch(stamp);
    expect(row.remind_at).toMatch(stamp);
  }
  for (const row of dosesToday) expect(row.due_at).toMatch(stamp);
  for (const med of medications) for (const time of med.times) expect(time.time_of_day).toMatch(/^\d{2}:\d{2}$/);
});
