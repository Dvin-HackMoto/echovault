// EchoVault mobile — Daily Question (PAT-8 on its own screen, Kali design: Trivia).
// Asks GET /trivia/next. The hub decides whether a question is allowed now
// (quiet hours, appointments, how often); "no question" is a normal answer.
// Optional and gentle: feedback is never a score.

import { router } from "expo-router";
import { Home, Images, RefreshCw } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { logTrivia, nextTrivia } from "../../src/api/trivia";
import { isRightAnswer, parseChoices } from "../../src/patient/logic";
import type { ActivityOutcome } from "../../src/types";
import { Btn, Card, DemoNote, EmptyState, KaliImage, KaliTip, Loading, Screen, TopBar, Txt } from "../../src/ui/kit";
import { t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { cardShadow, kc } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

export default function Trivia() {
  const L = useLang();
  const prompt = useHub(nextTrivia);
  const [reply, setReply] = useState<{ right: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const q = prompt.data;
  const choices = q ? parseChoices(q.choices) : [];

  function log(outcome: ActivityOutcome) {
    if (!q) return;
    logTrivia({ question_ref: q.id, outcome, topic: q.topic, duration_sec: Math.round((Date.now() - shownAt.current) / 1000) }).catch(() => {});
  }

  function choose(choice: string) {
    if (!q || reply) return;
    const right = isRightAnswer(choice, q.answer);
    setPicked(choice);
    setReply({ right, text: right ? t(L, "That's right!", "Tama!") : t(L, `It was ${q.answer}. What a nice memory.`, `Ito ay ${q.answer}. Magandang alaala.`) });
    log(right ? "correct" : "incorrect");
  }

  async function another() {
    if (q && !reply) log("skipped");
    setReply(null);
    setPicked(null);
    shownAt.current = Date.now();
    await prompt.reload();
  }

  const person = q?.people?.[0];
  return (
    <Screen header={<TopBar title={t(L, "Daily Question", "Tanong Ngayon")} sub={t(L, "Optional · just for fun", "Opsyonal · para sa saya")} onBack={() => router.back()} />} onRefresh={another}>
      <DemoNote feature="trivia" />
      {prompt.loading && !q && !prompt.error ? <Loading /> : null}
      {prompt.error ? <EmptyState pose="peek" title={t(L, "No questions right now", "Walang tanong ngayon")} body={prompt.error} /> : null}
      {!prompt.loading && !prompt.error && !q ? (
        <EmptyState
          pose="sleep"
          title={t(L, "That's all for now", "Iyan muna sa ngayon")}
          body={t(L, "There's no question right now. Come back a little later.", "Walang tanong ngayon. Bumalik mamaya.")}
          action={<Btn icon={Home} label={t(L, "Go home", "Umuwi")} onPress={() => router.replace("/home")} />}
        />
      ) : null}
      {q ? (
        <>
          <KaliImage pose="idea" size={140} />
          <Card style={{ marginTop: 8 }}>
            <Txt size={24} weight="extra" color={kc.navy} center>
              {q.question}
            </Txt>
          </Card>
          {choices.length ? (
            <View style={{ marginTop: 16, gap: 12 }}>
              {choices.map((c) => {
                const state = reply ? (isRightAnswer(c, q.answer) ? { backgroundColor: kc.greenBg, borderWidth: 2, borderColor: kc.greenMid } : picked === c ? { backgroundColor: kc.cream } : { opacity: 0.55 }) : null;
                return (
                  <Pressable
                    key={c}
                    disabled={!!reply}
                    onPress={() => choose(c)}
                    accessibilityRole="button"
                    style={[{ minHeight: 64, justifyContent: "center", borderRadius: 24, paddingHorizontal: 20, backgroundColor: kc.white, ...cardShadow }, state]}
                  >
                    <Txt size={20} weight="extra" color={kc.navy}>
                      {c}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          ) : !reply ? (
            <Btn
              variant="soft"
              label={t(L, "Show the answer", "Ipakita ang sagot")}
              style={{ marginTop: 16 }}
              onPress={() => {
                setReply({ right: true, text: q.answer });
                log("completed");
              }}
            />
          ) : null}
          {reply ? (
            <View style={{ marginTop: 16 }}>
              <KaliTip pose={reply.right ? "happy" : "hug"} tone="sky">
                {reply.text}
              </KaliTip>
            </View>
          ) : null}
          {person ? (
            <Btn
              variant="soft"
              icon={Images}
              label={t(L, `See ${person.nickname || person.name}`, `Tingnan si ${person.nickname || person.name}`)}
              style={{ marginTop: 16 }}
              onPress={() => router.push({ pathname: "/people/[id]", params: { id: person.id } })}
            />
          ) : null}
          <Btn variant={reply ? "navy" : "ghost"} icon={RefreshCw} label={reply ? t(L, "Another question", "Isa pang tanong") : t(L, "Skip", "Laktawan")} style={{ marginTop: 12 }} onPress={another} />
        </>
      ) : null}
    </Screen>
  );
}
