// The demo hub keeps the same rules and shapes as the real one (src/mock/hub.ts).
//   npm run test:patient

import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssistantAnswer } from "../src/api/assistant";
import type { GameRound } from "../src/api/games";
import { createDemoHub } from "../src/mock/hub";
import { parseChoices } from "../src/patient/logic";
import type { Dose, Memory, Person, ScheduleOccurrence, TriviaPrompt } from "../src/types";

const NOON = () => new Date(2026, 9, 10, 12, 10);

test("patient mode only receives verified people", async () => {
  const hub = createDemoHub(NOON);
  const people = (await hub.handle("GET", "/people?trust=verified")) as Person[];
  assert.ok(people.length > 0);
  assert.ok(people.every((p) => p.trust === "verified"));
  assert.ok(!people.some((p) => p.name.startsWith("Carmen")));
});

test("memories filter by person and trust", async () => {
  const hub = createDemoHub(NOON);
  const about = (await hub.handle("GET", "/memories?trust=verified&person_id=demo-ana")) as Memory[];
  assert.ok(about.length > 0);
  assert.ok(about.every((m) => m.person_id === "demo-ana" && m.trust === "verified"));
});

test("today's schedule is in time order and acks show up", async () => {
  const hub = createDemoHub(NOON);
  const today = (await hub.handle("GET", "/schedule/today")) as ScheduleOccurrence[];
  const times = today.map((o) => o.occurrence_at);
  assert.deepEqual(times, [...times].sort());
  assert.ok(times.every((t) => t.startsWith("2026-10-10")));
  await hub.handle("POST", `/schedule/${today[0].id}/ack`, { occurrence_at: today[0].occurrence_at, response: "acknowledged" });
  const again = (await hub.handle("GET", "/schedule/today")) as ScheduleOccurrence[];
  assert.equal(again[0].ack?.response, "acknowledged");
});

test("doses start unconfirmed and change only when the patient answers", async () => {
  const hub = createDemoHub(NOON);
  const doses = (await hub.handle("GET", "/medications/today")) as Dose[];
  assert.ok(doses.every((d) => d.status === "unconfirmed" && d.confirmed_by === "none"));
  const answered = (await hub.handle("POST", `/medications/logs/${encodeURIComponent(doses[0].id)}`, { status: "taken" })) as Dose;
  assert.equal(answered.status, "taken");
  assert.equal(answered.confirmed_by, "patient");
  await assert.rejects(hub.handle("POST", `/medications/logs/${encodeURIComponent(doses[1].id)}`, { status: "unconfirmed" }));
});

test("assistant: who-is, schedule, medicine and no-data answers", async () => {
  const hub = createDemoHub(NOON);
  const ask = (text: string) => hub.handle("POST", "/assistant/ask", { text }) as Promise<AssistantAnswer>;
  const ana = await ask("Sino si Ana?");
  assert.match(ana.answer, /daughter/);
  assert.equal(ana.people[0].nickname, "Ana");
  assert.match((await ask("What is next today?")).answer, /Afternoon rest at 1:30 PM/);
  assert.match((await ask("Anong gamot ko?")).answer, /Losartan, 1 tablet, at 8:00 PM/);
  const unknown = await ask("What is the wifi password?");
  assert.equal(unknown.answer_mode, "no_data");
  assert.match(unknown.answer, /ask Ana/);
});

test("every game question has its answer among 2-3 choices (hub round shape)", async () => {
  const hub = createDemoHub(NOON);
  for (const type of ["family_matching", "name_recall", "routine_recall", "event_recall", "memory_quiz"]) {
    const round = (await hub.handle("GET", `/games/${type}/round`)) as GameRound;
    assert.equal(round.activity, type);
    assert.equal(round.available, true);
    assert.ok(round.questions.length > 0, type);
    for (const q of round.questions) {
      const labels = q.choices.map((c) => c.label);
      assert.ok(labels.includes(q.answer_label), `${type}: ${q.prompt}`);
      assert.equal(q.choices.find((c) => c.id === q.answer_id)?.label, q.answer_label);
      assert.ok(labels.length >= 2 && labels.length <= 3, `${type}: ${labels}`);
      assert.equal(new Set(labels).size, labels.length, `${type}: duplicate choices`);
    }
  }
  const pictures = (await hub.handle("GET", "/games/picture_matching/round")) as GameRound;
  assert.equal(pictures.available, false);
  assert.equal(pictures.reason, "not_enough_data");
  await assert.rejects(hub.handle("GET", "/games/chess/round"), { status: 404 });
});

test("trivia rotates and links a person for See photos", async () => {
  const hub = createDemoHub(NOON);
  const first = (await hub.handle("GET", "/trivia/next")) as TriviaPrompt;
  assert.equal(first.people?.[0]?.id, "demo-ana");
  assert.deepEqual(parseChoices(first.choices).length, 3);
  const second = (await hub.handle("GET", "/trivia/next")) as TriviaPrompt;
  assert.notEqual(second.id, first.id);
});

test("unknown routes fail like the real hub, marked as not built yet", async () => {
  const hub = createDemoHub(NOON);
  await assert.rejects(hub.handle("GET", "/nope"), { status: 404, missingRoute: true });
  await assert.rejects(hub.handle("POST", "/memories", { content: "x" }), { missingRoute: true });
});
