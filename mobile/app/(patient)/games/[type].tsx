// EchoVault mobile â€” one round player for every game type (PAT-7, Kali design: Game).
//
// Plays the hub's round shape (features/games): text or photo choices, or open
// recall ("Show the answer") when a question has no choices. Feedback is
// encouraging for right and wrong answers. One result per round goes to
// /games/result as engagement only: completed, stopped part-way, or skipped
// (left before answering anything). Nothing is scored or shown as a number.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check, LogOut, SkipForward } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { photoUri } from "../../../src/api/client";
import { getRound, postResult, type GameChoice, type GameRound } from "../../../src/api/games";
import { hubMessage } from "../../../src/patient/cached";
import { usePatient } from "../../../src/patient/context";
import { GAMES, isGameType } from "../../../src/patient/games";
import type { ActivityOutcome } from "../../../src/types";
import { kali } from "../../../src/ui/kali";
import { Avatar, Btn, EmptyState, KaliImage, KaliTip, Loading, Row, Screen, TopBar, Txt } from "../../../src/ui/kit";
import { t } from "../../../src/ui/labels";
import { useLang } from "../../../src/ui/prefs";
import { cardShadow, kc, paletteFor } from "../../../src/ui/tokens";

type Phase = "intro" | "play" | "done";

export default function PlayGame() {
  const L = useLang();
  const { hubUrl, name } = usePatient();
  const { type } = useLocalSearchParams<{ type: string }>();
  const game = GAMES.find((g) => g.type === type);
  const [phase, setPhase] = useState<Phase>("intro");
  const [round, setRound] = useState<GameRound | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const answered = useRef(0);
  const startedAt = useRef(Date.now());
  const logged = useRef(false);

  const load = useCallback(async () => {
    setRound(null);
    setFailure(null);
    setIndex(0);
    setPicked(null);
    setRevealed(false);
    answered.current = 0;
    logged.current = false;
    if (!isGameType(type)) {
      setFailure(t(L, "That game doesn't exist.", "Walang ganoong laro."));
      return;
    }
    try {
      setRound(await getRound(type));
    } catch (e) {
      setFailure(hubMessage(e));
    }
  }, [type, L]);

  // a tab screen stays mounted: start fresh each time the game is opened
  useFocusEffect(
    useCallback(() => {
      setPhase("intro");
      load();
    }, [load]),
  );

  function log(outcome: ActivityOutcome) {
    if (!round || logged.current) return;
    logged.current = true;
    postResult({
      activity: round.activity,
      topic: round.topic,
      outcome,
      difficulty: round.difficulty,
      duration_sec: Math.round((Date.now() - startedAt.current) / 1000),
    }).catch(() => {}); // a lost log entry must never interrupt the game
  }

  const question = round?.questions[index];

  function next() {
    setPicked(null);
    setRevealed(false);
    if (round && index + 1 < round.questions.length) setIndex(index + 1);
    else {
      log("completed");
      setPhase("done");
    }
  }

  function choose(choice: GameChoice) {
    if (picked) return;
    answered.current += 1;
    setPicked(choice.id);
  }

  function exit() {
    if (phase === "play") log(answered.current ? "stopped" : "skipped");
    router.back();
  }

  function playAgain() {
    load();
    startedAt.current = Date.now();
    setPhase("play");
  }

  const right = !!question && !!picked && picked === question.answer_id;
  const title = game ? t(L, game.title, game.titleFil) : t(L, "Game", "Laro");

  if (phase === "intro") {
    return (
      <Screen header={<TopBar title={title} onBack={() => router.back()} />}>
        <KaliImage pose={game?.pose ?? "reading"} size={160} />
        <Txt size={24} weight="black" color={kc.navy} center style={{ marginTop: 12 }}>
          {t(L, "How to play", "Paano maglaro")}
        </Txt>
        <Txt size={19} center style={{ marginTop: 8 }}>
          {game ? t(L, game.about, game.aboutFil) : ""} {t(L, "Take your time â€” there are no timers and no wrong turns. You can skip any question.", "Dahan-dahan lang â€” walang oras. Maaari kang lumaktaw.")}
        </Txt>
        {!round && !failure ? <Loading /> : null}
        {failure ? <EmptyState pose="peek" title={t(L, "This game isn't ready", "Hindi pa handa ang laro")} body={failure} /> : null}
        {round && !round.available ? (
          <EmptyState
            pose="peek"
            title={t(L, "Not ready yet", "Hindi pa handa")}
            body={
              round.reason === "topic_not_selected"
                ? t(L, "Your family has turned this game off for now.", "Pinatay muna ng pamilya ang larong ito.")
                : t(L, "There isn't enough saved yet to play this. Your family can add more.", "Kulang pa ang naka-save. Maaaring magdagdag ang pamilya.")
            }
          />
        ) : null}
        {round?.available && round.questions.length ? (
          <Btn
            label={t(L, "Start", "Simulan")}
            style={{ marginTop: 24 }}
            onPress={() => {
              startedAt.current = Date.now();
              setPhase("play");
            }}
          />
        ) : null}
      </Screen>
    );
  }

  if (phase === "done") {
    return (
      <Screen header={<TopBar title={title} sub={t(L, "All done", "Tapos na")} />}>
        <KaliImage pose="happy" size={180} style={{ marginTop: 16 }} />
        <Txt size={28} weight="black" color={kc.navy} center style={{ marginTop: 12 }}>
          {t(L, `Lovely work${name ? `, ${name}` : ""}!`, `Ang galing${name ? `, ${name}` : ""}!`)}
        </Txt>
        <Txt size={19} center style={{ marginTop: 8 }}>
          {t(L, "Thank you for spending time with your memories today.", "Salamat sa pag-alala ngayong araw.")}
        </Txt>
        <Btn label={t(L, "Play again", "Maglaro ulit")} style={{ marginTop: 24 }} onPress={playAgain} />
        <Btn variant="ghost" label={t(L, "Back to games", "Bumalik sa mga laro")} style={{ marginTop: 12 }} onPress={() => router.back()} />
      </Screen>
    );
  }

  const photo = question ? photoUri(hubUrl, question.photo_url) : null;
  return (
    <Screen
      header={
        <TopBar
          title={title}
          sub={round ? t(L, `Question ${index + 1} of ${round.questions.length}`, `Tanong ${index + 1} sa ${round.questions.length}`) : undefined}
          right={<Btn variant="ghost" size="md" icon={LogOut} label={t(L, "Exit", "Lumabas")} onPress={exit} />}
        />
      }
    >
      {question ? (
        <>
          {photo ? (
            <View style={{ alignItems: "center" }}>
              <Image source={{ uri: photo }} style={{ width: 180, height: 180, borderRadius: 28, backgroundColor: kc.sky }} accessibilityLabel={t(L, "A photo for this question", "Larawan para sa tanong")} />
            </View>
          ) : null}
          <Txt size={24} weight="extra" color={kc.navy} center style={{ marginTop: 16 }} accessibilityRole="header">
            {question.prompt}
          </Txt>

          {question.choices.length === 0 ? (
            revealed ? (
              <View style={[styles.choice, styles.right, { marginTop: 20 }]}>
                <Txt size={22} weight="extra" color={kc.navy}>
                  {question.answer_label}
                </Txt>
              </View>
            ) : (
              <Btn variant="soft" label={t(L, "Show the answer", "Ipakita ang sagot")} style={{ marginTop: 20 }} onPress={() => { answered.current += 1; setRevealed(true); }} />
            )
          ) : question.choice_style === "photo" ? (
            <View style={styles.photoGrid}>
              {question.choices.map((c) => {
                const state = picked ? (c.id === question.answer_id ? styles.right : picked === c.id ? styles.tried : styles.dim) : null;
                const uri = photoUri(hubUrl, c.photo_url);
                return (
                  <Pressable key={c.id} disabled={!!picked} onPress={() => choose(c)} accessibilityRole="button" accessibilityLabel={c.label} style={[styles.photoChoice, state]}>
                    <View style={{ aspectRatio: 1, width: "100%" }}>
                      <Avatar fill name={c.label} colors={paletteFor(c.id)} uri={uri} rounded={18} size={120} />
                    </View>
                    {picked ? (
                      <Txt size={17} weight="extra" color={kc.navy} center style={{ marginTop: 6 }}>
                        {c.label}
                      </Txt>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ marginTop: 20, gap: 12 }}>
              {question.choices.map((c) => {
                const isAnswer = c.id === question.answer_id;
                const state = picked ? (isAnswer ? styles.right : picked === c.id ? styles.tried : styles.dim) : null;
                return (
                  <Pressable key={c.id} disabled={!!picked} onPress={() => choose(c)} accessibilityRole="button" style={[styles.choice, state]}>
                    <Txt size={20} weight="extra" color={kc.navy} style={{ flex: 1 }}>
                      {c.label}
                    </Txt>
                    {picked && isAnswer ? <Check size={24} color={kc.green} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {picked ? (
            <View style={{ marginTop: 16 }}>
              <KaliTip pose={right ? "happy" : "hug"} tone={right ? "sky" : "blush"}>
                {right ? t(L, "Yes, that's right! Wonderful.", "Tama! Ang galing.") : t(L, `Good try. It's ${question.answer_label}. Thank you for playing along.`, `Magandang subok. Ito ay ${question.answer_label}.`)}
              </KaliTip>
            </View>
          ) : null}

          <Row gap={8} style={{ marginTop: 20 }}>
            {!picked && !revealed ? <Btn variant="ghost" icon={SkipForward} label={t(L, "Skip", "Laktawan")} onPress={next} style={{ flex: 1 }} /> : null}
            <Btn label={t(L, "Next", "Susunod")} disabled={!picked && !revealed} onPress={next} style={{ flex: 2 }} />
          </Row>
        </>
      ) : (
        <Image source={kali.reading} style={{ width: 120, height: 120, alignSelf: "center" }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: "row", alignItems: "center", minHeight: 64, borderRadius: 24, paddingHorizontal: 20, backgroundColor: kc.white, ...cardShadow },
  right: { backgroundColor: kc.greenBg, borderWidth: 2, borderColor: kc.greenMid },
  tried: { backgroundColor: kc.cream },
  dim: { opacity: 0.55 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 },
  photoChoice: { width: "47%", flexGrow: 1, borderRadius: 24, padding: 8, backgroundColor: kc.white, ...cardShadow },
});
