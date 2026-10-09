// EchoVault mobile — patient route group layout.
// Starts the offline reminders loop (REM-1..REM-3) while patient mode is open:
// asks for notification permission once, then refreshes the next 24 hours of
// schedule and medicine reminders from the hub every 30 minutes.
import { Stack } from "expo-router";
import { useEffect } from "react";
import { offline } from "../../src/offline";
import { prepareNotifications } from "../../src/platform";

export default function PatientLayout() {
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

  return <Stack screenOptions={{ headerShown: false }} />;
}
