// EchoVault mobile — assistant (Ask) API.
// Wired to the ARCHITECTURE-named routes (POST /assistant/ask text, POST
// /assistant/voice audio) pending the backend Assistant module. All calls go
// through the shared client.

import { post, uploadFile } from "./client";
import type { UploadFile } from "./client";
import type { AnswerMode, Person } from "../types";

/**
 * The answer envelope (ARCHITECTURE §5.6): the phrased answer, any people to
 * show with photos, the records it was built from, and how it was produced.
 */
export interface AssistantAnswer {
  answer: string;
  answer_mode: AnswerMode;
  intent?: string | null;
  people: Person[];
  memory_ids: string[];
  /** ASSUMED: /assistant/voice also returns what it heard. */
  transcript?: string;
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
