// EchoVault mobile — trivia API.
// The hub's trivia routes (backend/app/features/trivia/router.py). All calls go
// through the shared client.

import { del, get, post, put } from "./client";
import type { ActivityLog, Difficulty, TriviaKind, TriviaPrompt, TriviaQuestion, TriviaSource } from "../types";

/**
 * The next prompt, or null when the hub suppresses it (quiet hours, a nearby
 * schedule item, or the frequency window not elapsed — ARCHITECTURE §9).
 */
export function nextTrivia(): Promise<TriviaPrompt | null> {
  return get<TriviaPrompt | null>("/trivia/next");
}

/**
 * What the patient did with a prompt. Engagement only: the hub does not accept
 * or store whether an answer was right.
 */
export type TriviaOutcome = "completed" | "skipped";

/**
 * Report a prompt's outcome. POST /trivia/result. The hub waits
 * `trivia_frequency_min` from this moment before the next prompt.
 */
export function postTriviaResult(result: {
  question_id: string;
  outcome: TriviaOutcome;
  duration_sec?: number;
}): Promise<ActivityLog> {
  return post<ActivityLog>("/trivia/result", result);
}

// ───────────────────────── caregiver: manage questions ─────────────────────

/**
 * Fields a caregiver can write. `choices` is sent as a list (the hub stores and
 * returns it as a JSON array string). personal, family and routine questions
 * need a `topic` from the game topics and the `memory_id` of a verified memory.
 */
export interface TriviaQuestionInput {
  kind?: TriviaKind;
  topic?: string | null;
  question?: string;
  answer?: string;
  choices?: string[] | null;
  memory_id?: string | null;
  difficulty?: Difficulty;
  is_active?: boolean | number;
}

export function listTriviaQuestions(
  filter: { source?: TriviaSource; kind?: TriviaKind; active_only?: boolean } = {},
): Promise<TriviaQuestion[]> {
  const query = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
  return get<TriviaQuestion[]>(query ? `/trivia/questions?${query}` : "/trivia/questions");
}

export function getTriviaQuestion(id: string): Promise<TriviaQuestion> {
  return get<TriviaQuestion>(`/trivia/questions/${id}`);
}

export function createTriviaQuestion(input: TriviaQuestionInput): Promise<TriviaQuestion> {
  return post<TriviaQuestion>("/trivia/questions", input);
}

/**
 * Partial update. A preloaded question only accepts `{ is_active }`; use
 * `setTriviaQuestionActive` for that.
 */
export function updateTriviaQuestion(id: string, input: TriviaQuestionInput): Promise<TriviaQuestion> {
  return put<TriviaQuestion>(`/trivia/questions/${id}`, input);
}

/** Switch a question off (or back on) without deleting it. Works for preloaded questions too. */
export function setTriviaQuestionActive(id: string, isActive: boolean): Promise<TriviaQuestion> {
  return put<TriviaQuestion>(`/trivia/questions/${id}`, { is_active: isActive });
}

/** Delete a caregiver-written question. The hub refuses to delete a preloaded one. */
export function deleteTriviaQuestion(id: string): Promise<void> {
  return del<void>(`/trivia/questions/${id}`);
}
