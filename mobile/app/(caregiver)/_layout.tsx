// EchoVault mobile — caregiver route group layout.
// Minimal Stack so the (caregiver) group resolves. Real screens (including the
// real PIN flow) land in Module 16.

import { Stack } from "expo-router";

export default function CaregiverLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
