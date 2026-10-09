// EchoVault mobile — decisions the patient screens make (Module 14).
// Kept free of React Native so they are unit-tested in tests/logic.test.ts.

import { fromStamp } from "../time";
import type { Dose, ScheduleOccurrence } from "../types";

// ───────────────────────────── PAT-6 medication card ─────────────────────────────

/** A dose stays on the card this long after its time; older ones are for the caregiver. */
export const DOSE_CARD_WINDOW_MS = 3 * 60 * 60 * 1000;

/** The dose to show: due, unanswered, recent, and not put off with "later". */
export function dueDose(doses: Dose[], now: Date, laterUntil: Record<string, number>): Dose | null {
  return doses
    .filter((d) => d.status === "unconfirmed")
    .filter((d) => {
      const due = fromStamp(d.due_at).getTime();
      return due <= now.getTime() && now.getTime() - due <= DOSE_CARD_WINDOW_MS;
    })
    .filter((d) => (laterUntil[d.id] ?? 0) <= now.getTime())
    .sort((a, b) => a.due_at.localeCompare(b.due_at))[0] ?? null;
}

// ───────────────────────────── PAT-1 / PAT-4 schedule ────────────────────────────

export type TimeState = "past" | "now" | "upcoming";

// an item without a duration counts as "now" for this long after it starts
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

export function timeState(item: ScheduleOccurrence, now: Date): TimeState {
  const start = fromStamp(item.occurrence_at).getTime();
  const end = item.ends_at ? fromStamp(item.ends_at).getTime() : start + DEFAULT_DURATION_MS;
  if (now.getTime() < start) return "upcoming";
  return now.getTime() < end ? "now" : "past";
}

/** What is happening now and next, for the home screen. */
export function comingUp(items: ScheduleOccurrence[], now: Date, count: number): ScheduleOccurrence[] {
  return items.filter((i) => timeState(i, now) !== "past").slice(0, count);
}

/** A cached "today" list from another day must not be shown as today. */
export function isForDay(items: ScheduleOccurrence[], now: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return items.every((i) => i.occurrence_at.startsWith(day));
}

// ──────────────────────────── PAT-7 / PAT-8 questions ────────────────────────────

/**
 * Answer choices for a game or trivia question. The schema stores them as a
 * JSON array string (trivia_questions.choices); an array is accepted too.
 * Empty means open recall ("Show the answer").
 */
export function parseChoices(choices: string | string[] | null | undefined): string[] {
  if (Array.isArray(choices)) return choices.map(String);
  if (!choices) return [];
  try {
    const parsed: unknown = JSON.parse(choices);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Answers match ignoring case and surrounding spaces. */
export function isRightAnswer(choice: string, answer: string): boolean {
  return choice.trim().toLowerCase() === answer.trim().toLowerCase();
}

/** No trivia card while a medication card or a game is on screen. */
export function triviaAllowed(pathname: string, medicationCardOpen: boolean): boolean {
  return !medicationCardOpen && !pathname.startsWith("/games");
}
