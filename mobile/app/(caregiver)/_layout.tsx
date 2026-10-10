// EchoVault mobile — caregiver route group layout = PIN gate + nav shell (CGV-1, AUTH-2).
//
// Caregiver mode routes here first (app/index.tsx already set role=caregiver).
// On mount it re-reads the saved caregiver from the hub (GET /auth/me): a
// caregiver who was deactivated is signed out, and a changed access level is
// picked up. Without a caregiver it shows the PIN screen (POST /auth/pin):
//   401 wrong PIN, 429 too many tries (wait), 409 the PIN is shared by more than
//   one caregiver, so the screen lists their names to choose from.
// The signed-in caregiver's access level is shared with every screen through
// useCaregiverGate(), so they hide what this caregiver may not do (src/auth/access.ts);
// the hub enforces the same rules anyway.

import { Stack, useRouter } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  endCaregiverSession,
  pinErrorMessage,
  refreshCaregiverSession,
  sharedPinCaregivers,
  startCaregiverSession,
  type CaregiverIdentity,
} from "../../src/api/auth";
import { getCaregiverId } from "../../src/api/client";
import { can, type CaregiverAction } from "../../src/auth/access";
import BigButton from "../../src/components/BigButton";
import { useTheme } from "../../src/theme-context";
import type { AccessLevel } from "../../src/types";

/**
 * What caregiver screens get from the gate: who is signed in, what they may do,
 * and a way to leave caregiver mode (the PIN is needed again next time).
 */
interface CaregiverGateValue {
  caregiver: CaregiverIdentity | null;
  accessLevel: AccessLevel | null;
  can: (action: CaregiverAction) => boolean;
  leaveCaregiverMode: () => Promise<void>;
}

const CaregiverGateContext = createContext<CaregiverGateValue>({
  caregiver: null,
  accessLevel: null,
  can: () => false,
  leaveCaregiverMode: async () => {},
});

/** The signed-in caregiver, their permissions, and leaving caregiver mode. */
export function useCaregiverGate(): CaregiverGateValue {
  return useContext(CaregiverGateContext);
}

type Phase = "checking" | "locked" | "unlocked";

export default function CaregiverLayout() {
  const theme = useTheme();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("checking");
  const [caregiver, setCaregiver] = useState<CaregiverIdentity | null>(null);
  const [pin, setPin] = useState("");
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: a saved caregiver is re-checked with the hub before unlocking.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getCaregiverId();
      if (!id) {
        if (!cancelled) setPhase("locked");
        return;
      }
      try {
        const current = await refreshCaregiverSession(); // null: deactivated, signed out
        if (cancelled) return;
        setCaregiver(current);
        setPhase(current ? "unlocked" : "locked");
      } catch (err) {
        // hub unreachable: ask for the PIN again rather than trusting a stale session
        if (cancelled) return;
        setError(pinErrorMessage(err));
        setPhase("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn(caregiverId?: string) {
    const entered = pin.trim();
    if (!entered) {
      setError("Enter your PIN to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // saves the caregiver id, role and access level for every later request
      setCaregiver(await startCaregiverSession(entered, caregiverId));
      setPin("");
      setChoices(null);
      setPhase("unlocked");
    } catch (err) {
      const shared = sharedPinCaregivers(err);
      if (shared) setChoices(shared);
      setError(pinErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const leaveCaregiverMode = useCallback(async () => {
    await endCaregiverSession();
    setCaregiver(null);
    setPhase("locked");
    setPin("");
    setChoices(null);
    setError(null);
    router.replace("/");
  }, [router]);
  if (phase === "checking") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (phase === "locked") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.lockedContent, { padding: theme.spacing.lg, gap: theme.spacing.lg }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
              Caregiver sign-in
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
              Enter your caregiver PIN to manage memories, people, schedule and
              more.
            </Text>
            <TextInput
              value={pin}
              onChangeText={(value) => { setPin(value); setChoices(null); }}
              placeholder="PIN"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onSubmitEditing={() => signIn()}
              style={{
                borderWidth: 1,
                borderColor: error ? theme.colors.danger : theme.colors.border,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
                fontSize: theme.fontSizes.title,
                color: theme.colors.fg,
                minHeight: theme.touchTargets.min,
                letterSpacing: 4,
              }}
            />
            {error ? (
              <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>{error}</Text>
            ) : null}
            {choices ? (
              <View style={{ gap: theme.spacing.sm }}>
                {choices.map((c) => (
                  <BigButton
                    key={c.id}
                    label={`I am ${c.name}`}
                    variant="secondary"
                    onPress={() => signIn(c.id)}
                    loading={submitting}
                    theme={theme}
                  />
                ))}
              </View>
            ) : (
              <BigButton
                label={submitting ? "Checking…" : "Unlock"}
                onPress={() => signIn()}
                loading={submitting}
                theme={theme}
              />
            )}
            <BigButton
              label="Back"
              variant="danger"
              onPress={() => router.replace("/")}
              theme={theme}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Unlocked: render the Stack over the 7 caregiver screens by their existing
  // route/file names. Screens navigate between each other with the router.
  return (
    <CaregiverGateContext.Provider
      value={{
        caregiver,
        accessLevel: caregiver?.access_level ?? null,
        can: (action) => can(caregiver?.access_level, action),
        leaveCaregiverMode,
      }}
    >
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="memories/index" />
        <Stack.Screen name="memories/[id]" />
        <Stack.Screen name="people" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="medications" />
        <Stack.Screen name="activities" />
        <Stack.Screen name="backup" />
      </Stack>
    </CaregiverGateContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lockedContent: { flexGrow: 1, justifyContent: "center" },
});
