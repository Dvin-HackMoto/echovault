// EchoVault mobile — TrustBadge.
// A small themed pill that colour-codes a record's trust state so caregivers
// can scan verification status at a glance. Shared across caregiver screens
// (memories, people, dashboard rows). Theme-driven; no hard-coded colours.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";
import type { Trust } from "../types";

export interface TrustBadgeProps {
  trust: Trust;
  /** Inject a scaled theme; falls back to the default 1.4 theme. */
  theme?: Theme;
}

/** Map each trust state to a background colour drawn from the theme tokens. */
function trustColor(trust: Trust, theme: Theme): string {
  switch (trust) {
    case "verified":
      return theme.colors.success;
    case "conflicting":
      return theme.colors.danger;
    case "outdated":
      return theme.colors.border;
    case "unverified":
    default:
      return theme.colors.muted;
  }
}

/** Human-readable label for each trust state. */
function trustLabel(trust: Trust): string {
  switch (trust) {
    case "verified":
      return "Verified";
    case "conflicting":
      return "Conflicting";
    case "outdated":
      return "Outdated";
    case "unverified":
    default:
      return "Unverified";
  }
}

export default function TrustBadge({ trust, theme = defaultTheme }: TrustBadgeProps) {
  const bg = trustColor(trust, theme);
  // Outdated uses the light border colour, so pair it with dark text; every
  // other state has a dark fill and uses white text.
  const fg = trust === "outdated" ? theme.colors.fg : theme.colors.onPrimary;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Trust: ${trustLabel(trust)}`}
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.pill,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
        },
      ]}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.caption, fontWeight: "700" }}>
        {trustLabel(trust)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
  },
});
