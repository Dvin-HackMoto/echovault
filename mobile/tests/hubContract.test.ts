// Checks the patient app against a REAL running hub: the routes the app would
// send to it, and every field the screens read. Skipped unless HUB_URL is set:
//   HUB_URL=http://localhost:8000 npm run test:patient

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOpenApi, type HubRoutes } from "../src/api/routes";
import { dueDose } from "../src/patient/logic";
import type { AssistantAnswer } from "../src/api/assistant";
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

test("every route the patient and caregiver apps call exists on the hub", { skip }, async () => {
  const r = await hubRoutes();
  const calls: [string, string][] = [
    // patient app
    ["GET", "/patient"], ["GET", "/settings"], ["GET", "/schedule/today"], ["GET", "/people"],
    ["GET", "/memories"], ["GET", "/medications/today"], ["POST", "/medications/logs/x"],
    ["POST", "/schedule/x/ack"], ["POST", "/assistant/ask"], ["POST", "/assistant/voice"],
    ["GET", "/games/name_recall/round"], ["POST", "/games/result"], ["GET", "/trivia/next"], ["POST", "/trivia/result"],
    // caregiver app
    ["POST", "/auth/pin"], ["GET", "/auth/me"], ["GET", "/dashboard"],
    ["GET", "/memories/x"], ["POST", "/memories"], ["PUT", "/memories/x"], ["DELETE", "/memories/x"],
    ["POST", "/memories/x/verify"], ["POST", "/memories/x/resolve"],
    ["POST", "/people"], ["PUT", "/people/x"], ["DELETE", "/people/x"], ["POST", "/people/x/photo"],
    ["GET", "/schedule"], ["POST", "/schedule"], ["PUT", "/schedule/x"], ["DELETE", "/schedule/x"],
    ["GET", "/medications"], ["POST", "/medications"], ["PUT", "/medications/x"], ["DELETE", "/medications/x"],
    ["POST", "/medications/x/photo"], ["PUT", "/settings"],
    ["GET", "/assistant/log"], ["POST", "/assistant/log/x/flag"],
    ["GET", "/backup/export"], ["POST", "/backup/import"],
  ];
  const missing = calls.filter(([m, p]) => !r.has(m, p)).map(([m, p]) => `${m} ${p}`);
  assert.deepEqual(missing, [], "routes the app calls but the hub does not have");
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

test("answers have what the Ask screen reads", { skip }, async (t) => {
  if (!(await hubRoutes()).has("POST", "/assistant/ask")) return t.skip("hub has no /assistant/ask yet");
  const ask = (text: unknown) =>
    fetch(`${HUB}/assistant/ask`, {
      method: "POST",
      headers: { ...PATIENT, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  for (const question of ["What is next today?", "What medicine do I take?", "Who is Ana?", "What is the wifi password?"]) {
    const res = await ask(question);
    assert.equal(res.status, 200, `${question} -> ${res.status}`);
    const answer = (await res.json()) as AssistantAnswer;
    assert.ok(answer.answer, `${question}: answer`);
    assert.ok(["template", "llm", "fallback", "no_data"].includes(answer.answer_mode));
    assert.ok(Array.isArray(answer.people) && Array.isArray(answer.memory_ids));
    for (const p of answer.people) assert.ok(p.id && p.name && p.relationship && "photo_url" in p);
  }
  assert.equal((await ask("  ")).status, 422);
  // the caregiver's list of answers is closed to the patient
  assert.equal((await fetch(`${HUB}/assistant/log`, { headers: PATIENT })).status, 403);
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
