// EchoVault mobile — splash, first-run onboarding, hub setup and "who uses this
// phone" (MOB-4, Kali design: Splash + Onboarding in frontend/src/App.tsx).
//
// First launch: splash, three onboarding slides, then the hub address. The
// address is normalized to http://<ip>:<port> (default port 8000, uvicorn's
// default) and checked against the hub BEFORE it is saved, so a wrong IP shows a
// clear message. The app has no demo data: a reachable hub is required. Then
// the role picker:
//   Patient   -> setRole('patient')   -> the (patient) group
//   Caregiver -> /care (the caregiver app), which asks for the PIN
// Later launches open patient mode directly once Patient was picked (or the
// caregiver group while a caregiver is signed in). ?setup=1 comes back here.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Accessibility, HeartHandshake, Server, User } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  checkHealth,
  getCaregiverId,
  getHubUrl,
  getRole,
  setHubUrl,
  setRole,
} from "../src/api/client";
import { kali } from "../src/ui/kali";
import { Banner, Btn, Field, Input, KaliTip, Row, Segmented, Toggle, Txt } from "../src/ui/kit";
import { t } from "../src/ui/labels";
import { usePrefs } from "../src/ui/prefs";
import { APP_NAME, CARE_NAME, COMPANION, TAGLINE, kc, navy } from "../src/ui/tokens";

/** Default hub port (uvicorn default in ARCHITECTURE §1). */
const DEFAULT_PORT = 8000;
const KEY_ONBOARDED = "ev.onboarded";

/**
 * Normalize raw user input into an http base URL, or null if it can't be made
 * into a plausible host[:port]. Accepts "192.168.1.5", "192.168.1.5:8000",
 * or a full "http://host:port".
 */
function normalizeHubInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const working = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(working);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  const port = url.port ? url.port : String(DEFAULT_PORT);
  return `${url.protocol}//${url.hostname}:${port}`;
}

type Phase = "loading" | "onboard" | "setup" | "picker" | "patient" | "caregiver";
type Role = "patient" | "caregiver";

export default function Index() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { prefs, setPref } = usePrefs();
  const L = prefs.lang;

  const [phase, setPhase] = useState<Phase>("loading");
  const [splashDone, setSplashDone] = useState(false);
  const [slide, setSlide] = useState(0);
  const [hubUrl, setHubUrlState] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRoleChoice] = useState<Role>("patient");

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), setup ? 0 : 1600);
    return () => clearTimeout(timer);
  }, [setup]);

  // Decide between onboarding, hub setup, the picker, and reopening a saved mode.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getHubUrl(), getRole(), getCaregiverId(), AsyncStorage.getItem(KEY_ONBOARDED)]).then(
      ([saved, savedRole, caregiverId, onboarded]) => {
        if (cancelled) return;
        setHubUrlState(saved);
        // The hub is the only data source, so a saved address is what "ready" means.
        const ready = Boolean(saved);
        if (ready && !setup && savedRole === "patient") setPhase("patient");
        else if (ready && !setup && savedRole === "caregiver" && caregiverId) setPhase("caregiver");
        else if (ready && !setup) setPhase("picker");
        else if (!onboarded && !setup) setPhase("onboard");
        else {
          setInput(saved?.replace(/^https?:\/\//, "") ?? "");
          setPhase(setup && ready ? "picker" : "setup");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setup]);

  async function finishOnboarding() {
    await AsyncStorage.setItem(KEY_ONBOARDED, "1").catch(() => {});
    setPhase("setup");
  }

  async function onSaveHub() {
    setError(null);
    const normalized = normalizeHubInput(input);
    if (!normalized) {
      setError(t(L, "That doesn't look like an address. Try something like 192.168.1.5:8000.", "Mukhang mali ang address. Subukan ang 192.168.1.5:8000."));
      return;
    }
    setChecking(true);
    const reachable = await checkHealth(normalized);
    setChecking(false);
    if (!reachable) {
      setError(t(L, "Couldn't reach the hub at that address. Check that it's on and on the same Wi-Fi, then try again.", "Hindi maabot ang hub. Tingnan kung bukas ito at nasa parehong Wi-Fi."));
      return;
    }
    await setHubUrl(normalized);
    setHubUrlState(normalized);
    setInput("");
    setPhase("picker");
  }

  async function onContinue() {
    if (role === "patient") {
      await setRole("patient");
      router.replace("/(patient)/home");
    } else {
      // the caregiver group asks for the PIN, then sets the caregiver role
      router.replace("/care");
    }
  }

  function onChangeHub() {
    setError(null);
    setInput(hubUrl?.replace(/^https?:\/\//, "") ?? "");
    setPhase("setup");
  }

  if (phase === "patient" && splashDone) return <Redirect href="/(patient)/home" />;
  if (phase === "caregiver" && splashDone) return <Redirect href="/care" />;
  if (phase === "loading" || phase === "patient" || phase === "caregiver" || !splashDone) return <Splash />;

  if (phase === "onboard") {
    const slides = [
      { img: kali.reading, en: "Your memories, always close.", fil: "Ang iyong mga alaala, laging malapit.", sub: t(L, `${COMPANION} keeps the things that matter to you in one safe place.`, `Iniingatan ni ${COMPANION} ang mahahalagang bagay sa iyo.`) },
      { img: kali.photo, en: "Remember the people and moments that matter.", fil: "Alalahanin ang mga taong mahalaga.", sub: t(L, "See your family, your day, and happy moments any time.", "Makita ang pamilya, ang iyong araw, at masasayang sandali.") },
      { img: kali.hug, en: "Here to help, even without internet.", fil: "Nandito para tumulong, kahit walang internet.", sub: t(L, "Everything stays on your home hub. Your family keeps it up to date.", "Nasa hub sa bahay ang lahat. Ang pamilya mo ang nag-aayos nito.") },
    ];
    const s = slides[slide];
    return (
      <LinearGradient colors={[kc.sky, kc.white]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 24 }}>
          <Row style={{ justifyContent: "space-between", paddingTop: 8 }}>
            <View style={{ width: 170 }}>
              <Segmented value={L} onChange={(v) => setPref("lang", v)} options={[{ v: "en", l: "EN" }, { v: "fil", l: "FIL" }]} />
            </View>
            <Pressable onPress={finishOnboarding} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 10 }}>
              <Txt weight="bold" color={navy(0.65)}>
                {t(L, "Skip", "Laktawan")}
              </Txt>
            </Pressable>
          </Row>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={styles.halo}>
              <Image source={s.img} style={{ width: 200, height: 200 }} resizeMode="contain" />
            </View>
            <Txt size={28} weight="black" color={kc.navy} center style={{ marginTop: 28 }}>
              {t(L, s.en, s.fil)}
            </Txt>
            <Txt size={19} muted center style={{ marginTop: 10 }}>
              {s.sub}
            </Txt>
          </View>
          <Row gap={8} style={{ justifyContent: "center", marginBottom: 20 }}>
            {slides.map((_, k) => (
              <View key={k} style={{ height: 10, width: k === slide ? 32 : 10, borderRadius: 5, backgroundColor: k === slide ? kc.navy : "rgba(114,154,201,.4)" }} />
            ))}
          </Row>
          <Btn label={slide === 2 ? t(L, "Get started", "Magsimula") : t(L, "Next", "Susunod")} onPress={() => (slide === 2 ? finishOnboarding() : setSlide(slide + 1))} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[kc.bgTop, kc.white]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
            {phase === "setup" ? (
              <>
                <Txt size={26} weight="black" color={kc.navy} accessibilityRole="header">
                  {t(L, "Connect to the hub", "Kumonekta sa hub")}
                </Txt>
                <KaliTip pose="idea" tone="sky">
                  {t(L, "Enter the address shown on the hub laptop, for example 192.168.1.5:8000.", "Ilagay ang address na nasa hub laptop, halimbawa 192.168.1.5:8000.")}
                </KaliTip>
                <Field label={t(L, "Hub address", "Address ng hub")} error={error}>
                  <Input
                    big
                    value={input}
                    onChangeText={setInput}
                    placeholder="192.168.1.5:8000"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    editable={!checking}
                    onSubmitEditing={onSaveHub}
                  />
                </Field>
                <Btn icon={Server} label={checking ? t(L, "Checking…", "Sinusuri…") : t(L, "Connect", "Kumonekta")} onPress={onSaveHub} loading={checking} />
              </>
            ) : (
              <>
                <Txt size={26} weight="black" color={kc.navy} accessibilityRole="header">
                  {t(L, "Let's set things up", "Ihanda natin")}
                </Txt>
                <Txt size={18} muted>
                  {t(L, "Who will use this phone?", "Sino ang gagamit ng phone na ito?")}
                </Txt>
                <Row gap={12} style={{ alignItems: "stretch" }}>
                  {(
                    [
                      ["patient", User, t(L, "I'm the user", "Ako ang gagamit"), APP_NAME],
                      ["caregiver", HeartHandshake, t(L, "I'm a caregiver", "Tagapag-alaga ako"), CARE_NAME],
                    ] as const
                  ).map(([r, Icon, label, sub]) => {
                    const on = role === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setRoleChoice(r)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.roleCard, { backgroundColor: on ? kc.navy : kc.sky, borderColor: on ? "rgba(114,154,201,.5)" : "transparent" }]}
                      >
                        <Icon size={32} color={on ? kc.white : kc.navy} />
                        <Txt size={18} weight="extra" color={on ? kc.white : kc.navy} style={{ marginTop: 12 }}>
                          {label}
                        </Txt>
                        <Txt size={14} weight="semi" color={on ? "rgba(255,255,255,.75)" : navy(0.65)}>
                          {sub}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </Row>
                <Field label={t(L, "Language", "Wika")}>
                  <Segmented value={L} onChange={(v) => setPref("lang", v)} options={[{ v: "en", l: "English" }, { v: "fil", l: "Filipino" }]} />
                </Field>
                <Row gap={8}>
                  <Accessibility size={20} color={ink65} />
                  <Txt weight="bold" muted>
                    {t(L, "Text size", "Laki ng teksto")}
                  </Txt>
                </Row>
                <Segmented value={prefs.textSize} onChange={(v) => setPref("textSize", v)} options={[{ v: "md", l: "A" }, { v: "lg", l: "A+" }, { v: "xl", l: "A++" }]} />
                <View style={styles.box}>
                  <Toggle on={prefs.readAloud} onChange={(v) => setPref("readAloud", v)} label={t(L, "Read answers aloud", "Basahin nang malakas")} />
                  <Toggle on={prefs.highContrast} onChange={(v) => setPref("highContrast", v)} label={t(L, "High contrast", "Mataas na contrast")} />
                </View>
                <Txt size={14} muted>
                  {t(L, "Connected to", "Nakakonekta sa")} {hubUrl}
                </Txt>
                <View style={{ flex: 1 }} />
                <Btn label={t(L, "Continue", "Magpatuloy")} onPress={onContinue} />
                <Btn variant="ghost" size="md" label={t(L, "Change hub address", "Palitan ang hub address")} onPress={onChangeHub} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const ink65 = "rgba(37,50,74,.68)";

function Splash() {
  return (
    <LinearGradient colors={[kc.sky, kc.skyDeep]} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <Image source={kali.reading} style={{ width: 220, height: 220 }} resizeMode="contain" accessibilityLabel={`${COMPANION} the elephant`} />
      <Txt size={40} weight="black" color={kc.navy} center fixed style={{ marginTop: 12 }}>
        {APP_NAME}
      </Txt>
      <Txt size={20} weight="bold" color={kc.primary} center fixed>
        {TAGLINE}
      </Txt>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: "rgba(255,255,255,.75)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: kc.primary,
    shadowOpacity: 0.4,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  box: { backgroundColor: kc.white, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4 },
  roleCard: { flex: 1, borderRadius: 24, padding: 16, borderWidth: 4 },
});
