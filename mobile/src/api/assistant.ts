// EchoVault mobile — assistant (Ask) API.
// Typed against the REAL backend (backend/app/features/assistant/router.py):
//   POST /assistant/ask {text}          patient or caregiver
//   POST /assistant/voice (audio file)  patient or caregiver
//   GET  /assistant/log                 caregiver only
//   POST /assistant/log/{id}/flag       caregiver only (not a viewer)
// All calls go through the shared client.

import { get, post, uploadFile } from "./client";
import type { UploadFile } from "./client";
import type { AnswerMode, AssistantLog, Person, Trust } from "../types";

/**
 * The answer envelope (ARCHITECTURE §5.6): the phrased answer, any people to
 * show with photos, the records it was built from, and how it was produced.
 */
export interface AssistantAnswer {
  answer: string;
  answer_mode: AnswerMode;
  /** who_is | next_event | medication | general; null when a recording was not understood. */
  intent?: string | null;
  people: Person[];
  /** Ids of every record the answer was built from: memories, people, schedule items, medications. */
  memory_ids: string[];
  /** /assistant/voice only: what the hub heard. "" when it could not make out any words. */
  transcript?: string;
}

/** One record an answer was built from. `deleted`: the record has been removed since. */
export interface AnswerRecord {
  id: string;
  type: "memory" | "person" | "schedule_item" | "medication" | "deleted";
  /** Memory title, person name, schedule item title or medicine name. */
  label: string | null;
  /** Memory content, relationship, starts_at or dose. */
  detail: string | null;
  /** Memories and people only. */
  trust: Trust | null;
}

/** An assistant_log row with the records its answer used, for caregiver review. */
export interface AnswerLogEntry extends AssistantLog {
  records: AnswerRecord[];
}

// The hub may wait ~8 s for the local LLM before falling back, so allow longer.
const ASK_TIMEOUT_MS = 20000;
// Voice adds transcription (faster-whisper) on top.
const VOICE_TIMEOUT_MS = 35000;

/** Ask a text question. POST /assistant/ask {text}. */
export function ask(text: string): Promise<AssistantAnswer> {
  return post<AssistantAnswer>("/assistant/ask", { text }, { timeoutMs: ASK_TIMEOUT_MS });
}

/**
 * Ask by voice. POST /assistant/voice with a recorded audio file (multipart);
 * the hub transcribes it (faster-whisper) and runs the same pipeline.
 */
export function askVoice(audio: UploadFile): Promise<AssistantAnswer> {
  return uploadFile<AssistantAnswer>("/assistant/voice", "audio", audio, {}, VOICE_TIMEOUT_MS);
}

/** Recent questions and answers, newest first. Caregiver only. */
export function listAnswers(options: { limit?: number; flagged?: boolean } = {}): Promise<AnswerLogEntry[]> {
  const query = [
    options.limit != null ? `limit=${options.limit}` : "",
    options.flagged != null ? `flagged=${options.flagged}` : "",
  ].filter(Boolean).join("&");
  return get<AnswerLogEntry[]>(`/assistant/log${query ? `?${query}` : ""}`);
}

/** Mark an answer as wrong, or clear the mark with `flagged: false`. Caregiver only. */
export function flagAnswer(id: string, flagged = true): Promise<AnswerLogEntry> {
  return post<AnswerLogEntry>(`/assistant/log/${encodeURIComponent(id)}/flag`, { flagged });
}
