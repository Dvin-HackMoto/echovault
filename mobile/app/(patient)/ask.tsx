// EchoVault mobile â€” Ask Kali (PAT-2, PAT-3, Kali design: Chat).
// A conversation with the assistant: type or speak a question, see the answer
// in large text with where it came from, the people it mentions and the
// memories it used. Answers are read aloud when that preference is on, and the
// patient can stop reading at any time. Voice: tap the mic to start, tap Send
// to ask (easier than holding a button), Cancel to throw the recording away.

import { router } from "expo-router";
import { ChevronRight, Mic, Send, Square, Volume2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ask, askVoice, type AssistantAnswer } from "../../src/api/assistant";
import { photoUri } from "../../src/api/client";
import { listMemories } from "../../src/api/memories";
import { listPeople } from "../../src/api/people";
import { hubMessage, isUnreachable, withCache } from "../../src/patient/cached";
import { usePatient } from "../../src/patient/context";
import type { Memory, Person } from "../../src/types";
import { categoryIcon } from "../../src/ui/icons";
import { kali } from "../../src/ui/kali";
import { Avatar, Backdrop, GradientBox, Pill, Row, TopBar, Txt } from "../../src/ui/kit";
import { categoryHue, memoryTitle, t } from "../../src/ui/labels";
import { usePrefs } from "../../src/ui/prefs";
import { COMPANION, fonts, kc, paletteFor } from "../../src/ui/tokens";
import { ensureMicPermission, hasMicPermission, useHoldToTalk } from "../../src/voice/record";
import { speak, stop as stopSpeaking, voiceLanguage } from "../../src/voice/speak";

type Msg =
  | { id: number; from: "me"; text: string }
  | { id: number; from: "kali"; text: string; result?: AssistantAnswer; error?: boolean };

const SOURCE: Record<AssistantAnswer["answer_mode"], { en: string; fil: string; bg: string; fg: string }> = {
  template: { en: "From your saved records", fil: "Mula sa iyong mga tala", bg: kc.greenBg, fg: kc.green },
  llm: { en: "From your saved records", fil: "Mula sa iyong mga tala", bg: kc.greenBg, fg: kc.green },
  fallback: { en: "From your saved records", fil: "Mula sa iyong mga tala", bg: kc.greenBg, fg: kc.green },
  no_data: { en: "Not in your saved memories", fil: "Wala sa iyong mga alaala", bg: kc.sky, fg: kc.navy },
};

export default function Ask() {
  const { prefs, zoom } = usePrefs();
  const L = prefs.lang;
  const { name, profile, hubUrl } = usePatient();
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "kali", text: t(L, `Hello${name ? ` ${name}` : ""}! What would you like to remember today?`, `Kumusta${name ? ` ${name}` : ""}! Ano ang gusto mong alalahanin ngayon?`) },
  ]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const scroller = useRef<ScrollView>(null);
  const nextId = useRef(1);
  const mic = useHoldToTalk();
  const micAllowed = useRef<boolean | null>(null);
  const canUseMic = Platform.OS !== "web" && prefs.voice;

  useEffect(() => {
    withCache("people", () => listPeople("verified")).then((r) => setPeople(r.data)).catch(() => {});
    withCache("memories-verified", () => listMemories({ trust: "verified" })).then((r) => setMemories(r.data)).catch(() => {});
    if (canUseMic) {
      hasMicPermission()
        .then((ok) => {
          micAllowed.current = ok;
        })
        .catch(() => {});
    }
    return () => stopSpeaking();
  }, [canUseMic]);

  useEffect(() => {
    const timer = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [msgs, thinking]);

  const first = people.find((p) => !p.is_caregiver) ?? people[0];
  const suggestions = [
    first ? t(L, `Who is ${first.nickname || first.name}?`, `Sino si ${first.nickname || first.name}?`) : null,
    t(L, "What is next today?", "Ano ang susunod ngayon?"),
    t(L, "What medicine do I take?", "Anong gamot ang iinumin ko?"),
    t(L, "What am I doing today?", "Ano ang gagawin ko ngayon?"),
  ].filter(Boolean) as string[];

  function readAloud(id: number, answer: string) {
    setSpeakingId(id);
    speak(answer, { language: voiceLanguage(profile.language), onDone: () => setSpeakingId(null) });
  }

  function stopReading() {
    stopSpeaking();
    setSpeakingId(null);
  }

  function addKali(msg: Omit<Extract<Msg, { from: "kali" }>, "id" | "from">) {
    const id = nextId.current++;
    setMsgs((m) => [...m, { id, from: "kali", ...msg }]);
    if (msg.result && prefs.readAloud) readAloud(id, msg.text);
  }

  async function send(q: string) {
    const asked = q.trim();
    if (!asked || thinking) return;
    stopReading();
    setMsgs((m) => [...m, { id: nextId.current++, from: "me", text: asked }]);
    setText("");
    setThinking(true);
    try {
      const result = await ask(asked);
      addKali({ text: result.answer, result });
    } catch (e) {
      addKali({ text: hubMessage(e), error: true });
    } finally {
      setThinking(false);
    }
  }

  async function startListening() {
    stopReading();
    if (micAllowed.current !== true) {
      Alert.alert(
        t(L, "Use the microphone?", "Gamitin ang mikropono?"),
        t(L, `${COMPANION} listens only while the mic is on, so you can ask by voice.`, `Nakikinig lang si ${COMPANION} habang bukas ang mic.`),
        [
          { text: t(L, "Not now", "Hindi muna"), style: "cancel" },
          {
            text: t(L, "Allow", "Payagan"),
            onPress: async () => {
              micAllowed.current = await ensureMicPermission();
              if (micAllowed.current) startListening();
            },
          },
        ],
      );
      return;
    }
    try {
      await mic.start();
    } catch {
      addKali({ text: t(L, "Sorry, I couldn't start the microphone. You can type your question instead.", "Paumanhin, hindi gumana ang mic. Maaari kang mag-type."), error: true });
    }
  }

  async function finishListening(sendIt: boolean) {
    let audio = null;
    try {
      audio = await mic.stop();
    } catch {
      audio = null;
    }
    if (!sendIt) return;
    if (!audio) {
      addKali({ text: t(L, "Sorry, I didn't catch that. Try again, or type your question.", "Paumanhin, hindi ko narinig. Subukan ulit o mag-type."), error: true });
      return;
    }
    setThinking(true);
    try {
      const result = await askVoice(audio);
      if (!result.answer) throw new Error("empty answer");
      setMsgs((m) => [...m, { id: nextId.current++, from: "me", text: result.transcript || "ðŸŽ¤" }]);
      addKali({ text: result.answer, result });
    } catch (e) {
      addKali({
        text: isUnreachable(e) ? hubMessage(e) : t(L, "Sorry, I didn't catch that. You can type your question instead.", "Paumanhin, hindi ko narinig. Maaari kang mag-type."),
        error: true,
      });
    } finally {
      setThinking(false);
    }
  }

  return (
    <Backdrop>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TopBar
            title={t(L, `Ask ${COMPANION}`, `Tanungin si ${COMPANION}`)}
            sub={t(L, "Answers from your saved memories only", "Mga sagot mula lang sa iyong mga alaala")}
            onBack={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
            right={<Image source={kali.reading} style={{ width: 48, height: 48 }} resizeMode="contain" />}
          />
          <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {msgs.map((m) =>
              m.from === "me" ? (
                <View key={m.id} style={styles.mine}>
                  <Txt size={19} weight="semi" color={kc.white}>
                    {m.text}
                  </Txt>
                </View>
              ) : (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <Image
                    source={m.error || m.result?.answer_mode === "no_data" ? kali.peek : m.result ? kali.idea : kali.wave}
                    style={styles.face}
                    resizeMode="contain"
                  />
                  <View style={styles.theirs} accessibilityLiveRegion="polite">
                    {m.result ? (
                      <View style={{ marginBottom: 8 }}>
                        <Pill label={t(L, SOURCE[m.result.answer_mode].en, SOURCE[m.result.answer_mode].fil)} bg={SOURCE[m.result.answer_mode].bg} fg={SOURCE[m.result.answer_mode].fg} />
                      </View>
                    ) : null}
                    <Txt size={19} weight="regular" style={{ lineHeight: Math.round(19 * zoom * 1.45) }}>
                      {m.text}
                    </Txt>
                    {m.result?.people.map((p) => (
                      <Pressable key={p.id} onPress={() => router.push({ pathname: "/people/[id]", params: { id: p.id } })} accessibilityRole="button" style={styles.attach}>
                        <Avatar name={p.nickname || p.name} colors={paletteFor(p.id)} uri={photoUri(hubUrl, p.photo_url, p.photo_path)} size={48} />
                        <View style={{ flex: 1 }}>
                          <Txt size={16} weight="extra" color={kc.navy}>
                            {p.nickname || p.name}
                          </Txt>
                          <Txt size={14} muted>
                            {t(L, `Your ${p.relationship}`, `Iyong ${p.relationship}`)}
                          </Txt>
                        </View>
                        <ChevronRight size={20} color={kc.navy} />
                      </Pressable>
                    ))}
                    {m.result?.memory_ids
                      .map((id) => memories.find((x) => x.id === id))
                      .filter((x): x is Memory => !!x)
                      .slice(0, 2)
                      .map((mem) => (
                        <Pressable key={mem.id} onPress={() => router.push({ pathname: "/memories/[id]", params: { id: mem.id } })} accessibilityRole="button" style={[styles.attach, { backgroundColor: kc.cream }]}>
                          <GradientBox colors={categoryHue[mem.category]} icon={categoryIcon[mem.category]} size={44} rounded={12} />
                          <Txt size={16} weight="extra" color={kc.navy} style={{ flex: 1 }} numberOfLines={2}>
                            {memoryTitle(mem)}
                          </Txt>
                          <ChevronRight size={20} color={kc.navy} />
                        </Pressable>
                      ))}
                    {m.result ? (
                      speakingId === m.id ? (
                        <Pressable onPress={stopReading} accessibilityRole="button" style={styles.read}>
                          <Square size={18} color={kc.navy} />
                          <Txt size={15} weight="bold" color={kc.navy} fixed>
                            {t(L, "Stop reading", "Itigil")}
                          </Txt>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => readAloud(m.id, m.text)} accessibilityRole="button" style={styles.read}>
                          <Volume2 size={18} color={kc.navy} />
                          <Txt size={15} weight="bold" color={kc.navy} fixed>
                            {t(L, "Read aloud", "Basahin")}
                          </Txt>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                </View>
              ),
            )}
            {thinking ? (
              <Row gap={8}>
                <Image source={kali.reading} style={styles.face} resizeMode="contain" />
                <ActivityIndicator color={kc.primary} />
                <Txt size={16} muted>
                  {t(L, `${COMPANION} is checking your memoriesâ€¦`, `Tinitingnan ni ${COMPANION} ang iyong alaalaâ€¦`)}
                </Txt>
              </Row>
            ) : null}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
            {!mic.isRecording ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
                {suggestions.map((s) => (
                  <Pressable key={s} onPress={() => send(s)} disabled={thinking} accessibilityRole="button" style={styles.suggestion}>
                    <Txt size={15} weight="bold" color={kc.navy} fixed>
                      {s}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {mic.isRecording ? (
              <View style={styles.listening}>
                <View style={styles.dot}>
                  <Mic size={22} color={kc.white} />
                </View>
                <Txt size={18} weight="bold" color={kc.white} style={{ flex: 1 }}>
                  {t(L, "Listeningâ€¦ speak slowly", "Nakikinigâ€¦ dahan-dahan")}
                </Txt>
                <Pressable onPress={() => finishListening(false)} accessibilityRole="button" style={styles.listenBtn}>
                  <Txt size={15} weight="bold" color={kc.white} fixed>
                    {t(L, "Cancel", "Kanselahin")}
                  </Txt>
                </Pressable>
                <Pressable onPress={() => finishListening(true)} accessibilityRole="button" accessibilityLabel={t(L, "Send", "Ipadala")} style={[styles.listenBtn, { backgroundColor: kc.white }]}>
                  <Send size={20} color={kc.navy} />
                </Pressable>
              </View>
            ) : (
              <Row gap={8}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={t(L, "Type a questionâ€¦", "Mag-type ng tanongâ€¦")}
                  placeholderTextColor="rgba(37,50,74,.5)"
                  accessibilityLabel={t(L, "Your question", "Iyong tanong")}
                  returnKeyType="send"
                  onSubmitEditing={() => send(text)}
                  style={[styles.input, { fontSize: Math.round(18 * zoom) }]}
                />
                {text.trim() || !canUseMic ? (
                  <Pressable onPress={() => send(text)} disabled={!text.trim() || thinking} accessibilityRole="button" accessibilityLabel={t(L, "Send", "Ipadala")} style={[styles.round, { backgroundColor: kc.navy, opacity: text.trim() ? 1 : 0.4 }]}>
                    <Send size={24} color={kc.white} />
                  </Pressable>
                ) : (
                  <Pressable onPress={startListening} disabled={thinking} accessibilityRole="button" accessibilityLabel={t(L, "Speak", "Magsalita")} style={[styles.round, { backgroundColor: kc.primary }]}>
                    <Mic size={26} color={kc.white} />
                  </Pressable>
                )}
              </Row>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  mine: { alignSelf: "flex-end", maxWidth: "82%", backgroundColor: kc.navy, borderRadius: 24, borderBottomRightRadius: 6, paddingHorizontal: 18, paddingVertical: 12 },
  theirs: { flexShrink: 1, maxWidth: "84%", backgroundColor: kc.white, borderRadius: 24, borderBottomLeftRadius: 6, paddingHorizontal: 18, paddingVertical: 14, gap: 4 },
  face: { width: 44, height: 44, borderRadius: 22, backgroundColor: kc.sky },
  attach: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, padding: 10, borderRadius: 16, backgroundColor: kc.sky },
  read: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: kc.sky },
  composer: { borderTopWidth: 1, borderTopColor: "rgba(36,59,96,.06)", backgroundColor: "rgba(255,255,255,.95)", paddingHorizontal: 16, paddingTop: 12 },
  suggestion: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 999, backgroundColor: kc.sky },
  input: { flex: 1, minHeight: 56, borderRadius: 16, backgroundColor: "rgba(234,243,252,.85)", paddingHorizontal: 16, fontFamily: fonts.semi, color: kc.ink },
  round: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  listening: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 64, borderRadius: 24, backgroundColor: kc.navy, paddingHorizontal: 14 },
  dot: { width: 40, height: 40, borderRadius: 20, backgroundColor: kc.primary, alignItems: "center", justifyContent: "center" },
  listenBtn: { minHeight: 44, minWidth: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,.15)", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
});
