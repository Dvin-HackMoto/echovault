// EchoVault mobile — audio recording (ARCHITECTURE §5.1).
// Hold-to-talk recording that produces a file URI to upload to
// POST /assistant/voice. Uses expo-av per ARCHITECTURE, even though newer Expo
// SDKs favor expo-audio — expo-av is the documented, SDK-52-bundled choice.

import { Audio } from "expo-av";

import type { UploadFile } from "../api/client";

let activeRecording: Audio.Recording | null = null;

/** Request mic permission and configure the audio mode for recording. */
export async function prepare(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) return false;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  return true;
}

/** Start recording. No-op guard if one is already running. */
export async function startRecording(): Promise<void> {
  if (activeRecording) return;
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  activeRecording = recording;
}

/**
 * Stop recording and return a file part ready for `uploadFile`/`askVoice`,
 * or null if nothing was recording. The MIME/extension follow the preset
 * (m4a on both platforms by default).
 */
export async function stopRecording(): Promise<UploadFile | null> {
  if (!activeRecording) return null;
  const recording = activeRecording;
  activeRecording = null;
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) return null;
  return { uri, name: "question.m4a", type: "audio/m4a" };
}

/** Whether a recording is currently in progress. */
export function isRecording(): boolean {
  return activeRecording !== null;
}
