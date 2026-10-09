// EchoVault mobile — expo-router root layout.
// Gesture + safe-area providers, the Nunito font (Kali design), this phone's
// display preferences, the toast, and the theme provider older components still
// read. Declares the Stack over index + the two route groups.

import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from "@expo-google-fonts/nunito";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider } from "../src/theme-context";
import { PrefsProvider } from "../src/ui/prefs";
import { ToastProvider } from "../src/ui/toast";
import { kc } from "../src/ui/tokens";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });

  // the fonts are bundled, so this is a moment; if they fail the system font is used
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: kc.sky }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PrefsProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: kc.bgTop } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(patient)" />
                <Stack.Screen name="care" />
              </Stack>
            </ToastProvider>
          </PrefsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
