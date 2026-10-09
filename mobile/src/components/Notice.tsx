// EchoVault mobile — Notice.
// Small status messages ("Demo data", "May not be up to date", errors) and the
// "Demo data" tag shown wherever the demo hub answered instead of the real one.

import React, { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { demoStore } from "../api/client";
import { useTheme } from "../theme-context";

export type NoticeTone = "info" | "warning" | "demo";

export interface NoticeProps {
  text: string;
  tone?: NoticeTone;
}

export function Notice({ text, tone = "info" }: NoticeProps) {
  const theme = useTheme();
  const look = {
    info: { bg: theme.colors.secondary, fg: theme.colors.onSecondary },
    warning: { bg: theme.colors.warningBg, fg: theme.colors.warning },
    demo: { bg: theme.colors.demoBg, fg: theme.colors.demo },
  }[tone];
  return (
    <View
      accessibilityRole="text"
      style={[
        styles.box,
        {
          backgroundColor: look.bg,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
        },
      ]}
    >
      <Text style={{ color: look.fg, fontSize: theme.fontSizes.caption, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

/** Features (e.g. "games") currently answered by the demo hub instead of the real one. */
export function useDemoFeatures(): string[] {
  return useSyncExternalStore(demoStore.subscribe, demoStore.getSnapshot, demoStore.getSnapshot);
}

/** Shows "Demo data" when this feature's data came from the demo hub. */
export function DemoTag({ feature }: { feature: string }) {
  const demo = useDemoFeatures().includes(feature);
  return demo ? <Notice tone="demo" text="Demo data. This part is not connected to the hub yet." /> : null;
}

export default Notice;

const styles = StyleSheet.create({
  box: { alignSelf: "stretch" },
});
