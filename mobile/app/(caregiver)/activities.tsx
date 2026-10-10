// EchoVault mobile — caregiver activities (CGV-7).
//
// Two halves:
//   1. Settings (REAL backend, GET/PUT /settings via src/api/settings): edit the
//      game topics, difficulty, trivia frequency and quiet hours that drive the
//      patient's games/trivia. Saved with updateSettings(partial); local state is
//      replaced by the full SettingsValues the hub returns.
//   2. Activity history: the engagement summary from GET /dashboard
//      (activity_summary: played and skipped counts per activity and topic,
//      from activity_log, written by POST /games/result and /trivia/result).
//
// HARD PRODUCT CONSTRAINT (docs/PRODUCT.md): activity is reported as ENGAGEMENT
// (played vs skipped, topics played) — NEVER a score, rating, percentage,
// accuracy or cognitive measure. A visible note states this and no score is shown.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "../../src/api/client";
import { getDashboard, type ActivitySummaryRow } from "../../src/api/dashboard";
import { getSettings, updateSettings } from "../../src/api/settings";
import BigButton from "../../src/components/BigButton";
import { useTheme } from "../../src/theme-context";
import type { Theme } from "../../src/theme";
import type { ActivityKind, Difficulty, GameTopic, SettingsValues } from "../../src/types";
import { useCaregiverGate } from "./_layout";

type Phase = "loading" | "error" | "ready";

/** The five allowed game topics (constants.ALLOWED_GAME_TOPICS) + readable labels. */
const GAME_TOPICS: { value: GameTopic; label: string }[] = [
  { value: "family_names", label: "Family names" },
  { value: "relationships", label: "Relationships" },
  { value: "routines", label: "Routines" },
  { value: "familiar_places", label: "Familiar places" },
  { value: "recent_events", label: "Recent events" },
];

const DIFFICULTIES: Difficulty[] = [1, 2, 3];

/** Friendly names for activity_log.activity. */
const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  family_matching: "Family matching",
  name_recall: "Who is this?",
  event_recall: "Special days",
  routine_recall: "My day",
  picture_matching: "Picture matching",
  memory_quiz: "About me",
  trivia_prompt: "Questions of the day",
};

export default function CaregiverActivities() {
  const theme = useTheme();
  const { can } = useCaregiverGate();
  const [history, setHistory] = useState<ActivitySummaryRow[] | null>([]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  // Working copy of the editable settings.
  const [topics, setTopics] = useState<GameTopic[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [triviaFreq, setTriviaFreq] = useState<string>("");
  const [quietStart, setQuietStart] = useState<string>("");
  const [quietEnd, setQuietEnd] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Replace local state from a full SettingsValues (from GET or PUT). */
  const applySettings = useCallback((s: SettingsValues) => {
    setTopics(s.game_topics);
    setDifficulty(s.game_difficulty);
    setTriviaFreq(String(s.trivia_frequency_min));
    setQuietStart(s.quiet_hours.start);
    setQuietEnd(s.quiet_hours.end);
  }, []);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    // the engagement summary is extra: if it fails, the settings still load
    getDashboard()
      .then((d) => setHistory(d.activity_summary))
      .catch(() => setHistory(null));
    try {
      const s = await getSettings();
      applySettings(s);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load activity settings.");
      setPhase("error");
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleTopic(topic: GameTopic) {
    setSaved(false);
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }

  async function onSave() {
    setSaveError(null);
    setSaved(false);

    // Validate the numeric trivia frequency before sending.
    const freq = Number(triviaFreq);
    if (!Number.isFinite(freq) || freq <= 0 || !Number.isInteger(freq)) {
      setSaveError("Trivia frequency must be a whole number of minutes.");
      return;
    }
    if (topics.length === 0) {
      setSaveError("Pick at least one game topic.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSettings({
        game_topics: topics,
        game_difficulty: difficulty,
        trivia_frequency_min: freq,
        quiet_hours: { start: quietStart.trim(), end: quietEnd.trim() },
      });
      applySettings(updated); // adopt the hub's canonical values
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save settings.");
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
            Can't load activity settings
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
            {error}
          </Text>
          <BigButton label="Try again" onPress={() => void load()} theme={theme} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          Activities
        </Text>

        {/* Engagement, not an assessment — the hard product constraint, visible. */}
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
          Activities support engagement and connection. They are NOT a clinical
          assessment or a test, and show no scores, grades or accuracy.
        </Text>

        {/* ───────────────────────── Settings (REAL) ───────────────────────── */}
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Game topics
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
            Choose which topics the patient's games and trivia draw from.
          </Text>
          <View style={{ gap: theme.spacing.sm }}>
            {GAME_TOPICS.map((t) => (
              <TopicToggle
                key={t.value}
                label={t.label}
                selected={topics.includes(t.value)}
                onPress={() => toggleTopic(t.value)}
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Difficulty
          </Text>
          <View style={styles.segmentRow}>
            {DIFFICULTIES.map((d) => (
              <Segment
                key={d}
                label={String(d)}
                selected={difficulty === d}
                onPress={() => {
                  setSaved(false);
                  setDifficulty(d);
                }}
                theme={theme}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Trivia frequency
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
            How often (in minutes) a trivia prompt may appear.
          </Text>
          <TextInput
            value={triviaFreq}
            onChangeText={(v) => {
              setSaved(false);
              setTriviaFreq(v);
            }}
            keyboardType="number-pad"
            placeholder="minutes"
            placeholderTextColor={theme.colors.muted}
            style={inputStyle(theme)}
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Quiet hours
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
            No prompts between these times. Use 24-hour HH:MM (e.g. 21:00).
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>Start</Text>
              <TextInput
                value={quietStart}
                onChangeText={(v) => {
                  setSaved(false);
                  setQuietStart(v);
                }}
                placeholder="HH:MM"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle(theme)}
              />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>End</Text>
              <TextInput
                value={quietEnd}
                onChangeText={(v) => {
                  setSaved(false);
                  setQuietEnd(v);
                }}
                placeholder="HH:MM"
                placeholderTextColor={theme.colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle(theme)}
              />
            </View>
          </View>
        </View>

        {saveError ? (
          <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>{saveError}</Text>
        ) : null}
        {saved ? (
          <Text style={{ color: theme.colors.success, fontSize: theme.fontSizes.body }}>
            Settings saved.
          </Text>
        ) : null}

        {can("update") ? (
          <BigButton
            label={saving ? "Saving…" : "Save settings"}
            onPress={() => void onSave()}
            loading={saving}
            theme={theme}
          />
        ) : (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            You have view-only access, so these settings can't be changed here.
          </Text>
        )}

        {/* ───────────── Activity history (GET /dashboard activity_summary) ───────────── */}
        <View
          style={[
            styles.historyCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
              gap: theme.spacing.sm,
            },
          ]}
        >
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Activity history
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            What was played or skipped, by activity and topic. This shows engagement
            and preferences only. It is not a score or an assessment.
          </Text>
          {history === null ? (
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
              Activity history is not available right now.
            </Text>
          ) : history.length === 0 ? (
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
              No games or questions have been played yet.
            </Text>
          ) : (
            history.map((row) => (
              <View key={`${row.activity}|${row.topic ?? ""}`} accessible style={{ gap: 2 }}>
                <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "600" }}>
                  {ACTIVITY_LABELS[row.activity] ?? row.activity}
                  {row.topic ? ` · ${GAME_TOPICS.find((t) => t.value === row.topic)?.label ?? row.topic}` : ""}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
                  Played {row.played_count} · Skipped {row.skipped_count}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────── small UI ─────────────────────────────────

function TopicToggle({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.colors.onPrimary : theme.colors.fg,
          fontSize: theme.fontSizes.body,
          fontWeight: "600",
        }}
      >
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

function Segment({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Difficulty ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.colors.onPrimary : theme.colors.fg,
          fontSize: theme.fontSizes.title,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function inputStyle(theme: Theme) {
  return {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    fontSize: theme.fontSizes.body,
    color: theme.colors.fg,
    minHeight: theme.touchTargets.min,
  };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentRow: { flexDirection: "row", gap: 12 },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  toggle: { borderWidth: 1 },
  historyCard: { borderWidth: 1 },
});
