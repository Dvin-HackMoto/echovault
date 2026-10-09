// EchoVault mobile — PersonCard.
// Shows a person's photo, name, relationship and short notes. Falls back to an
// initials avatar when there's no photo (or it fails to load). Honors the
// theme and font scale. Tappable when `onPress` is given.

import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { photoUri } from "../api/client";
import { theme as defaultTheme, type Theme } from "../theme";
import type { Person } from "../types";

export interface PersonCardProps {
  person: Person;
  /**
   * Hub base URL, used to turn `photo_url` ("/photos/x.jpg") or a stored
   * `photo_path` into a full URL. Photos live on the hub (storage/photos/,
   * served at /photos) and only the path is in the DB.
   */
  hubUrl?: string | null;
  onPress?: () => void;
  /** Name and relationship only (home screen, answers). */
  compact?: boolean;
  /** Speak to the patient: "Your daughter" instead of "daughter". */
  patientView?: boolean;
  theme?: Theme;
}

/** The name the patient knows the person by. */
export function displayName(person: Person): string {
  return person.nickname || person.name;
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
  onPress,
  compact = false,
  patientView = false,
  theme = defaultTheme,
}: PersonCardProps) {
  const uri = photoUri(hubUrl, person.photo_url, person.photo_path);
  const [photoFailed, setPhotoFailed] = useState(false);
  const avatarSize = compact ? theme.touchTargets.large : theme.touchTargets.large + 24;
  const name = patientView ? displayName(person) : person.name;
  const relationship = patientView ? `Your ${person.relationship}` : person.relationship;
  const label = `${name}, ${relationship}`;

  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: compact ? theme.spacing.sm : theme.spacing.md,
        },
      ]}
    >
      {uri && !photoFailed ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
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
            {initials(name) || "?"}
          </Text>
        </View>
      )}

      <View style={[styles.text, { marginLeft: theme.spacing.md }]}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }} numberOfLines={1}>
          {relationship}
        </Text>
        {!compact && person.notes ? (
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, marginTop: theme.spacing.xs }} numberOfLines={3}>
            {person.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="summary" accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {body}
    </Pressable>
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
