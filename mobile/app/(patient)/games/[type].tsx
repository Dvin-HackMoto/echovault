// EchoVault mobile — one round player for every game type (PAT-7, GAM-1..3).
// Every game type returns the same round (src/api/games.ts), so one player handles all.
// Feedback is encouraging for right and wrong answers; nothing is scored or graded.
// One result per round goes to /games/result (activity log, engagement only):
//   completed  the patient reached the end and answered at least one question
//   skipped    the patient reached the end but skipped every question
//   stopped    the patient left with Stop before the end

import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import { photoUri } from "../../../src/api/client";
import { getRound, postResult, type GameChoice, type GameRound } from "../../../src/api/games";
import BigButton from "../../../src/components/BigButton";
import { Notice } from "../../../src/components/Notice";
import { hubMessage } from "../../../src/patient/cached";
import { usePatient } from "../../../src/patient/context";
import { GAMES, isGameType, roundOutcome, unavailableMessage } from "../../../src/patient/games";
import { useTheme } from "../../../src/theme-context";
import type { ActivityOutcome } from "../../../src/types";

const PRAISE = ["That's right! 🌟", "Well done! 🌻", "Yes, that is it! 😊"];

export default function PlayGame() {
  const theme = useTheme();
  const { colors, fontSizes, spacing } = theme;
  const { hubUrl } = usePatient();
  const { type } = useLocalSearchParams<{ type: string }>();
  const game = GAMES.find((g) => g.type === type);
  const [round, setRound] = useState<GameRound | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ right: boolean; text: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(Date.now());
  const answered = useRef(0);
  const logged = useRef(false);

  const load = useCallback(async () => {
    setRound(null);
    setFailure(null);
    setIndex(0);
    setFeedback(null);
    setFinished(false);
    answered.current = 0;
    logged.current = false;
    if (!isGameType(type)) {
      setFailure("That game does not exist.");
      return;
    }
    try {
      setRound(await getRound(type));
      startedAt.current = Date.now();
    } catch (e) {
      setFailure(`${hubMessage(e)} Please try again later.`);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const playable = round?.available ? round.questions : [];
  const question = playable[index];
  const promptPhoto = question ? photoUri(hubUrl, question.photo_url) : null;

  /** One row per round; never twice for the same round. */
  function log(outcome: ActivityOutcome) {
    if (!round || !round.available || logged.current) return;
    logged.current = true;
    postResult({
      activity: round.activity,
      topic: round.topic,
      outcome,
      difficulty: round.difficulty,
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
    }).catch(() => {}); // a lost log entry must never interrupt the game
  }

  function next() {
    setFeedback(null);
    if (index + 1 < playable.length) {
      setIndex(index + 1);
    } else {
      setFinished(true);
      log(roundOutcome(answered.current));
    }
  }

  function choose(choice: GameChoice) {
    if (!question || feedback) return;
    answered.current += 1;
    const right = choice.id === question.answer_id;
    setFeedback(right
      ? { right, text: PRAISE[index % PRAISE.length] }
      : { right, text: `Good try! It's ${question.answer_label}.` });
  }

  function reveal() {
    if (!question || feedback) return;
    answered.current += 1;
    setFeedback({ right: true, text: question.answer_label });
  }

  function stop() {
    if (!finished && question) log("stopped");
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: game?.title ?? "Game" }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        {!round && !failure ? <ActivityIndicator size="large" style={{ marginTop: spacing.xl }} /> : null}
        {failure ? <Notice tone="warning" text={failure} /> : null}

        {round && !playable.length ? (
          <Text style={{ fontSize: fontSizes.button, color: colors.fg }}>{unavailableMessage(round.reason)}</Text>
        ) : null}

        {finished ? (
          <View style={{ gap: spacing.md }}>
            <Text style={{ fontSize: fontSizes.title, fontWeight: "700", color: colors.fg }}>All done! 🌼</Text>
            <Text style={{ fontSize: fontSizes.button, color: colors.fg }}>Thank you for playing.</Text>
            <BigButton label="Play again" onPress={load} theme={theme} />
          </View>
        ) : null}

        {question && !finished ? (
          <>
            <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>
              Question {index + 1} of {playable.length}
            </Text>
            {promptPhoto ? (
              <Image
                source={{ uri: promptPhoto }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: theme.radii.lg, backgroundColor: colors.card }}
                accessibilityLabel="A photo for this question"
              />
            ) : null}
            <Text style={{ fontSize: fontSizes.title, fontWeight: "700", color: colors.fg }} accessibilityRole="header">
              {question.prompt}
            </Text>
            {feedback ? (
              <View
                accessibilityLiveRegion="polite"
                style={{
                  borderRadius: theme.radii.md,
                  padding: spacing.lg,
                  backgroundColor: feedback.right ? colors.successBg : colors.secondary,
                }}
              >
                <Text style={{ fontSize: fontSizes.button, fontWeight: "700", color: feedback.right ? colors.success : colors.onSecondary }}>
                  {feedback.text}
                </Text>
              </View>
            ) : !question.choices.length ? (
              <BigButton label="Show the answer" variant="secondary" onPress={reveal} theme={theme} />
            ) : question.choice_style === "photo" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                {question.choices.map((c) => {
                  const uri = photoUri(hubUrl, c.photo_url);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => choose(c)}
                      accessibilityRole="button"
                      accessibilityLabel={`Photo of ${c.label}`}
                      style={({ pressed }) => ({
                        width: "47%",
                        aspectRatio: 1,
                        borderRadius: theme.radii.lg,
                        borderWidth: 2,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        overflow: "hidden",
                        opacity: pressed ? 0.8 : 1,
                        alignItems: "center",
                        justifyContent: "center",
                      })}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} accessibilityIgnoresInvertColors />
                      ) : (
                        // no photo on this device: fall back to the name so the choice is still usable
                        <Text style={{ fontSize: fontSizes.button, color: colors.fg, textAlign: "center", padding: spacing.sm }}>
                          {c.label}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              question.choices.map((c) => (
                <BigButton key={c.id} label={c.label} variant="secondary" onPress={() => choose(c)} theme={theme} />
              ))
            )}
            {feedback ? <BigButton label="Next" onPress={next} theme={theme} /> : null}
          </>
        ) : null}
      </ScrollView>

      {/* always visible, outside the scrolling area */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.md,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        {question && !finished && !feedback ? (
          <View style={{ flex: 1 }}>
            <BigButton label="Skip" variant="secondary" onPress={next} theme={theme} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <BigButton label={finished || !question ? "Back" : "Stop"} variant="secondary" onPress={stop} theme={theme} />
        </View>
      </View>
    </View>
  );
}
