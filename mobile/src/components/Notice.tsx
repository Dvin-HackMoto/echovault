// EchoVault mobile — Notice.
// Small status messages ("May not be up to date", errors) shown above a screen's content.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "../theme-context";

export type NoticeTone = "info" | "warning";

export interface NoticeProps {
  text: string;
  tone?: NoticeTone;
}

export function Notice({ text, tone = "info" }: NoticeProps) {
  const theme = useTheme();
  const look = {
    info: { bg: theme.colors.secondary, fg: theme.colors.onSecondary },
    warning: { bg: theme.colors.warningBg, fg: theme.colors.warning },
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

export default Notice;

const styles = StyleSheet.create({
  box: { alignSelf: "stretch" },
});
