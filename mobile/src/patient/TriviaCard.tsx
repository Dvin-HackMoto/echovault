// EchoVault mobile — PAT-8: a small, optional question card at the bottom of
// the screen (Kali style).
//
// Asks GET /trivia/next every trivia_frequency_min minutes while the app is
// open. The hub decides whether a prompt is allowed (quiet hours,
// appointments); the app also keeps it off screen during a medication card, a
// game, Ask Kali or the Daily Question screen. Answering, opening photos or
// closing are all logged as activity "trivia_prompt". Feedback is gentle and
// never a score.

import { router, usePathname } from "expo-router";
import { Images, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { logTrivia, nextTrivia } from "../api/trivia";
import type { ActivityOutcome, TriviaPrompt } from "../types";
import { kali } from "../ui/kali";
import { Btn, IconBtn, Row, Txt } from "../ui/kit";
import { t } from "../ui/labels";
import { useLang } from "../ui/prefs";
import { kc } from "../ui/tokens";
import { usePatient } from "./context";
import { isRightAnswer, parseChoices, triviaAllowed } from "./logic";

/** The first prompt can come shortly after the app opens. */
const FIRST_CHECK_MS = 30 * 1000;

export default function TriviaCard() {
  const L = useLang();
  const insets = useSafeAreaInsets();
  const { settings, medicationCardOpen } = usePatient();
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<TriviaPrompt | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const shownAt = useRef(0);
  const allowed = useRef(true);
  allowed.current = triviaAllowed(pathname, medicationCardOpen) && pathname !== "/ask" && pathname !== "/trivia";

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

  function log(outcome: ActivityOutcome) {
    if (!prompt) return;
    logTrivia({
      question_ref: prompt.id,
      topic: prompt.topic,
      outcome,
      duration_sec: Math.round((Date.now() - shownAt.current) / 1000),
    }).catch(() => {});
  }

  function close(outcome: ActivityOutcome, delayMs = 0) {
    log(outcome);
    setTimeout(() => setPrompt(null), delayMs);
  }

  function choose(choice: string) {
    if (!prompt) return;
    const right = isRightAnswer(choice, prompt.answer);
    setReply(right ? t(L, "That's right! 🌟", "Tama! 🌟") : t(L, `Good try! It's ${prompt.answer}.`, `Magandang subok! Ito ay ${prompt.answer}.`));
    close(right ? "correct" : "incorrect", 3000);
  }

  function seePhotos() {
    const person = prompt?.people?.[0];
    close("completed");
    if (person) router.push({ pathname: "/people/[id]", params: { id: person.id } });
  }

  if (!prompt || !allowed.current) return null;
  const choices = parseChoices(prompt.choices);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.card, { bottom: insets.bottom + 96 }]}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row gap={8} style={{ flex: 1 }}>
          <Image source={kali.idea} style={{ width: 40, height: 40 }} resizeMode="contain" />
          <Txt size={15} weight="black" color={kc.primary} fixed>
            {t(L, "A little question", "Isang maliit na tanong")}
          </Txt>
        </Row>
        <IconBtn icon={X} label={t(L, "Close the question", "Isara")} onPress={() => close("skipped")} size={44} />
      </Row>
      <Txt size={19} weight="extra" color={kc.navy}>
        {prompt.question}
      </Txt>
      {reply ? (
        <Txt size={18} weight="extra" color={kc.green}>
          {reply}
        </Txt>
      ) : choices.length ? (
        choices.map((c) => (
          <Pressable key={c} onPress={() => choose(c)} accessibilityRole="button" style={styles.choice}>
            <Txt size={17} weight="extra" color={kc.navy}>
              {c}
            </Txt>
          </Pressable>
        ))
      ) : (
        <Btn
          variant="soft"
          size="md"
          label={t(L, "Show the answer", "Ipakita ang sagot")}
          onPress={() => {
            setReply(prompt.answer);
            close("completed", 4000);
          }}
        />
      )}
      {!reply && prompt.people?.length ? <Btn variant="ghost" size="md" icon={Images} label={t(L, "See photos", "Tingnan ang larawan")} onPress={seePhotos} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 14,
    right: 14,
    gap: 10,
    padding: 16,
    borderRadius: 28,
    backgroundColor: kc.white,
    borderWidth: 2,
    borderColor: kc.sky,
    shadowColor: kc.navy,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  choice: { minHeight: 52, justifyContent: "center", borderRadius: 18, paddingHorizontal: 16, backgroundColor: kc.sky },
});
