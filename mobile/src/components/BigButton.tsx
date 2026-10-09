// EchoVault mobile — BigButton.
// A large, high-contrast, readable button for low-vision / older users.
// Honors the theme and the patient's font scale.

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";

export interface BigButtonProps {
  label: string;
  onPress?: () => void;
  /** Optional leading icon (any element — e.g. a vector icon or emoji Text). */
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "danger";
  /** Inject a scaled theme; falls back to the default 1.4 theme. */
  theme?: Theme;
}

export default function BigButton({
  label,
  onPress,
  icon,
  disabled = false,
  loading = false,
  variant = "primary",
  theme = defaultTheme,
}: BigButtonProps) {
  const bg = variant === "danger" ? theme.colors.danger : theme.colors.primary;
  const fg =
    variant === "danger" ? theme.colors.onDanger : theme.colors.onPrimary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          minHeight: theme.touchTargets.comfortable,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <View style={{ marginRight: theme.spacing.sm }}>{icon}</View>
          ) : null}
          <Text
            style={[styles.label, { color: fg, fontSize: theme.fontSizes.button }]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "700",
    textAlign: "center",
  },
});
