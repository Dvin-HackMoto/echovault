// EchoVault mobile — PAT-8: a small, optional question card at the bottom of
// the screen.
//
// Asks GET /trivia/next every trivia_frequency_min minutes while the app is
// open. The hub decides whether a prompt is allowed (quiet hours,
// appointments); the app also keeps it off screen during a medication card or
// a game. Answering, opening photos or closing are all reported to
// POST /trivia/result, which logs activity "trivia_prompt". Only engagement is
// sent (completed or skipped), never whether the answer was right. Feedback is
// gentle and never a score.

import { router, usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { nextTrivia, postTriviaResult, type TriviaOutcome } from "../api/trivia";
import BigButton from "../components/BigButton";
import { useTheme } from "../theme-context";
import type { TriviaPrompt } from "../types";
import { usePatient } from "./context";
import { isRightAnswer, parseChoices, triviaAllowed } from "./logic";

/** The first prompt can come shortly after the app opens. */
const FIRST_CHECK_MS = 30 * 1000;

export default function TriviaCard() {
  const theme = useTheme();
  const { settings, medicationCardOpen } = usePatient();
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<TriviaPrompt | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const shownAt = useRef(0);
  const allowed = useRef(true);
  allowed.current = triviaAllowed(pathname, medicationCardOpen);

  const check = useCallback(async () => {
    if (!allowed.current) return;
    try {
      const next = await nextTrivia();
      if (next && allowed.current) {
        shownAt.current = Date.now();
        setReply(null);
        setPrompt(next);
      }
    } catch {
      // trivia is optional: stay quiet on errors
    }
  }, []);

  useEffect(() => {
    const everyMs = Math.max(settings.trivia_frequency_min ?? 120, 1) * 60 * 1000;
    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(check, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [check, settings.trivia_frequency_min]);

  function log(outcome: TriviaOutcome) {
    if (!prompt) return;
    postTriviaResult({
      question_id: prompt.id,
      outcome,
      duration_sec: Math.round((Date.now() - shownAt.current) / 1000),
    }).catch(() => {});
  }

  function close(outcome: TriviaOutcome, delayMs = 0) {
    log(outcome);
    setTimeout(() => setPrompt(null), delayMs);
  }

  function choose(choice: string) {
    if (!prompt) return;
    const right = isRightAnswer(choice, prompt.answer);
    setReply(right ? "That's right! 🌟" : `Good try! It's ${prompt.answer}.`);
    close("completed", 3000);
  }

  function seePhotos() {
    const person = prompt?.people?.[0];
    close("completed");
    if (person) router.push({ pathname: "/people", params: { id: person.id } });
  }

  if (!prompt || !allowed.current) return null;
  const choices = parseChoices(prompt.choices);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        {
          left: theme.spacing.md,
          right: theme.spacing.md,
          bottom: theme.spacing.lg,
          backgroundColor: theme.colors.bg,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          borderColor: theme.colors.primary,
        },
      ]}
    >
      <View style={styles.top}>
        <Text style={{ fontSize: theme.fontSizes.body, color: theme.colors.primary, fontWeight: "700" }}>💭 A little question</Text>
        <Pressable
          onPress={() => close("skipped")}
          accessibilityRole="button"
          accessibilityLabel="Close the question"
          style={[styles.close, { minWidth: theme.touchTargets.min, minHeight: theme.touchTargets.min }]}
        >
          <Text style={{ fontSize: theme.fontSizes.button, color: theme.colors.muted }}>✕</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: theme.fontSizes.button, color: theme.colors.fg, fontWeight: "600" }}>{prompt.question}</Text>
      {reply ? (
        <Text style={{ fontSize: theme.fontSizes.button, color: theme.colors.success, fontWeight: "700" }}>{reply}</Text>
      ) : choices.length ? (
        choices.map((c) => <BigButton key={c} label={c} variant="secondary" onPress={() => choose(c)} theme={theme} />)
      ) : (
        <BigButton
          label="Show the answer"
          variant="secondary"
          onPress={() => {
            setReply(prompt.answer);
            close("completed", 4000);
          }}
          theme={theme}
        />
      )}
      {!reply && prompt.people?.length ? (
        <BigButton icon="🖼️" label="See photos" variant="secondary" onPress={seePhotos} theme={theme} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  close: { alignItems: "center", justifyContent: "center" },
});
