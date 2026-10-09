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
  /** Optional leading icon: any element, or an emoji string (wrapped in Text). */
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  /** "secondary" is the calm, lower-emphasis style; "success" confirms. */
  variant?: "primary" | "secondary" | "success" | "danger";
  /** Extra description read by screen readers. */
  hint?: string;
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
  hint,
  theme = defaultTheme,
}: BigButtonProps) {
  const { bg, fg } = {
    primary: { bg: theme.colors.primary, fg: theme.colors.onPrimary },
    secondary: { bg: theme.colors.secondary, fg: theme.colors.onSecondary },
    success: { bg: theme.colors.success, fg: theme.colors.onPrimary },
    danger: { bg: theme.colors.danger, fg: theme.colors.onDanger },
  }[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      accessibilityHint={hint}
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
            <View
              style={{ marginRight: theme.spacing.sm }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {typeof icon === "string" ? (
                <Text style={{ fontSize: theme.fontSizes.button }}>{icon}</Text>
              ) : (
                icon
              )}
            </View>
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
    flexShrink: 1,
  },
});
