// EchoVault mobile — PersonCard.
// Shows a person's photo, name, relationship and short notes. Falls back to an
// initials avatar when there's no photo. Honors the theme and font scale.

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { theme as defaultTheme, type Theme } from "../theme";
import type { Person } from "../types";

export interface PersonCardProps {
  person: Person;
  /**
   * Hub base URL, used to turn a stored `photo_path` into a full URL. Photos
   * live on the hub (storage/photos/) and only the path is in the DB.
   */
  hubUrl?: string | null;
  theme?: Theme;
}

/** Build a photo URL from the hub base + stored path, or null when absent. */
function photoUri(photoPath: string | null | undefined, hubUrl: string | null | undefined): string | null {
  if (!photoPath) return null;
  if (/^https?:\/\//i.test(photoPath)) return photoPath;
  if (!hubUrl) return null;
  const base = hubUrl.replace(/\/+$/, "");
  return `${base}/${photoPath.replace(/^\/+/, "")}`;
}

/** First letters of up to two name parts, for the placeholder avatar. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function PersonCard({
  person,
  hubUrl,
  theme = defaultTheme,
}: PersonCardProps) {
  const uri = photoUri(person.photo_path, hubUrl);
  const avatarSize = theme.touchTargets.large;

  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: theme.colors.primary,
            },
          ]}
        >
          <Text style={{ color: theme.colors.onPrimary, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            {initials(person.name) || "?"}
          </Text>
        </View>
      )}

      <View style={[styles.text, { marginLeft: theme.spacing.md }]}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }} numberOfLines={1}>
          {person.relationship}
        </Text>
        {person.notes ? (
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, marginTop: theme.spacing.xs }} numberOfLines={2}>
            {person.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
  },
});
