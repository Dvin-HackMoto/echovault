// EchoVault mobile — patient route group layout (Module 14).
// Patient state for every screen, large headers, and the two cards that can
// appear over any screen (a due medicine, an optional trivia question).
// Also starts the offline reminders loop (REM-1..REM-3) while patient mode is
// open: asks for notification permission once, then refreshes the next 24
// hours of schedule and medicine reminders from the hub every 30 minutes.

import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { setRole } from "../../src/api/client";
import { offline } from "../../src/offline";
import MedicationCard from "../../src/patient/MedicationCard";
import TriviaCard from "../../src/patient/TriviaCard";
import { PatientProvider } from "../../src/patient/context";
import { prepareNotifications } from "../../src/platform";
import { useTheme } from "../../src/theme-context";

function PatientStack() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack
        screenOptions={{
          headerTitleStyle: { fontSize: theme.fontSizes.button, fontWeight: "700", color: theme.colors.fg },
          headerTintColor: theme.colors.primary,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="ask" options={{ title: "Ask" }} />
        <Stack.Screen name="schedule" options={{ title: "My day" }} />
        <Stack.Screen name="people" options={{ title: "My family and friends" }} />
        <Stack.Screen name="games/index" options={{ title: "Games" }} />
        <Stack.Screen name="games/[type]" options={{ title: "Game" }} />
      </Stack>
      <TriviaCard />
      <MedicationCard />
    </View>
  );
}

export default function PatientLayout() {
  // Patient mode never sends caregiver headers, so nothing here can edit records.
  useEffect(() => {
    setRole("patient").catch(() => {});
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    prepareNotifications()
      .catch(() => false) // reminders still show in the banner without permission
      .then(() => {
        if (!cancelled) stop = offline.reminders.start();
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <PatientProvider>
      <PatientStack />
    </PatientProvider>
  );
}
