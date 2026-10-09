// Patient screen decisions (src/patient/logic.ts).  npm run test:patient

import assert from "node:assert/strict";
import { test } from "node:test";

import { comingUp, dueDose, isForDay, isRightAnswer, parseChoices, timeState, triviaAllowed } from "../src/patient/logic";
import type { Dose, ScheduleOccurrence } from "../src/types";

const at = (hhmm: string) => new Date(2026, 9, 10, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));

function dose(id: string, time: string, status: Dose["status"] = "unconfirmed"): Dose {
  return {
    id, medication_id: id, due_at: `2026-10-10 ${time}:00`, status, confirmed_by: "none", responded_at: null,
    note: null, name: id, dose: "1 tablet", instructions: null, photo_url: null, time_of_day: time,
  };
}

function item(title: string, time: string, minutes: number | null): ScheduleOccurrence {
  const end = minutes === null ? null : (() => {
    const d = at(time);
    d.setMinutes(d.getMinutes() + minutes);
    return `2026-10-10 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
  })();
  return {
    id: title, title, kind: "meal", starts_at: `2026-10-01 ${time}:00`, duration_min: minutes, recurrence: "daily",
    notes: null, person_id: null, place_id: null, remind_before_min: 30, is_quiet_period: 0, is_active: 1,
    updated_at: "2026-10-01 00:00:00", person_name: null, place_name: null,
    occurrence_at: `2026-10-10 ${time}:00`, ends_at: end, remind_at: `2026-10-10 ${time}:00`, ack: null,
  };
}

test("medication card: only a due, unanswered, recent dose", () => {
  const doses = [dose("evening", "20:00"), dose("morning", "08:00"), dose("answered", "07:00", "taken")];
  assert.equal(dueDose(doses, at("07:59"), {}), null); // nothing due yet
  assert.equal(dueDose(doses, at("08:00"), {})?.id, "morning");
  assert.equal(dueDose(doses, at("11:30"), {}), null); // more than 3 h late: the caregiver follows up
});

test('medication card: "remind me later" hides it until the time passes', () => {
  const doses = [dose("morning", "08:00")];
  const later = { morning: at("08:15").getTime() };
  assert.equal(dueDose(doses, at("08:05"), later), null);
  assert.equal(dueDose(doses, at("08:15"), later)?.id, "morning");
});

test("schedule: earlier, now and later", () => {
  const lunch = item("Lunch", "12:00", 45);
  assert.equal(timeState(lunch, at("11:59")), "upcoming");
  assert.equal(timeState(lunch, at("12:30")), "now");
  assert.equal(timeState(lunch, at("12:45")), "past");
  const bedtime = item("Bedtime", "21:00", null); // no duration: "now" for 30 minutes
  assert.equal(timeState(bedtime, at("21:20")), "now");
  assert.equal(timeState(bedtime, at("21:31")), "past");
});

test("home: what is happening now and next", () => {
  const day = [item("Breakfast", "07:00", 30), item("Lunch", "12:00", 45), item("Dinner", "18:30", 45)];
  assert.deepEqual(comingUp(day, at("12:10"), 3).map((i) => i.title), ["Lunch", "Dinner"]);
  assert.deepEqual(comingUp(day, at("19:30"), 3), []);
});

test("a saved schedule from another day is not shown as today's", () => {
  const day = [item("Lunch", "12:00", 45)];
  assert.equal(isForDay(day, at("09:00")), true);
  assert.equal(isForDay(day, new Date(2026, 9, 11, 9, 0)), false);
});

test("question choices: JSON string from the schema, an array, or open recall", () => {
  assert.deepEqual(parseChoices('["Bea","Ana"]'), ["Bea", "Ana"]);
  assert.deepEqual(parseChoices(["Bea", "Ana"]), ["Bea", "Ana"]);
  assert.deepEqual(parseChoices(null), []);
  assert.deepEqual(parseChoices("not json"), []);
  assert.equal(isRightAnswer(" sunflowers ", "Sunflowers"), true);
  assert.equal(isRightAnswer("Roses", "Sunflowers"), false);
});

test("trivia waits for medication cards and games", () => {
  assert.equal(triviaAllowed("/home", false), true);
  assert.equal(triviaAllowed("/home", true), false);
  assert.equal(triviaAllowed("/games/name_recall", false), false);
});
