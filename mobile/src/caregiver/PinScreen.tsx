// EchoVault mobile — caregiver PIN unlock (CGV-1, Kali style).
// A big keypad. A correct PIN saves the caregiver id and role, so every later
// request carries X-Role: caregiver and X-Caregiver-Id. A wrong PIN shows an
// error and stays here; a shared PIN (409) asks which caregiver you are.

import { LinearGradient } from "expo-linear-gradient";
import { Delete, Lock } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { pinErrorMessage, sharedPinCaregivers, startCaregiverSession, type CaregiverIdentity } from "../api/auth";
import { ApiError } from "../api/client";
import { kali } from "../ui/kali";
import { Banner, Btn, Row, Txt } from "../ui/kit";
import { CARE_NAME, cardShadow, kc, navy } from "../ui/tokens";

const MAX = 8;

export default function PinScreen({ onUnlocked, onLeave }: { onUnlocked: (c: CaregiverIdentity) => void; onLeave: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);

  async function unlock(caregiverId?: string) {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await startCaregiverSession(pin, caregiverId));
    } catch (e) {
      const shared = sharedPinCaregivers(e);
      if (shared) setChoices(shared);
      else {
        setError(e instanceof ApiError && e.kind === "not_built" ? "Caregiver sign-in needs the hub. Connect to the hub first (demo data has no caregivers)." : pinErrorMessage(e));
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < MAX ? p + d : p));
  };

  return (
    <LinearGradient colors={[kc.sky, kc.white]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: 24 }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Image source={kali.hug} style={{ width: 110, height: 110 }} resizeMode="contain" />
          <Txt size={13} weight="black" color={kc.primary} style={{ letterSpacing: 1.2, textTransform: "uppercase" }} fixed>
            {CARE_NAME}
          </Txt>
          <Txt size={26} weight="black" color={kc.navy} center accessibilityRole="header">
            Enter your caregiver PIN
          </Txt>
        </View>

        <Row gap={12} style={{ justifyContent: "center", marginVertical: 22 }} accessibilityLabel={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && { backgroundColor: kc.navy, borderColor: kc.navy }]} />
          ))}
        </Row>
        {error ? <Banner tone="error" text={error} style={{ marginBottom: 12 }} /> : null}

        {choices ? (
          <View style={{ gap: 10 }}>
            <Txt size={17} weight="bold" center>
              This PIN belongs to more than one caregiver. Who are you?
            </Txt>
            {choices.map((c) => (
              <Btn key={c.id} variant="ghost" label={c.name} onPress={() => unlock(c.id)} loading={busy} />
            ))}
            <Btn variant="soft" size="md" label="Use a different PIN" onPress={() => { setChoices(null); setPin(""); }} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["del", "0", "ok"]].map((row) => (
              <Row key={row.join()} gap={12}>
                {row.map((k) =>
                  k === "del" ? (
                    <Pressable key={k} onPress={() => setPin((p) => p.slice(0, -1))} accessibilityRole="button" accessibilityLabel="Delete" style={[styles.key, { backgroundColor: kc.sky }]}>
                      <Delete size={26} color={kc.navy} />
                    </Pressable>
                  ) : k === "ok" ? (
                    <Pressable
                      key={k}
                      onPress={() => unlock()}
                      disabled={pin.length < 4 || busy}
                      accessibilityRole="button"
                      accessibilityLabel="Unlock"
                      style={[styles.key, { backgroundColor: kc.navy, opacity: pin.length < 4 ? 0.4 : 1 }]}
                    >
                      <Lock size={24} color={kc.white} />
                    </Pressable>
                  ) : (
                    <Pressable key={k} onPress={() => press(k)} accessibilityRole="button" accessibilityLabel={k} style={({ pressed }) => [styles.key, pressed && { backgroundColor: kc.sky }]}>
                      <Txt size={28} weight="black" color={kc.navy} fixed>
                        {k}
                      </Txt>
                    </Pressable>
                  ),
                )}
              </Row>
            ))}
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Btn variant="ghost" size="md" label="Back to the patient app" onPress={onLeave} />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: navy(0.3) },
  key: { flex: 1, height: 68, borderRadius: 20, backgroundColor: kc.white, alignItems: "center", justifyContent: "center", ...cardShadow },
});
