// EchoVault mobile — games API.
// Wired to the ARCHITECTURE-named routes (GET /games/{type}/round, POST
// /games/result) pending the backend Games module. All calls go through the
// shared client.

import { get, post } from "./client";
import type {
  ActivityKind,
  ActivityOutcome,
  Difficulty,
  TriviaQuestion,
} from "../types";

/** A round question; `photo_url` is set for photo games (ASSUMED). */
export interface GameQuestion extends TriviaQuestion {
  photo_url?: string | null;
}

/** The playable round the generators build from verified data. */
export interface GameRound {
  activity: ActivityKind;
  topic?: string | null;
  difficulty: Difficulty;
  questions: GameQuestion[];
  /** ASSUMED: set, with no questions, when there is not enough verified data. */
  message?: string | null;
}

/** Fetch a round for a game type. GET /games/{type}/round. */
export function getRound(type: ActivityKind): Promise<GameRound> {
  return get<GameRound>(`/games/${type}/round`);
}

/** Report the engagement result (no score stored). POST /games/result. */
export function postResult(result: {
  activity: ActivityKind;
  topic?: string | null;
  outcome: ActivityOutcome;
  difficulty?: number;
  duration_sec?: number;
  question_ref?: string;
}): Promise<void> {
  return post<void>("/games/result", result);
}
