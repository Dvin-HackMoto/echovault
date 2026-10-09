// EchoVault mobile — trivia API.
// Wired to the ARCHITECTURE-named route (GET /trivia/next) pending the backend
// Trivia module. All calls go through the shared client.

import { get, post } from "./client";
import type { ActivityOutcome, TriviaPrompt } from "../types";

/**
 * The next prompt, or null when the hub suppresses it (quiet hours, a nearby
 * schedule item, or the frequency window not elapsed — ARCHITECTURE §9).
 */
export function nextTrivia(): Promise<TriviaPrompt | null> {
  return get<TriviaPrompt | null>("/trivia/next");
}

/**
 * Log what happened to a prompt (activity "trivia_prompt", engagement only).
 * The games module rejects trivia results ("trivia prompts are logged by
 * features/trivia"), so this goes to the trivia module.
 * ASSUMED route: POST /trivia/result — confirm when the Trivia module lands.
 */
export function logTrivia(result: { question_ref: string; outcome: ActivityOutcome; topic?: string | null; duration_sec?: number }): Promise<void> {
  return post<void>("/trivia/result", { activity: "trivia_prompt", ...result });
}
