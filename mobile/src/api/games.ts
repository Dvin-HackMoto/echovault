// EchoVault mobile — games API (backend features/games, Module 09).
// GET /games/{type}/round and POST /games/result. All calls go through the shared client.
//
// Every game type returns the same GameRound shape, so one player screen handles all six.
// The round includes the answer so feedback works without another request; the hub
// never scores anything, and results are stored as engagement only.

import { get, post } from "./client";
import type { ActivityKind, ActivityOutcome, Difficulty, GameTopic } from "../types";

/** The playable game types (trivia_prompt is logged by the trivia popups, not here). */
export type GameType = Exclude<ActivityKind, "trivia_prompt">;

export const GAME_TYPES: readonly GameType[] = [
  "family_matching",
  "name_recall",
  "event_recall",
  "routine_recall",
  "picture_matching",
  "memory_quiz",
];

/** Why a round can't be played right now. */
export type RoundUnavailableReason = "not_enough_data" | "topic_not_selected";

export interface GameChoice {
  id: string;
  label: string;
  /** Hub-relative ("/photos/..."); prepend the hub base URL. */
  photo_url: string | null;
}

export interface GameQuestion {
  /** Stable reference to the source row; can be sent back as question_ref. */
  id: string;
  prompt: string;
  /** Picture shown with the prompt (name_recall, picture_matching, events). */
  photo_url: string | null;
  /** "photo": render choices as photos, use label as accessible text. "text": buttons. */
  choice_style: "photo" | "text";
  /** Empty array = open recall: let the patient think, then reveal answer_label. */
  choices: GameChoice[];
  /** null only for open recall. */
  answer_id: string | null;
  answer_label: string;
}

export interface GameRound {
  activity: GameType;
  topic: GameTopic | null;
  difficulty: Difficulty;
  available: boolean;
  /** Set when available is false. */
  reason: RoundUnavailableReason | null;
  questions: GameQuestion[];
}

/** One row per round. Send completed, skipped or stopped. */
export interface GameResult {
  activity: GameType;
  outcome: ActivityOutcome;
  topic?: GameTopic | null;
  difficulty?: Difficulty;
  duration_sec?: number;
  question_ref?: string;
}

/** Fetch a round for a game type. GET /games/{type}/round. */
export function getRound(type: GameType): Promise<GameRound> {
  return get<GameRound>(`/games/${type}/round`);
}

/** Report the engagement result (no score stored). POST /games/result. */
export function postResult(result: GameResult): Promise<void> {
  return post<void>("/games/result", result);
}
