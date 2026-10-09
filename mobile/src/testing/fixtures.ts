// test data: responses recorded from the real hub code, not written by hand
//
// The JSON in recorded/ was captured on 2026-10-10 (a Saturday) from the schedule,
// medications and settings routers running on the hub's own schema and demo seed, with
// two medicines added through POST /medications. Re-record with the steps in
// recorded/README.md when an endpoint changes.

import { DoseLog, Medication, PatientProfile, Person, ScheduleOccurrence } from '../hub';
import medicationsJson from './recorded/medications.json';
import dosesTodayJson from './recorded/medications-today.json';
import patientJson from './recorded/patient.json';
import scheduleTodayJson from './recorded/schedule-today.json';
import scheduleTomorrowJson from './recorded/schedule-tomorrow.json';

export const TODAY = '2026-10-10';
export const TOMORROW = '2026-10-11';

export const schedule: Record<string, ScheduleOccurrence[]> = {
  [TODAY]: scheduleTodayJson as ScheduleOccurrence[],
  [TOMORROW]: scheduleTomorrowJson as ScheduleOccurrence[],
};
export const dosesToday = dosesTodayJson as DoseLog[];
export const medications = medicationsJson as Medication[];
export const profile = patientJson as PatientProfile;

function occurrence(date: string, title: string): ScheduleOccurrence {
  const found = schedule[date].find((o) => o.title === title);
  if (!found) throw new Error(`No recorded '${title}' on ${date}`);
  return found;
}

function dose(name: string, time: string): DoseLog {
  const found = dosesToday.find((d) => d.name === name && d.time_of_day === time);
  if (!found) throw new Error(`No recorded ${name} dose at ${time}`);
  return found;
}

function medication(name: string): Medication {
  const found = medications.find((m) => m.name === name);
  if (!found) throw new Error(`No recorded medication '${name}'`);
  return found;
}

// Today: Breakfast 07:00, Morning walk 07:45, Lunch 12:00, Afternoon nap 13:30,
// Ana visits 15:00, Dinner 18:00. Each reminds 30 minutes before.
export const breakfast = occurrence(TODAY, 'Breakfast');
export const walk = occurrence(TODAY, 'Morning walk');
export const lunch = occurrence(TODAY, 'Lunch');
export const anaVisit = occurrence(TODAY, 'Ana visits');
export const dinner = occurrence(TODAY, 'Dinner');
export const breakfastTomorrow = occurrence(TOMORROW, 'Breakfast');
export const massTomorrow = occurrence(TOMORROW, 'Sunday Mass');

// Amlodipine 08:00 daily, Losartan 08:00 and 20:00 daily, Metformin 06:30 on MO,WE,FR,SA.
export const metforminMorning = dose('Metformin', '06:30');
export const amlodipineMorning = dose('Amlodipine', '08:00');
export const losartanMorning = dose('Losartan', '08:00');
export const losartanEvening = dose('Losartan', '20:00');
export const amlodipine = medication('Amlodipine');
export const losartan = medication('Losartan');
export const metformin = medication('Metformin');

// NOT recorded: no branch has a people endpoint yet (PPL-1). These rows follow the
// people table in schema.sql, with photo_path as a file name like the medications photos.
export const people: Person[] = [
  {
    id: 'p-ana',
    name: 'Ana Santos',
    nickname: 'Ana',
    relationship: 'daughter',
    photo_path: 'ana.jpg',
    notes: 'Visits every Saturday afternoon.',
    is_caregiver: 1,
  },
  {
    id: 'p-miguel',
    name: 'Miguel Santos',
    nickname: 'Migs',
    relationship: 'grandson',
    photo_path: 'miguel.jpg',
    notes: null,
    is_caregiver: 0,
  },
  {
    id: 'p-cruz',
    name: 'Dr. Cruz',
    nickname: null,
    relationship: 'doctor',
    photo_path: null,
    notes: null,
    is_caregiver: 0,
  },
];
