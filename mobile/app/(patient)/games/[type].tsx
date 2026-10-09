// EchoVault mobile — one round player for every game type (PAT-7).
// Each answered, skipped or stopped question is posted to /games/result
// (activity log). Feedback is encouraging for right and wrong answers; nothing
// is scored or graded, and the result is never shown as a number.

import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import { photoUri } from "../../../src/api/client";
import { getRound, postResult, type GameRound } from "../../../src/api/games";
import BigButton from "../../../src/components/BigButton";
import { DemoTag, Notice } from "../../../src/components/Notice";
import { hubMessage } from "../../../src/patient/cached";
import { usePatient } from "../../../src/patient/context";
import { GAMES, isGameType } from "../../../src/patient/games";
import { isRightAnswer, parseChoices } from "../../../src/patient/logic";
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
  const shownAt = useRef(Date.now());

  const load = useCallback(async () => {
    setRound(null);
    setFailure(null);
    setIndex(0);
    setFeedback(null);
    setFinished(false);
    if (!isGameType(type)) {
      setFailure("That game does not exist.");
      return;
    }
    try {
      setRound(await getRound(type));
      shownAt.current = Date.now();
    } catch (e) {
      setFailure(`${hubMessage(e)} Please try again later.`);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const question = round?.questions[index];
  const choices = question ? parseChoices(question.choices) : [];
  const photo = question ? photoUri(hubUrl, question.photo_url) : null;

  function log(outcome: ActivityOutcome) {
    if (!round) return;
    postResult({
      activity: round.activity,
      topic: round.topic,
      question_ref: question?.id,
      outcome,
      difficulty: round.difficulty,
      duration_sec: Math.round((Date.now() - shownAt.current) / 1000),
    }).catch(() => {}); // a lost log entry must never interrupt the game
  }

  function next() {
    setFeedback(null);
    shownAt.current = Date.now();
    if (round && index + 1 < round.questions.length) setIndex(index + 1);
    else setFinished(true);
  }

  function choose(label: string) {
    if (!question || feedback) return;
    const right = isRightAnswer(label, question.answer);
    log(right ? "correct" : "incorrect");
    setFeedback(right ? { right, text: PRAISE[index % PRAISE.length] } : { right, text: `Good try! It's ${question.answer}.` });
  }

  function reveal() {
    if (!question || feedback) return;
    log("completed");
    setFeedback({ right: true, text: question.answer });
  }

  function skip() {
    log("skipped");
    next();
  }

  function stop() {
    if (!finished && question) log("stopped");
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: game?.title ?? "Game" }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}>
        <DemoTag feature="games" />
        {!round && !failure ? <ActivityIndicator size="large" style={{ marginTop: spacing.xl }} /> : null}
        {failure ? <Notice tone="warning" text={failure} /> : null}

        {round && round.questions.length === 0 ? (
          <Text style={{ fontSize: fontSizes.button, color: colors.fg }}>
            {round.message ?? "There is not enough saved yet to play this game. Ask your caregiver to add more."}
          </Text>
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
              Question {index + 1} of {round?.questions.length}
            </Text>
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: theme.radii.lg, backgroundColor: colors.card }}
                accessibilityLabel="A photo for this question"
              />
            ) : null}
            <Text style={{ fontSize: fontSizes.title, fontWeight: "700", color: colors.fg }} accessibilityRole="header">
              {question.question}
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
            ) : choices.length ? (
              choices.map((c) => <BigButton key={c} label={c} variant="secondary" onPress={() => choose(c)} theme={theme} />)
            ) : (
              <BigButton label="Show the answer" variant="secondary" onPress={reveal} theme={theme} />
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
            <BigButton label="Skip" variant="secondary" onPress={skip} theme={theme} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <BigButton label={finished || !question ? "Back" : "Stop"} variant="secondary" onPress={stop} theme={theme} />
        </View>
      </View>
    </View>
  );
}
