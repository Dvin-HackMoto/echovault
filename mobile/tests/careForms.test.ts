// Caregiver form helpers (src/caregiver/forms.ts).
//   npm run test:patient

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRecurrence, isIsoDate, medicineDays, parseTime, readRecurrence } from "../src/caregiver/forms";

test("times the caregiver types become the hub's HH:MM", () => {
  assert.equal(parseTime("8:00"), "08:00");
  assert.equal(parseTime("20:30"), "20:30");
  assert.equal(parseTime("8 pm"), "20:00");
  assert.equal(parseTime("8:30 AM"), "08:30");
  assert.equal(parseTime("12am"), "00:00");
  assert.equal(parseTime("12 pm"), "12:00");
  assert.equal(parseTime("8"), null, "a bare hour is ambiguous");
  assert.equal(parseTime("25:00"), null);
  assert.equal(parseTime("13 pm"), null);
  assert.equal(parseTime("noon"), null);
});

test("repeat choices map to the hub's recurrence strings and back", () => {
  assert.equal(buildRecurrence("once", [], "2026-10-10"), null);
  assert.equal(buildRecurrence("daily", [], "2026-10-10"), "daily");
  assert.equal(buildRecurrence("weekly", ["WE", "MO"], "2026-10-10"), "weekly:MO,WE");
  assert.equal(buildRecurrence("weekly", [], "2026-10-10"), null);
  assert.equal(buildRecurrence("monthly", [], "2026-10-15"), "monthly:15");
  assert.deepEqual(readRecurrence("weekly:MO,WE"), { repeat: "weekly", weekdays: ["MO", "WE"] });
  assert.deepEqual(readRecurrence(null), { repeat: "once", weekdays: [] });
  assert.deepEqual(readRecurrence("monthly:3"), { repeat: "monthly", weekdays: [] });
});

test("dates must be real calendar dates", () => {
  assert.ok(isIsoDate("2026-02-28"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("10/10/2026"));
});

test("medicine days: none or all is daily", () => {
  assert.equal(medicineDays([]), "daily");
  assert.equal(medicineDays(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]), "daily");
  assert.equal(medicineDays(["FR", "MO"]), "MO,FR");
});
