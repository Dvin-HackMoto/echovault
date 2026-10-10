// EchoVault mobile — family photo directory (PAT-5).
// Verified people only, with photo, name and relationship. Tapping a person
// shows their details and the verified memories about them. ?id= opens a
// person directly (from the home screen or a trivia card's "See photos").

import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { photoUri } from "../../src/api/client";
import { verifiedMemoriesAbout } from "../../src/api/memories";
import { listVerifiedPeople } from "../../src/api/people";
import BigButton from "../../src/components/BigButton";
import { Notice } from "../../src/components/Notice";
import PersonCard, { displayName } from "../../src/components/PersonCard";
import { hubMessage, withCache, type Cached } from "../../src/patient/cached";
import { usePatient } from "../../src/patient/context";
import { useTheme } from "../../src/theme-context";
import type { Memory, Person } from "../../src/types";

export default function People() {
  const theme = useTheme();
  const { colors, fontSizes, spacing } = theme;
  const { hubUrl } = usePatient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [result, setResult] = useState<Cached<Person[]> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState<Person | null>(null);

  useFocusEffect(useCallback(() => {
    withCache("people", listVerifiedPeople)
      .then((r) => {
        setResult(r);
        setFailure(null);
      })
      .catch((e: unknown) => setFailure(hubMessage(e)));
  }, []));

  useEffect(() => {
    if (id && result) setOpen(result.data.find((p) => p.id === id) ?? null);
  }, [id, result]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 200 }}>
        {result?.fromCache ? <Notice tone="warning" text="Can't reach the helper right now. These may not be up to date." /> : null}
        {failure && !result ? <Notice tone="warning" text={failure} /> : null}
        {!result && !failure ? <ActivityIndicator size="large" style={{ marginTop: spacing.xl }} /> : null}
        {result && result.data.length === 0 ? (
          <Text style={{ fontSize: fontSizes.button, color: colors.muted }}>No one has been added yet.</Text>
        ) : null}
        {result?.data.map((p) => (
          <PersonCard key={p.id} person={p} hubUrl={hubUrl} patientView onPress={() => setOpen(p)} theme={theme} />
        ))}
      </ScrollView>
      {open ? <PersonDetails person={open} hubUrl={hubUrl} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PersonDetails({ person, hubUrl, onClose }: { person: Person; hubUrl: string | null; onClose: () => void }) {
  const theme = useTheme();
  const { colors, fontSizes, spacing } = theme;
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const uri = photoUri(hubUrl, person.photo_url, person.photo_path);

  useEffect(() => {
    verifiedMemoriesAbout(person.id).then(setMemories).catch(() => setMemories([]));
  }, [person.id]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 200 }}>
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width: "100%", aspectRatio: 1, borderRadius: theme.radii.lg, backgroundColor: colors.card }}
              accessibilityLabel={`Photo of ${displayName(person)}`}
            />
          ) : null}
          <Text style={{ fontSize: fontSizes.display, fontWeight: "800", color: colors.fg }} accessibilityRole="header">
            {displayName(person)}
          </Text>
          <Text style={{ fontSize: fontSizes.button, color: colors.muted }}>Your {person.relationship}</Text>
          {person.nickname && person.nickname !== person.name ? (
            <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>Full name: {person.name}</Text>
          ) : null}
          {person.notes ? <Text style={{ fontSize: fontSizes.button, color: colors.fg }}>{person.notes}</Text> : null}

          {memories === null ? <ActivityIndicator /> : null}
          {memories?.length ? (
            <View style={{ backgroundColor: colors.card, borderRadius: theme.radii.md, padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ fontSize: fontSizes.button, fontWeight: "700", color: colors.fg }}>Things to remember</Text>
              {memories.map((m) => (
                <Text key={m.id} style={{ fontSize: fontSizes.body, color: colors.fg }}>• {m.content}</Text>
              ))}
            </View>
          ) : null}
          <BigButton label="Back" variant="secondary" onPress={onClose} theme={theme} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
