// EchoVault mobile — MicButton (PLACEHOLDER).
// Minimal themed mic button so the Ask screen can import it. The real
// hold-to-talk recording UX is wired in Module 14 via src/voice/record.ts.

import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";

export interface MicButtonProps {
  onPress?: () => void;
  /** Whether a recording is currently in progress. */
  recording?: boolean;
  disabled?: boolean;
  theme?: Theme;
}

export default function MicButton({
  onPress,
  recording = false,
  disabled = false,
  theme = defaultTheme,
}: MicButtonProps) {
  const size = theme.touchTargets.large;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? "Stop recording" : "Hold to talk"}
      accessibilityState={{ disabled, busy: recording }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: recording ? theme.colors.danger : theme.colors.primary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: theme.colors.onPrimary, fontSize: theme.fontSizes.title }}>🎤</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});
