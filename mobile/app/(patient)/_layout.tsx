// EchoVault mobile — patient route group layout.
// Minimal Stack so the (patient) group resolves. Real screens land in Module 14.

import { Stack } from "expo-router";

export default function PatientLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
