// EchoVault mobile — expo-router root layout.
// Wraps the app in the gesture + safe-area providers the SDK template expects
// and the EchoVault theme provider (loads patient font_scale, fallback 1.4),
// then declares the Stack over index + the two route groups. Minimal, no
// feature logic.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "../src/theme-context";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(patient)" />
            <Stack.Screen name="(caregiver)" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
