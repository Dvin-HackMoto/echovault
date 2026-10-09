// EchoVault mobile — ReminderBanner (PLACEHOLDER).
// Minimal themed banner so the patient home screen can import it. The real
// reminder cards (schedule + medication) are wired in Module 14 using
// src/reminders.ts and the schedule/medications APIs.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";

export interface ReminderBannerProps {
  title: string;
  detail?: string;
  theme?: Theme;
}

export default function ReminderBanner({
  title,
  detail,
  theme = defaultTheme,
}: ReminderBannerProps) {
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.card,
          borderLeftColor: theme.colors.primary,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
        },
      ]}
    >
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.button, fontWeight: "700" }}>
        {title}
      </Text>
      {detail ? (
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, marginTop: theme.spacing.xs }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderLeftWidth: 6,
  },
});
