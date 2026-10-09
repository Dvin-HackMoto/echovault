// EchoVault mobile — trivia API.
// Wired to the ARCHITECTURE-named route (GET /trivia/next) pending the backend
// Trivia module. All calls go through the shared client.

import { get } from "./client";
import type { TriviaQuestion } from "../types";

/**
 * The next prompt, or null when the hub suppresses it (quiet hours, a nearby
 * schedule item, or the frequency window not elapsed — ARCHITECTURE §9).
 */
export function nextTrivia(): Promise<TriviaQuestion | null> {
  return get<TriviaQuestion | null>("/trivia/next");
}
