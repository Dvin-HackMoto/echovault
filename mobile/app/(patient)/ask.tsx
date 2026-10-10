// EchoVault mobile — ask the assistant (PAT-2, PAT-3).
// Type a question and see the answer in large text with the people it
// mentions. Hold to talk, hear answers read aloud when voice is on, and stop
// speaking any time.

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, View } from "react-native";

import { ask, askVoice, type AssistantAnswer } from "../../src/api/assistant";
import BigButton from "../../src/components/BigButton";
import MicButton from "../../src/components/MicButton";
import { Notice } from "../../src/components/Notice";
import PersonCard from "../../src/components/PersonCard";
import { hubMessage, isUnreachable } from "../../src/patient/cached";
import { usePatient } from "../../src/patient/context";
import { useTheme } from "../../src/theme-context";
import type { UploadFile } from "../../src/api/client";
import { ensureMicPermission, hasMicPermission, useHoldToTalk } from "../../src/voice/record";
import { speak, stop as stopSpeaking, voiceLanguage } from "../../src/voice/speak";

const SUGGESTIONS = ["Who is Ana?", "What is next today?", "What medicine do I take?"];
const DIDNT_CATCH = "Sorry, I didn't catch that. You can type your question instead.";

type Phase = "idle" | "thinking" | "answered" | "error";

function messageFor(error: unknown, voice: boolean): string {
  if (isUnreachable(error)) return hubMessage(error);
  if (!voice) return hubMessage(error);
  return DIDNT_CATCH;
}

export default function Ask() {
  const theme = useTheme();
  const { colors, fontSizes, spacing } = theme;
  const { profile, voiceEnabled, hubUrl } = usePatient();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssistantAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const input = useRef<TextInput>(null);
  const mic = useHoldToTalk();
  const micAllowed = useRef<boolean | null>(null);
  const canUseMic = Platform.OS !== "web";

  useEffect(() => {
    if (canUseMic) {
      hasMicPermission()
        .then((ok) => {
          micAllowed.current = ok;
        })
        .catch(() => {});
    }
    return () => stopSpeaking();
  }, [canUseMic]);

  function readAloud(answer: string) {
    setSpeaking(true);
    speak(answer, { language: voiceLanguage(profile.language), onDone: () => setSpeaking(false) });
  }

  function stop() {
    stopSpeaking();
    setSpeaking(false);
  }

  function showAnswer(res: AssistantAnswer, asked: string) {
    setResult(res);
    setQuestion(asked);
    setPhase("answered");
    if (voiceEnabled) readAloud(res.answer);
  }

  async function send(q: string) {
    const asked = q.trim();
    if (!asked) return;
    stop();
    setPhase("thinking");
    try {
      showAnswer(await ask(asked), asked);
      setText("");
    } catch (e) {
      setError(messageFor(e, false));
      setPhase("error");
    }
  }

  async function micDown() {
    stop();
    if (micAllowed.current !== true) {
      // explain first, then ask Android for permission; the next hold records
      Alert.alert(
        "Use the microphone?",
        "EchoVault listens only while you hold the button, so you can ask by voice.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Allow",
            onPress: async () => {
              micAllowed.current = await ensureMicPermission();
            },
          },
        ],
      );
      return;
    }
    try {
      await mic.start();
    } catch {
      setError(DIDNT_CATCH);
      setPhase("error");
    }
  }

  async function micUp() {
    if (micAllowed.current !== true) return;
    let audio: UploadFile | null = null;
    try {
      audio = await mic.stop();
    } catch {
      audio = null;
    }
    if (!audio) {
      setError(DIDNT_CATCH);
      setPhase("error");
      input.current?.focus();
      return;
    }
    setPhase("thinking");
    try {
      const res = await askVoice(audio);
      if (!res.answer) throw new Error("empty answer");
      showAnswer(res, res.transcript ?? "");
      // the hub could not make out any words: its answer says so, and typing is ready
      if (res.transcript === "") input.current?.focus();
    } catch (e) {
      setError(messageFor(e, true));
      setPhase("error");
      input.current?.focus();
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 200 }}
      keyboardShouldPersistTaps="handled"
    >

      {phase === "thinking" ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: fontSizes.button, color: colors.fg }}>Thinking…</Text>
        </View>
      ) : null}

      {phase === "answered" && result ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: colors.card, borderRadius: theme.radii.lg, padding: spacing.lg, gap: spacing.md }}
        >
          {question ? <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>You asked: “{question}”</Text> : null}
          <Text style={{ fontSize: fontSizes.title, color: colors.fg, fontWeight: "600" }}>{result.answer}</Text>
          {result.people.map((p) => (
            <PersonCard key={p.id} person={p} hubUrl={hubUrl} patientView theme={theme} />
          ))}
          {voiceEnabled ? (
            speaking ? (
              <BigButton icon="⏹️" label="Stop reading" variant="secondary" onPress={stop} theme={theme} />
            ) : (
              <BigButton icon="🔊" label="Read it again" variant="secondary" onPress={() => readAloud(result.answer)} theme={theme} />
            )
          ) : null}
        </View>
      ) : null}

      {phase === "error" ? <Notice tone="warning" text={error} /> : null}

      {canUseMic ? (
        <MicButton
          recording={mic.isRecording}
          disabled={phase === "thinking"}
          onPressIn={micDown}
          onPressOut={micUp}
          showLabel
          theme={theme}
        />
      ) : null}

      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        placeholder="Type your question"
        placeholderTextColor={colors.muted}
        multiline
        accessibilityLabel="Your question"
        returnKeyType="send"
        onSubmitEditing={() => send(text)}
        submitBehavior="blurAndSubmit"
        style={{
          borderWidth: 2,
          borderColor: colors.border,
          borderRadius: theme.radii.md,
          padding: spacing.md,
          minHeight: 90,
          fontSize: fontSizes.button,
          color: colors.fg,
          backgroundColor: colors.bg,
          textAlignVertical: "top",
        }}
      />
      <BigButton label="Ask" onPress={() => send(text)} disabled={phase === "thinking" || !text.trim()} theme={theme} />

      <Text style={{ fontSize: fontSizes.body, color: colors.muted, marginTop: spacing.sm }}>You can ask:</Text>
      {SUGGESTIONS.map((s) => (
        <BigButton key={s} label={s} variant="secondary" onPress={() => send(s)} disabled={phase === "thinking"} theme={theme} />
      ))}
    </ScrollView>
  );
}
