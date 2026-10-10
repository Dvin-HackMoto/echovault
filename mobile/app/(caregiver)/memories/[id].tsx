// EchoVault mobile — caregiver memory add/edit form (CGV-2).
//
// id === 'new'  -> create (createMemory)
// id === '<id>' -> edit   (getMemory to prefill, updateMemory to save)
//
// Fields: content (required, multiline), category / importance / validity as
// segmented single-selects over the exact src/types unions, validity dates
// (valid_from / valid_until) shown ONLY for 'scheduled' or 'temporary', and an
// optional person picked from listPeople(). All network I/O goes through
// src/api/* — never a raw fetch.
//
// BACKEND IS A STUB: the memories (and people) routes 404 until MEM-2/MEM-4
// (and the People module) land. This form is wired to the documented contract
// and renders the ApiError message in its error state instead of crashing.

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getHubUrl } from "../../../src/api/client";
import {
  createMemory,
  getMemory,
  updateMemory,
  type MemoryInput,
} from "../../../src/api/memories";
import { listPeople } from "../../../src/api/people";
import BigButton from "../../../src/components/BigButton";
import PersonCard from "../../../src/components/PersonCard";
import type { Theme } from "../../../src/theme";
import { useTheme } from "../../../src/theme-context";
import type { Category, Importance, Person, Validity } from "../../../src/types";

type Phase = "loading" | "error" | "ready";

// Option lists mirror the src/types unions exactly (never free-typed).
const CATEGORY_OPTIONS: Category[] = [
  "identity",
  "routine",
  "history",
  "preference",
  "care_safety",
  "engagement",
];
const IMPORTANCE_OPTIONS: Importance[] = ["critical", "important", "general"];
const VALIDITY_OPTIONS: Validity[] = ["persistent", "scheduled", "temporary", "archived"];

export default function MemoryForm() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields.
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("history");
  const [importance, setImportance] = useState<Importance>("general");
  const [validity, setValidity] = useState<Validity>("persistent");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);

  // People picker data.
  const [people, setPeople] = useState<Person[]>([]);
  const [hubUrl, setHubUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const [url, peopleRows] = await Promise.all([getHubUrl(), loadPeople()]);
      setHubUrl(url);
      setPeople(peopleRows);

      if (!isNew && id) {
        const memory = await getMemory(id);
        setContent(memory.content);
        setCategory(memory.category);
        setImportance(memory.importance);
        setValidity(memory.validity);
        setValidFrom(memory.valid_from ?? "");
        setValidUntil(memory.valid_until ?? "");
        setPersonId(memory.person_id ?? null);
      }
      setPhase("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this memory.");
      setPhase("error");
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  const showDates = validity === "scheduled" || validity === "temporary";

  async function onSave() {
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert("Content required", "Please enter what this memory says.");
      return;
    }

    // Build the payload against the documented MemoryInput contract. Dates are
    // only sent for scheduled/temporary; cleared otherwise so stale values
    // don't linger on the record.
    const input: MemoryInput = {
      content: trimmed,
      category,
      importance,
      validity,
      valid_from: showDates ? emptyToNull(validFrom) : null,
      valid_until: showDates ? emptyToNull(validUntil) : null,
      person_id: personId,
    };

    setSaving(true);
    try {
      if (isNew) {
        await createMemory(input);
      } else if (id) {
        await updateMemory(id, input);
      }
      router.back();
    } catch (err) {
      Alert.alert(
        "Couldn't save",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.center, { padding: theme.spacing.lg, gap: theme.spacing.md }]}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Can't open this memory
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
            {error}
          </Text>
          <BigButton label="Try again" onPress={() => void load()} theme={theme} />
          <BigButton label="Back" variant="danger" onPress={() => router.back()} theme={theme} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          {isNew ? "Add memory" : "Edit memory"}
        </Text>

        {/* Content (required). */}
        <Field label="What should EchoVault remember?" theme={theme}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="e.g. Maria is your daughter and visits on Sundays."
            placeholderTextColor={theme.colors.muted}
            multiline
            editable={!saving}
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
                fontSize: theme.fontSizes.body,
                color: theme.colors.fg,
                minHeight: theme.touchTargets.large,
                textAlignVertical: "top",
              },
            ]}
          />
        </Field>

        {/* Category. */}
        <Field label="Category" theme={theme}>
          <Segmented
            theme={theme}
            options={CATEGORY_OPTIONS}
            selected={category}
            onSelect={setCategory}
            labelFor={labelCategory}
          />
        </Field>

        {/* Importance. */}
        <Field label="Importance" theme={theme}>
          <Segmented
            theme={theme}
            options={IMPORTANCE_OPTIONS}
            selected={importance}
            onSelect={setImportance}
            labelFor={labelImportance}
          />
        </Field>

        {/* Validity. */}
        <Field label="Validity" theme={theme}>
          <Segmented
            theme={theme}
            options={VALIDITY_OPTIONS}
            selected={validity}
            onSelect={setValidity}
            labelFor={labelValidity}
          />
        </Field>

        {/* Dates only matter for scheduled/temporary memories. */}
        {showDates ? (
          <>
            <Field label="Valid from" theme={theme}>
              <TextInput
                value={validFrom}
                onChangeText={setValidFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.md,
                    padding: theme.spacing.md,
                    fontSize: theme.fontSizes.body,
                    color: theme.colors.fg,
                    minHeight: theme.touchTargets.min,
                  },
                ]}
              />
            </Field>
            <Field label="Valid until" theme={theme}>
              <TextInput
                value={validUntil}
                onChangeText={setValidUntil}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.md,
                    padding: theme.spacing.md,
                    fontSize: theme.fontSizes.body,
                    color: theme.colors.fg,
                    minHeight: theme.touchTargets.min,
                  },
                ]}
              />
            </Field>
          </>
        ) : null}

        {/* Optional person. */}
        <Field label="About someone? (optional)" theme={theme}>
          {people.length === 0 ? (
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
              No people to link yet.
            </Text>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: personId === null }}
                accessibilityLabel="No one"
                onPress={() => setPersonId(null)}
                style={({ pressed }) => [
                  styles.noneRow,
                  {
                    backgroundColor: personId === null ? theme.colors.primary : theme.colors.card,
                    borderColor: personId === null ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radii.md,
                    padding: theme.spacing.md,
                    minHeight: theme.touchTargets.min,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: personId === null ? theme.colors.onPrimary : theme.colors.fg,
                    fontSize: theme.fontSizes.body,
                    fontWeight: "600",
                  }}
                >
                  No one
                </Text>
              </Pressable>

              {people.map((person) => {
                const active = personId === person.id;
                return (
                  <Pressable
                    key={person.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={person.name}
                    onPress={() => setPersonId(active ? null : person.id)}
                    style={({ pressed }) => [
                      {
                        borderRadius: theme.radii.md,
                        borderWidth: active ? 2 : 0,
                        borderColor: active ? theme.colors.primary : "transparent",
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <PersonCard person={person} hubUrl={hubUrl} theme={theme} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </Field>

        <BigButton
          label={saving ? "Saving…" : isNew ? "Create memory" : "Save changes"}
          onPress={() => void onSave()}
          loading={saving}
          theme={theme}
        />
        <BigButton
          label="Cancel"
          variant="danger"
          onPress={() => router.back()}
          disabled={saving}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// People load is tolerant: the People module is also a stub, so if listPeople()
// fails the form still works for everything except linking a person.
async function loadPeople(): Promise<Person[]> {
  try {
    return await listPeople();
  } catch {
    return [];
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

// ──────────────────────────── field + segmented ───────────────────────────

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  theme,
  options,
  selected,
  onSelect,
  labelFor,
}: {
  theme: Theme;
  options: T[];
  selected: T;
  onSelect: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <View style={styles.segmentWrap}>
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <Pressable
            key={opt}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelFor(opt)}
            onPress={() => onSelect(opt)}
            style={({ pressed }) => [
              styles.segment,
              {
                backgroundColor: active ? theme.colors.primary : theme.colors.card,
                borderColor: active ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radii.pill,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.touchTargets.min,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.colors.onPrimary : theme.colors.fg,
                fontSize: theme.fontSizes.body,
                fontWeight: "600",
              }}
            >
              {labelFor(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────── enum labels ──────────────────────────────

function labelCategory(c: Category): string {
  switch (c) {
    case "identity":
      return "Identity";
    case "routine":
      return "Routine";
    case "history":
      return "History";
    case "preference":
      return "Preference";
    case "care_safety":
      return "Care & safety";
    case "engagement":
      return "Engagement";
  }
}

function labelImportance(i: Importance): string {
  switch (i) {
    case "critical":
      return "Critical";
    case "important":
      return "Important";
    case "general":
      return "General";
  }
}

function labelValidity(v: Validity): string {
  switch (v) {
    case "persistent":
      return "Persistent";
    case "scheduled":
      return "Scheduled";
    case "temporary":
      return "Temporary";
    case "archived":
      return "Archived";
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1 },
  segmentWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segment: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noneRow: {
    borderWidth: 1,
    justifyContent: "center",
  },
});
