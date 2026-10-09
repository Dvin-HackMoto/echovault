// EchoVault mobile — text-to-speech (ARCHITECTURE §5.6).
// TTS stays on the phone via expo-speech. Thin wrapper so screens can read an
// answer aloud and stop it.

import * as Speech from "expo-speech";

import type { Language } from "../types";

export interface SpeakOptions {
  /** BCP-47 language tag, e.g. "fil-PH" or "en-US". */
  language?: string;
  /** Speech rate (1.0 = normal). Slightly slower reads clearer for elders. */
  rate?: number;
  pitch?: number;
  /** Called when speech ends for any reason: finished, stopped or failed. */
  onDone?: () => void;
}

/**
 * Voice for the patient's profile language. Mixed "fil-en" uses the phone's
 * default voice, which reads both acceptably; phones without a Filipino voice
 * fall back to their default.
 */
export function voiceLanguage(language?: Language | null): string | undefined {
  if (language === "en") return "en-US";
  if (language === "fil") return "fil-PH";
  return undefined;
}

/** Read text aloud. Interrupts any current speech first. */
export function speak(text: string, options: SpeakOptions = {}): void {
  Speech.stop();
  Speech.speak(text, {
    language: options.language,
    rate: options.rate ?? 0.9,
    pitch: options.pitch,
    onDone: options.onDone,
    onStopped: options.onDone,
    onError: options.onDone,
  });
}

/** Stop any current speech. */
export function stop(): void {
  Speech.stop();
}

/** Whether TTS is currently speaking. */
export function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
