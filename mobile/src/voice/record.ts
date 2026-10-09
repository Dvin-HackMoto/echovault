// EchoVault mobile — audio recording (ARCHITECTURE §5.1).
// Hold-to-talk recording that produces a file to upload to POST
// /assistant/voice. ARCHITECTURE names expo-av; it was removed from recent
// Expo SDKs, so this uses its replacement, expo-audio (SDK 57, works in Expo Go).
// Press-in: start(). Release: stop() returns the file part for askVoice().

import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useRef } from "react";

import type { UploadFile } from "../api/client";

/** Shorter than this is almost always an accidental tap. */
const MIN_RECORDING_MS = 600;

export function useHoldToTalk() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { isRecording } = useAudioRecorderState(recorder);
  const starting = useRef<Promise<void> | null>(null);
  const startedAt = useRef(0);

  async function start(): Promise<void> {
    startedAt.current = Date.now();
    starting.current = (async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    })();
    await starting.current;
  }

  /**
   * Stop and return a file part ready for `askVoice`, or null if it was too
   * short. HIGH_QUALITY records m4a (AAC) on both platforms.
   */
  async function stop(): Promise<UploadFile | null> {
    // a quick tap can release before recording has started; wait for it first
    await starting.current?.catch(() => {});
    starting.current = null;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (Date.now() - startedAt.current < MIN_RECORDING_MS || !recorder.uri) return null;
    return { uri: recorder.uri, name: "question.m4a", type: "audio/m4a" };
  }

  return { isRecording, start, stop };
}

/** Ask for the microphone. The caller explains why before asking. */
export async function ensureMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

/** True if permission was already given earlier (no prompt). */
export async function hasMicPermission(): Promise<boolean> {
  const { granted } = await getRecordingPermissionsAsync();
  return granted;
}
