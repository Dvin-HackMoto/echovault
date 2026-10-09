// Checks the patient app against a REAL running hub: the routes the app would
// send to it, and every field the screens read. Skipped unless HUB_URL is set:
//   HUB_URL=http://localhost:8000 npm run test:patient
// Routes the hub does not have yet are skipped (the app uses demo data for them).

import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseSource, parseOpenApi, type HubRoutes } from "../src/api/routes";
import { dueDose } from "../src/patient/logic";
import type { Dose, Patient, ScheduleOccurrence } from "../src/types";

const HUB = process.env.HUB_URL;
const PATIENT = { "X-Role": "patient" };
const skip = HUB ? false : "set HUB_URL to run against a real hub";

let routes: HubRoutes | null = null;
async function hubRoutes(): Promise<HubRoutes> {
  routes ??= parseOpenApi(await (await fetch(`${HUB}/openapi.json`)).json());
  return routes;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${HUB}${path}`, { headers: PATIENT });
  assert.equal(res.status, 200, `${path} -> ${res.status}`);
  return (await res.json()) as T;
}

test("every route the hub has is used; the rest are marked demo", { skip }, async () => {
  const r = await hubRoutes();
  const calls: [string, string][] = [
    ["GET", "/patient"], ["GET", "/settings"], ["GET", "/schedule/today"], ["GET", "/people"],
    ["GET", "/medications/today"], ["POST", "/medications/logs/x"], ["POST", "/assistant/ask"],
    ["GET", "/games/name_recall/round"], ["POST", "/games/result"], ["GET", "/trivia/next"], ["POST", "/trivia/result"],
  ];
  const used = Object.fromEntries(calls.map(([m, p]) => [`${m} ${p}`, chooseSource("auto", r, m, p)]));
  console.log("   sources:", used);
  for (const [m, p] of calls) assert.equal(used[`${m} ${p}`], r.has(m, p) ? "hub" : "demo");
});

test("profile has what the home screen reads", { skip }, async () => {
  const profile = await get<Partial<Patient>>("/patient");
  if (!profile.full_name) return; // no profile yet: the app falls back to defaults
  assert.equal(typeof profile.font_scale, "number");
  assert.ok([0, 1].includes(profile.managed_mode as number));
  assert.ok([0, 1].includes(profile.voice_enabled as number));
});

test("schedule occurrences have what the schedule screens read", { skip }, async (t) => {
  if (!(await hubRoutes()).has("GET", "/schedule/today")) return t.skip("hub has no /schedule/today yet");
  const items = await get<ScheduleOccurrence[]>("/schedule/today");
  for (const o of items) {
    assert.match(o.occurrence_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.ok("ends_at" in o && "ack" in o && "person_name" in o && "title" in o);
  }
});

test("doses have what the medication card reads, and the patient can answer one", { skip }, async (t) => {
  if (!(await hubRoutes()).has("GET", "/medications/today")) return t.skip("hub has no /medications/today yet");
  const doses = await get<Dose[]>("/medications/today");
  if (!doses.length) return t.skip("no medicine times today");
  for (const d of doses) {
    for (const key of ["id", "due_at", "status", "name", "dose", "time_of_day"] as const) assert.ok(d[key], `dose.${key}`);
    assert.ok("photo_url" in d && "instructions" in d);
    assert.match(d.due_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  }
  // the card logic accepts the hub's rows as they are
  const first = doses[0];
  const dueTime = new Date(first.due_at.replace(" ", "T"));
  assert.equal(dueDose([{ ...first, status: "unconfirmed" }], dueTime, {})?.id, first.id);

  const res = await fetch(`${HUB}/medications/logs/${encodeURIComponent(first.id)}`, {
    method: "POST",
    headers: { ...PATIENT, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "taken", confirmed_by: "patient" }),
  });
  assert.equal(res.status, 200);
  const answered = (await res.json()) as Dose;
  assert.equal(answered.status, "taken");
  assert.equal(answered.confirmed_by, "patient");
});

test("patient mode cannot change records", { skip }, async (t) => {
  if (!(await hubRoutes()).has("POST", "/medications")) return t.skip("hub has no POST /medications yet");
  const res = await fetch(`${HUB}/medications`, {
    method: "POST",
    headers: { ...PATIENT, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X", dose: "1", times: [{ time_of_day: "08:00" }] }),
  });
  assert.equal(res.status, 403);
});
