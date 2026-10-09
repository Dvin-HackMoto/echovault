// EchoVault mobile — TEMPORARY demo hub.
//
// Answers requests in memory, with the same paths and JSON shapes as the real
// hub, for features whose backend module is not merged yet (src/api/client.ts
// sends a request here only when the hub does not publish that route, or in
// "demo" data mode). Delete a route here once the real endpoint exists; delete
// the file once every route is real. No React Native imports, so it is
// unit-tested in tests/mockHub.test.ts.

import type { AssistantAnswer } from "../api/assistant";
import type { GameQuestion, GameRound } from "../api/games";
import { clockLabel, fromStamp, toStamp } from "../time";
import type {
  ActivityKind,
  AckResponse,
  Difficulty,
  Dose,
  Person,
  ScheduleKind,
  ScheduleOccurrence,
  TriviaKind,
  TriviaPrompt,
} from "../types";
import { DAY, MEDICINES, MEMORIES, PEOPLE, PROFILE, QUIZ, SETTINGS, TRIVIA } from "./data";

export class DemoHubError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, DemoHubError.prototype);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (match: RegExpMatchArray, body: any, query: URLSearchParams) => unknown;

const GAME_TYPES: ActivityKind[] = [
  "family_matching", "name_recall", "event_recall", "routine_recall", "picture_matching", "memory_quiz",
];

export function createDemoHub(now: () => Date = () => new Date()) {
  // state the demo keeps while the app is open
  const doses = new Map<string, Pick<Dose, "status" | "confirmed_by" | "responded_at">>();
  const acks = new Map<string, { response: AckResponse; responded_at: string }>();
  const activity: unknown[] = [];
  let triviaTurn = 0;

  const verified = () => PEOPLE.filter((p) => p.trust === "verified");
  const personById = (id: string | null | undefined): Person | null => verified().find((p) => p.id === id) ?? null;
  const today = () => toStamp(now()).slice(0, 10);
  const difficulty = SETTINGS.game_difficulty as Difficulty;

  function scheduleToday(): ScheduleOccurrence[] {
    return DAY.map((item) => {
      const occurrenceAt = `${today()} ${item.time}:00`;
      const start = fromStamp(occurrenceAt);
      const p = "person" in item ? personById(item.person) : null;
      return {
        id: item.id, title: item.title, kind: item.kind as ScheduleKind, starts_at: occurrenceAt,
        duration_min: item.duration, recurrence: "daily", ends_on: null, notes: null,
        person_id: p?.id ?? null, place_id: null, remind_before_min: 30,
        is_quiet_period: "quiet" in item && item.quiet ? 1 : 0, is_active: 1, updated_at: occurrenceAt,
        person_name: p?.name ?? null, person_relationship: p?.relationship ?? null, person_photo_path: null,
        place_name: "place" in item ? item.place : null,
        occurrence_at: occurrenceAt,
        ends_at: item.duration ? toStamp(new Date(start.getTime() + item.duration * 60000)) : null,
        remind_at: toStamp(new Date(start.getTime() - 30 * 60000)),
        ack: acks.get(`${item.id}|${occurrenceAt}`) ?? null,
      };
    });
  }

  function dosesToday(): Dose[] {
    return MEDICINES.map((m) => {
      const id = `${m.id}|${today()}`;
      return {
        id, medication_id: m.id, due_at: `${today()} ${m.time}:00`,
        status: "unconfirmed", confirmed_by: "none", responded_at: null, note: null,
        name: m.name, dose: m.dose, instructions: m.instructions, photo_path: null, photo_url: null,
        time_of_day: m.time,
        ...doses.get(id),
      };
    });
  }

  function answer(text: string, people: Person[], answerMode: AssistantAnswer["answer_mode"], intent: string, memoryIds: string[] = []): AssistantAnswer {
    return { answer: text, answer_mode: answerMode, intent, people, memory_ids: memoryIds };
  }

  function ask(text: string): AssistantAnswer {
    const q = text.toLowerCase();
    const who = q.match(/(?:sino si|who is|who's)\s+([a-z .'-]+)/);
    if (who) {
      const name = who[1].replace(/[?.!]/g, "").trim();
      const p = verified().find((x) =>
        [x.name, x.nickname ?? ""].some((n) => n.toLowerCase().includes(name) || name.includes(n.toLowerCase().split(" ")[0])),
      );
      if (p) {
        const facts = MEMORIES.filter((m) => m.person_id === p.id && m.trust === "verified");
        return answer(`${p.nickname ?? p.name} is your ${p.relationship}. ${p.notes ?? ""}`.trim(), [p], "template", "who_is", facts.map((m) => m.id));
      }
    }
    if (/gamot|medicine|medication|pill/.test(q)) {
      const next = dosesToday().find((d) => d.status === "unconfirmed" && d.due_at >= toStamp(now()));
      if (next) {
        return answer(`Your next medicine is ${next.name}, ${next.dose}, at ${clockLabel(next.due_at)}, ${next.instructions}.`, [], "template", "medication");
      }
    }
    if (/next|susunod|today|ngayon|schedule|gagawin/.test(q)) {
      const next = scheduleToday().find((o) => o.occurrence_at >= toStamp(now()));
      if (next) return answer(`Next is ${next.title} at ${clockLabel(next.occurrence_at)}.`, [], "template", "next_event");
    }
    const caregiver = verified().find((p) => p.is_caregiver);
    return answer(
      `I don't have that saved yet. You can ask ${caregiver?.nickname ?? "your caregiver"}.`,
      caregiver ? [caregiver] : [], "no_data", "general",
    );
  }

  function question(id: string, kind: TriviaKind, text: string, right: string, choices: string[], extra: Partial<GameQuestion> = {}): GameQuestion {
    return {
      id, kind, topic: null, question: text, answer: right, choices: JSON.stringify(choices),
      memory_id: null, difficulty, source: "generated", is_active: 1, ...extra,
    };
  }

  function gameRound(type: ActivityKind): GameRound {
    const base = { activity: type, topic: null, difficulty };
    const family = verified().filter((p) => p.relationship !== "doctor").slice(0, 4);
    // the right answer plus two others, in a stable order that is not always "first"
    const pick = (right: string, pool: string[], i: number) => {
      const others = pool.filter((x) => x !== right);
      return [...new Set([right, others[i % others.length], others[(i + 1) % others.length]])].sort();
    };
    let questions: GameQuestion[] = [];
    if (type === "family_matching") {
      const names = family.map((p) => p.nickname ?? p.name);
      questions = family.map((p, i) =>
        question(p.id, "family", `Which one is your ${p.relationship}?`, p.nickname ?? p.name, pick(p.nickname ?? p.name, names, i)));
    } else if (type === "name_recall") {
      const relations = family.map((p) => `My ${p.relationship}`);
      questions = family.map((p, i) =>
        question(p.id, "family", `Who is ${p.nickname ?? p.name}?`, `My ${p.relationship}`, pick(`My ${p.relationship}`, relations, i), { photo_url: p.photo_url ?? null }));
    } else if (type === "routine_recall") {
      const steps = DAY.map((d) => d.title as string);
      questions = steps.slice(0, 4).map((title, i) =>
        question(DAY[i].id, "routine", `What usually comes after ${title}?`, steps[i + 1], pick(steps[i + 1], steps.filter((s) => s !== title), i)));
    } else if (type === "event_recall" || type === "memory_quiz") {
      questions = QUIZ.map((q) => question(q.id, "personal", q.question, q.answer, [...q.choices], { memory_id: q.memory }));
    } else if (type === "picture_matching") {
      return { ...base, questions: [], message: "There are no photos saved for this game yet. Ana can add some." };
    } else {
      throw new DemoHubError(404, "Unknown game");
    }
    return { ...base, questions };
  }

  function nextTrivia(): TriviaPrompt | null {
    const t = TRIVIA[triviaTurn++ % TRIVIA.length];
    const p = personById(t.person);
    return {
      id: t.id, kind: t.kind, topic: t.topic, question: t.question, answer: t.answer,
      choices: t.choices ? JSON.stringify(t.choices) : null, memory_id: t.memory_id,
      difficulty: 1, source: "preloaded", is_active: 1, people: p ? [p] : [],
    };
  }

  const routes: [string, RegExp, Handler][] = [
    ["GET", /^\/patient$/, () => PROFILE],
    ["GET", /^\/settings$/, () => SETTINGS],
    ["GET", /^\/schedule\/today$/, () => scheduleToday()],
    ["GET", /^\/schedule\/next$/, () => scheduleToday().find((o) => o.occurrence_at >= toStamp(now())) ?? null],
    ["POST", /^\/schedule\/([^/]+)\/ack$/, ([, id], body) => {
      if (!["acknowledged", "dismissed", "snoozed"].includes(body?.response)) throw new DemoHubError(422, "bad response");
      const ack = { response: body.response as AckResponse, responded_at: toStamp(now()) };
      acks.set(`${decodeURIComponent(id)}|${body.occurrence_at}`, ack);
      return { id: `ack-${acks.size}`, schedule_item_id: decodeURIComponent(id), occurrence_at: body.occurrence_at, ...ack };
    }],
    ["GET", /^\/people$/, (_m, _b, query) =>
      (query.get("trust") ? PEOPLE.filter((p) => p.trust === query.get("trust")) : verified())],
    ["GET", /^\/people\/([^/]+)$/, ([, id]) => {
      const p = personById(decodeURIComponent(id));
      if (!p) throw new DemoHubError(404, "Person not found");
      return p;
    }],
    ["GET", /^\/memories$/, (_m, _b, query) => MEMORIES.filter((m) =>
      (!query.get("person_id") || m.person_id === query.get("person_id"))
      && (!query.get("trust") || m.trust === query.get("trust")))],
    ["POST", /^\/assistant\/ask$/, (_m, body) => ask(String(body?.text ?? ""))],
    // the demo cannot transcribe audio, so it answers a fixed question
    ["POST", /^\/assistant\/voice$/, () => ({ ...ask("Who is Ana?"), transcript: "Who is Ana? (demo: voice is not transcribed)" })],
    ["GET", /^\/medications\/today$/, () => dosesToday()],
    ["POST", /^\/medications\/logs\/([^/]+)$/, ([, id], body) => {
      if (!["taken", "skipped"].includes(body?.status)) throw new DemoHubError(422, "status must be taken or skipped");
      const dose = dosesToday().find((d) => d.id === decodeURIComponent(id));
      if (!dose) throw new DemoHubError(404, "Dose not found");
      doses.set(dose.id, { status: body.status, confirmed_by: "patient", responded_at: toStamp(now()) });
      return dosesToday().find((d) => d.id === dose.id);
    }],
    ["GET", /^\/games\/([^/]+)\/round$/, ([, type]) => {
      if (!GAME_TYPES.includes(type as ActivityKind)) throw new DemoHubError(404, "Unknown game");
      return gameRound(type as ActivityKind);
    }],
    ["POST", /^\/games\/result$/, (_m, body) => {
      activity.push(body);
      return { ok: true };
    }],
    ["GET", /^\/trivia\/next$/, () => nextTrivia()],
    // like the hub: engagement only, right or wrong is not accepted
    ["POST", /^\/trivia\/result$/, (_m, body) => {
      const asked = TRIVIA.find((t) => t.id === body?.question_id);
      if (!asked) throw new DemoHubError(404, "Question not found");
      if (!["completed", "skipped"].includes(body?.outcome)) throw new DemoHubError(422, "outcome must be one of completed, skipped");
      const row = {
        id: `act-${activity.length + 1}`, activity: "trivia_prompt", topic: asked.topic, question_ref: asked.id,
        outcome: body.outcome, difficulty: 1, duration_sec: body.duration_sec ?? null, created_at: toStamp(now()),
      };
      activity.push(row);
      return row;
    }],
  ];

  return {
    /** Same contract as the hub: resolves with the JSON body, rejects with a status. */
    async handle(method: string, path: string, body?: unknown): Promise<unknown> {
      const [bare, qs = ""] = path.split("?");
      for (const [m, pattern, handler] of routes) {
        const match = bare.match(pattern);
        if (m === method.toUpperCase() && match) return handler(match, body, new URLSearchParams(qs));
      }
      throw new DemoHubError(404, `The demo hub has no ${method} ${bare}`);
    },
    /** For tests: what the app logged. */
    activity,
  };
}
