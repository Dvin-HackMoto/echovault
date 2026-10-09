// EchoVault mobile — MicButton.
// Hold to talk: recording starts on press-in and is sent on release (wired to
// src/voice/record.ts by the Ask screen). `onPress` still works for a simple
// tap-to-toggle use.

import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";

export interface MicButtonProps {
  onPress?: () => void;
  /** Hold-to-talk: start recording. */
  onPressIn?: () => void;
  /** Hold-to-talk: stop and send. */
  onPressOut?: () => void;
  /** Whether a recording is currently in progress. */
  recording?: boolean;
  disabled?: boolean;
  /** Show the "Hold to talk" text under the icon (a wide button). */
  showLabel?: boolean;
  theme?: Theme;
}

export default function MicButton({
  onPress,
  onPressIn,
  onPressOut,
  recording = false,
  disabled = false,
  showLabel = false,
  theme = defaultTheme,
}: MicButtonProps) {
  const size = theme.touchTargets.large;
  const label = recording ? "Listening… let go to send" : "Hold to talk";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? "Listening. Let go to send." : "Hold to talk"}
      accessibilityHint="Hold the button while you ask your question, then let go."
      accessibilityState={{ disabled, busy: recording }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.button,
        showLabel
          ? { alignSelf: "stretch", borderRadius: theme.radii.lg, paddingVertical: theme.spacing.lg, gap: theme.spacing.sm }
          : { width: size, height: size, borderRadius: size / 2 },
        {
          backgroundColor: recording ? theme.colors.danger : theme.colors.primary,
          opacity: disabled ? 0.5 : pressed && !recording ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{ color: theme.colors.onPrimary, fontSize: showLabel ? theme.fontSizes.display : theme.fontSizes.title }}
        importantForAccessibility="no"
      >
        🎤
      </Text>
      {showLabel ? (
        <Text style={{ color: theme.colors.onPrimary, fontSize: theme.fontSizes.body, fontWeight: "700" }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});
