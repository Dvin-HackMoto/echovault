// EchoVault mobile — first-launch hub setup + mode picker (MOB-4).
//
// First launch: ask for the hub IP, normalize it to http://<ip>:<port>
// (default port 8000 — the uvicorn default used in ARCHITECTURE §1; the field
// accepts a full host:port so this is overridable), check it against GET
// /health BEFORE saving, and only save on success. A wrong/unreachable IP
// shows a clear message distinct from a bad-format message.
//
// Once a hub URL exists, show the mode picker:
//   Patient  -> setRole('patient')   -> open the (patient) group directly
//   Caregiver-> setRole('caregiver') -> go to the (caregiver) PIN placeholder
// The hub IP is always changeable via "Change hub IP".
//
// Module 14 additions:
//   - "Use demo data (no hub)" and a "Hub only" switch set the data mode
//     (src/api/routes.ts): "auto" uses the hub for every route it has and demo
//     data, labelled "Demo", for the rest; "hub" never uses demo data.
//   - Once Patient is picked, later launches open the patient home directly;
//     its "Hub settings" link comes back here with ?setup=1.

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BigButton from "../src/components/BigButton";
import { Notice } from "../src/components/Notice";
import {
  checkHealth,
  getDataMode,
  getHubUrl,
  getRole,
  setDataMode,
  setHubUrl,
  setRole,
  type DataMode,
} from "../src/api/client";
import { useTheme } from "../src/theme-context";

/** Default hub port (uvicorn default in ARCHITECTURE §1). */
const DEFAULT_PORT = 8000;

/**
 * Normalize raw user input into an http base URL, or null if it can't be made
 * into a plausible host[:port]. Accepts "192.168.1.5", "192.168.1.5:8000",
 * or a full "http://host:port".
 */
function normalizeHubInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let working = trimmed;
  if (!/^https?:\/\//i.test(working)) {
    working = `http://${working}`;
  }

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

type Phase = "loading" | "setup" | "picker" | "patient";

export default function Index() {
  const theme = useTheme();
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [hubUrl, setHubUrlState] = useState<string | null>(null);
  const [mode, setMode] = useState<DataMode>("auto");
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, decide between setup (no hub saved), the mode picker, and
  // reopening patient mode.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getHubUrl(), getDataMode(), getRole()]).then(([saved, savedMode, role]) => {
      if (cancelled) return;
      setHubUrlState(saved);
      setMode(savedMode);
      const ready = Boolean(saved) || savedMode === "demo";
      if (ready && role === "patient" && !setup) {
        setPhase("patient");
      } else if (ready && !setup) {
        setPhase("picker");
      } else {
        setInput(saved?.replace(/^https?:\/\//, "") ?? "");
        setPhase("setup");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setup]);

  async function onSaveHub() {
    setError(null);
    const normalized = normalizeHubInput(input);
    if (!normalized) {
      setError("That doesn't look like a valid address. Try something like 192.168.1.5:8000.");
      return;
    }
    setChecking(true);
    const reachable = await checkHealth(normalized);
    setChecking(false);
    if (!reachable) {
      setError("Couldn't reach the hub at that address. Check it's on and on the same Wi-Fi, then try again.");
      return;
    }
    const nextMode: DataMode = mode === "hub" ? "hub" : "auto";
    await setHubUrl(normalized);
    await setDataMode(nextMode);
    setHubUrlState(normalized);
    setMode(nextMode);
    setInput("");
    setPhase("picker");
  }

  async function onUseDemo() {
    setError(null);
    await setDataMode("demo");
    setMode("demo");
    setPhase("picker");
  }

  async function onPickPatient() {
    await setRole("patient");
    router.replace("/(patient)/home");
  }

  async function onPickCaregiver() {
    await setRole("caregiver");
    // Module 16 owns the real PIN flow; route to the (caregiver) group entry,
    // which is a clearly-marked PIN placeholder for now.
    router.replace("/(caregiver)/dashboard");
  }

  function onChangeHub() {
    setError(null);
    setInput(hubUrl?.replace(/^https?:\/\//, "") ?? "");
    if (mode === "demo") setMode("auto");
    setPhase("setup");
  }

  if (phase === "patient") {
    return <Redirect href="/(patient)/home" />;
  }

  if (phase === "loading") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { padding: theme.spacing.lg, gap: theme.spacing.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.display, fontWeight: "800" }}>
            EchoVault
          </Text>

          {phase === "setup" ? (
            <View style={{ gap: theme.spacing.md }}>
              <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
                Connect to the hub
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
                Enter the hub's address shown on the laptop (for example 192.168.1.5:8000).
              </Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="192.168.1.5:8000"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!checking}
                style={{
                  borderWidth: 1,
                  borderColor: error ? theme.colors.danger : theme.colors.border,
                  borderRadius: theme.radii.md,
                  padding: theme.spacing.md,
                  fontSize: theme.fontSizes.body,
                  color: theme.colors.fg,
                  minHeight: theme.touchTargets.min,
                }}
              />
              {error ? (
                <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>{error}</Text>
              ) : null}
              <View style={[styles.row, { gap: theme.spacing.md }]}>
                <Switch
                  value={mode === "hub"}
                  onValueChange={(on) => setMode(on ? "hub" : "auto")}
                  accessibilityLabel="Hub only, never use demo data"
                />
                <Text style={{ flex: 1, color: theme.colors.fg, fontSize: theme.fontSizes.body }}>
                  Hub only (never use demo data)
                </Text>
              </View>
              <BigButton
                label={checking ? "Checking…" : "Connect"}
                onPress={onSaveHub}
                loading={checking}
                theme={theme}
              />
              <BigButton label="Use demo data (no hub)" variant="secondary" onPress={onUseDemo} theme={theme} />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
                Who's using the phone?
              </Text>
              <BigButton label="Patient" onPress={onPickPatient} theme={theme} />
              <BigButton label="Caregiver" onPress={onPickCaregiver} theme={theme} />
              {mode === "demo" ? (
                <Notice tone="demo" text="Using demo data. No hub is needed." />
              ) : (
                <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption, marginTop: theme.spacing.sm }}>
                  Connected to {hubUrl}
                  {mode === "hub"
                    ? ". Only the hub's data is used."
                    : `. Parts the hub does not have yet use demo data, marked "Demo".`}
                </Text>
              )}
              <BigButton label="Change hub IP" variant="danger" onPress={onChangeHub} theme={theme} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
});
