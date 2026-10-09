// EchoVault mobile — caregiver route group layout = PIN gate + nav shell.
//
// Caregiver mode routes here first (app/index.tsx already set role=caregiver).
// This layout is the GATE: on mount it reads getCaregiverId(); if there is no
// caregiver id yet it renders a PIN entry screen, and only once a PIN login
// succeeds does it reveal the Stack over the 7 caregiver screens.
//
// AUTH IS A STUBBED BACKEND MODULE: POST /auth/pin returns 404 until the Auth
// module (AUTH-2) lands. pinLogin() therefore throws an ApiError (kind:'http',
// status 404) today — the PIN screen catches `instanceof ApiError` and renders
// the message inline instead of crashing.

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

import { pinLogin } from "../../src/api/auth";
import { ApiError, getCaregiverId, setCaregiverId } from "../../src/api/client";
import BigButton from "../../src/components/BigButton";
import { useTheme } from "../../src/theme-context";

/**
 * Lets any caregiver screen (e.g. the dashboard) leave caregiver mode: it
 * clears the stored caregiver id, re-locks this gate and returns to the mode
 * picker so the PIN is required again on the next entry.
 */
interface CaregiverGateValue {
  leaveCaregiverMode: () => Promise<void>;
}

const CaregiverGateContext = createContext<CaregiverGateValue>({
  leaveCaregiverMode: async () => {},
});

/** Access the caregiver gate controls (currently: leave caregiver mode). */
export function useCaregiverGate(): CaregiverGateValue {
  return useContext(CaregiverGateContext);
}

type Phase = "checking" | "locked" | "unlocked";

export default function CaregiverLayout() {
  const theme = useTheme();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("checking");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, unlock immediately if a caregiver id was already persisted.
  useEffect(() => {
    let cancelled = false;
    getCaregiverId().then((id) => {
      if (cancelled) return;
      setPhase(id ? "unlocked" : "locked");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmitPin() {
    const entered = pin.trim();
    if (!entered) {
      setError("Enter your PIN to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await pinLogin(entered);
      // Persist the id so every later request carries X-Caregiver-Id. Role is
      // already 'caregiver' (set in app/index.tsx) — do not re-set it here.
      await setCaregiverId(result.id);
      setPin("");
      setPhase("unlocked");
    } catch (err) {
      // 404 == auth module still a stub; any ApiError shows its message inline
      // and keeps us on the PIN screen rather than crashing.
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const leaveCaregiverMode = useCallback(async () => {
    await setCaregiverId(null);
    setPhase("locked");
    setPin("");
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
              onChangeText={setPin}
              placeholder="PIN"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onSubmitEditing={onSubmitPin}
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
            <BigButton
              label={submitting ? "Checking…" : "Unlock"}
              onPress={onSubmitPin}
              loading={submitting}
              theme={theme}
            />
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
    <CaregiverGateContext.Provider value={{ leaveCaregiverMode }}>
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
