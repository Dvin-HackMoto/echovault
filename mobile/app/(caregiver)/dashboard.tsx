// EchoVault mobile — caregiver dashboard (CGV-6, REAL backend).
//
// Landing screen of the caregiver group. Calls the REAL GET /dashboard
// (src/api/dashboard) and renders counts + lists for everything that needs a
// caregiver's attention: unverified memories, conflicting pairs, outdated
// memories, medications needing confirmation, and flagged assistant answers.
// Each attention row deep-links into the screen that fixes it (memory rows ->
// /(caregiver)/memories, medication rows -> /(caregiver)/medications). A flagged
// answer opens a review: fix a memory, or clear the flag once it is fixed.
//
// HARD PRODUCT CONSTRAINT (docs/PRODUCT.md): the activity summary reports
// ENGAGEMENT only — played vs skipped counts and the topic. NEVER a score,
// rating, percentage, accuracy or cognitive measure. A visible note says so.

import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { flagAnswer } from "../../src/api/assistant";
import { ApiError } from "../../src/api/client";
import { getDashboard, type DashboardResponse } from "../../src/api/dashboard";
import BigButton from "../../src/components/BigButton";
import TrustBadge from "../../src/components/TrustBadge";
import { useTheme } from "../../src/theme-context";
import type { Theme } from "../../src/theme";
import type { AssistantLog, MedicationLogWithMed, Memory } from "../../src/types";
import { useCaregiverGate } from "./_layout";

type Phase = "loading" | "error" | "ready";

export default function CaregiverDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { leaveCaregiverMode, can, caregiver } = useCaregiverGate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const result = await getDashboard();
      setData(result);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the dashboard.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A flagged answer came from saved records (assistant_log.memory_ids): the fix is
  // to correct the memory it used, then clear the flag
  // (POST /assistant/log/{id}/flag {flagged: false}).
  function reviewAnswer(log: AssistantLog) {
    const buttons: { text: string; style?: "cancel"; onPress?: () => void }[] = [
      { text: "Close", style: "cancel" },
      { text: "Fix a memory", onPress: () => router.push("/(caregiver)/memories") },
    ];
    if (can("update")) {
      buttons.push({
        text: "Clear the flag",
        onPress: () => {
          flagAnswer(log.id, false)
            .then(() => load())
            .catch((err) => Alert.alert("Couldn't clear the flag", err instanceof ApiError ? err.message : "Something went wrong."));
        },
      });
    }
    Alert.alert("Flagged answer", `Question: ${log.question}\n\nAnswer: ${log.answer}`, buttons);
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
            Can't load the dashboard
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
            {error}
          </Text>
          <BigButton label="Try again" onPress={() => void load()} theme={theme} />
        </View>
      </SafeAreaView>
    );
  }

  const d = data!;
  const nothingToReview =
    d.unverified_memories.length === 0 &&
    d.conflicting_pairs.length === 0 &&
    d.outdated_memories.length === 0 &&
    d.medication_attention.length === 0 &&
    d.flagged_answers.length === 0;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          Dashboard
        </Text>
        {caregiver ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            Signed in as {caregiver.name}
            {caregiver.access_level === "viewer" ? " (view only)" : caregiver.access_level === "editor" ? " (editor)" : " (admin)"}
          </Text>
        ) : null}

        {nothingToReview ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            Nothing needs your attention right now. Everything looks reviewed.
          </Text>
        ) : null}

        {/* Memories needing review — each row deep-links into memories. */}
        <Section
          title="Unverified memories"
          count={d.unverified_memories.length}
          theme={theme}
          emptyNote="No unverified memories."
        >
          {d.unverified_memories.map((m) => (
            <MemoryRow key={m.id} memory={m} theme={theme} onPress={() => router.push("/(caregiver)/memories")} />
          ))}
        </Section>

        <Section
          title="Conflicting memories"
          count={d.conflicting_pairs.length}
          theme={theme}
          emptyNote="No conflicts to resolve."
        >
          {d.conflicting_pairs.map((m) => (
            <MemoryRow key={m.id} memory={m} theme={theme} onPress={() => router.push("/(caregiver)/memories")} />
          ))}
        </Section>

        <Section
          title="Outdated memories"
          count={d.outdated_memories.length}
          theme={theme}
          emptyNote="Nothing has gone out of date."
        >
          {d.outdated_memories.map((m) => (
            <MemoryRow key={m.id} memory={m} theme={theme} onPress={() => router.push("/(caregiver)/memories")} />
          ))}
        </Section>

        {/* Medications needing confirmation — deep-link into medications. */}
        <Section
          title="Medications to confirm"
          count={d.medication_attention.length}
          theme={theme}
          emptyNote="No medications are waiting on confirmation."
        >
          {d.medication_attention.map((log) => (
            <MedicationRow
              key={log.id}
              log={log}
              theme={theme}
              onPress={() => router.push("/(caregiver)/medications")}
            />
          ))}
        </Section>

        {/* Flagged assistant answers: fix the source memory, then clear the flag. */}
        <Section
          title="Flagged answers"
          count={d.flagged_answers.length}
          theme={theme}
          emptyNote="No answers were flagged for review."
        >
          {d.flagged_answers.map((log) => (
            <AssistantRow key={log.id} log={log} theme={theme} onPress={() => reviewAnswer(log)} />
          ))}
        </Section>

        {/* Activity summary — ENGAGEMENT ONLY: played vs skipped + topic. */}
        <ActivitySummary data={d} theme={theme} />

        {/* Simple hub to the other caregiver screens. */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Manage
          </Text>
          <BigButton label="Memories" onPress={() => router.push("/(caregiver)/memories")} theme={theme} />
          <BigButton label="People" onPress={() => router.push("/(caregiver)/people")} theme={theme} />
          <BigButton label="Schedule" onPress={() => router.push("/(caregiver)/schedule")} theme={theme} />
          <BigButton label="Medications" onPress={() => router.push("/(caregiver)/medications")} theme={theme} />
          <BigButton label="Activities" onPress={() => router.push("/(caregiver)/activities")} theme={theme} />
          <BigButton label="Backup" onPress={() => router.push("/(caregiver)/backup")} theme={theme} />
        </View>

        <BigButton
          label="Leave caregiver mode"
          variant="danger"
          onPress={() => void leaveCaregiverMode()}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ───────────────────────────────── sections ───────────────────────────────

function Section({
  title,
  count,
  emptyNote,
  theme,
  children,
}: {
  title: string;
  count: number;
  emptyNote: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={styles.sectionHeader}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
          {title}
        </Text>
        <View
          style={[
            styles.countPill,
            {
              backgroundColor: count > 0 ? theme.colors.primary : theme.colors.border,
              borderRadius: theme.radii.pill,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
            },
          ]}
        >
          <Text
            style={{
              color: count > 0 ? theme.colors.onPrimary : theme.colors.fg,
              fontSize: theme.fontSizes.caption,
              fontWeight: "700",
            }}
          >
            {count}
          </Text>
        </View>
      </View>
      {count === 0 ? (
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>{emptyNote}</Text>
      ) : (
        children
      )}
    </View>
  );
}

function RowShell({
  theme,
  onPress,
  children,
}: {
  theme: Theme;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

function MemoryRow({ memory, theme, onPress }: { memory: Memory; theme: Theme; onPress: () => void }) {
  const label = memory.title?.trim() || memory.content;
  return (
    <RowShell theme={theme} onPress={onPress}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "600" }} numberOfLines={2}>
          {label}
        </Text>
        <TrustBadge trust={memory.trust} theme={theme} />
      </View>
    </RowShell>
  );
}

function MedicationRow({
  log,
  theme,
  onPress,
}: {
  log: MedicationLogWithMed;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <RowShell theme={theme} onPress={onPress}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "600" }} numberOfLines={1}>
          {log.medication_name} · {log.medication_dose}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
          Due {log.due_at} · {log.status}
        </Text>
      </View>
    </RowShell>
  );
}

function AssistantRow({ log, theme, onPress }: { log: AssistantLog; theme: Theme; onPress: () => void }) {
  return (
    <RowShell theme={theme} onPress={onPress}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "600" }} numberOfLines={2}>
          {log.question}
        </Text>
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }} numberOfLines={2}>
          {log.answer}
        </Text>
      </View>
    </RowShell>
  );
}

function ActivitySummary({ data, theme }: { data: DashboardResponse; theme: Theme }) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        Activity
      </Text>
      {/* Engagement, not an assessment — the hard product constraint, visible. */}
      <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
        This shows engagement (how often activities were played or skipped), not
        a score or clinical assessment.
      </Text>
      {data.activity_summary.length === 0 ? (
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
          No activity to show yet.
        </Text>
      ) : (
        data.activity_summary.map((row, i) => (
          <View
            key={`${row.activity}-${row.topic ?? "all"}-${i}`}
            style={[
              styles.row,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.md,
                padding: theme.spacing.md,
                gap: theme.spacing.xs,
              },
            ]}
          >
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "600" }}>
              {row.activity}
              {row.topic ? ` · ${row.topic}` : ""}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
              Played {row.played_count} · Skipped {row.skipped_count}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  countPill: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
  },
  row: {
    borderWidth: 1,
  },
});
