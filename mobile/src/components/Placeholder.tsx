// EchoVault mobile — Placeholder screen scaffold (FOUNDATION ONLY).
// Every (patient)/(caregiver) screen in Module 13 is a clearly-marked
// placeholder so routes resolve and the app boots. Real screens land in
// Module 14 (patient) and Module 16 (caregiver).

import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BigButton from "./BigButton";
import { useTheme } from "../theme-context";

export interface PlaceholderProps {
  title: string;
  /** Which module will build the real screen, shown in the note. */
  module: string;
  /** Optional extra line (e.g. "PIN screen"). */
  note?: string;
}

export default function Placeholder({ title, module, note }: PlaceholderProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <View style={[styles.content, { padding: theme.spacing.lg, gap: theme.spacing.md }]}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
          Placeholder — built in {module}.
        </Text>
        {note ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>{note}</Text>
        ) : null}
        {router.canGoBack() ? (
          <BigButton label="Back" variant="danger" onPress={() => router.back()} theme={theme} />
        ) : (
          <BigButton label="Home" onPress={() => router.replace("/")} theme={theme} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center" },
});
