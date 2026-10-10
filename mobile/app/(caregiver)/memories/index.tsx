// EchoVault mobile — caregiver memories list (CGV-2).
//
// Lists memories with trust + category filters, a shared TrustBadge per row, a
// short content preview, one-tap Verify, Delete-with-confirm, and conflict
// resolution for `conflicting` rows (POST /memories/{id}/resolve). Add/Edit
// navigate to the memories/[id] form. All network I/O goes through
// src/api/memories — never a raw fetch. Buttons this caregiver's access level
// does not allow are hidden (useCaregiverGate().can).

import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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

import { ApiError } from "../../../src/api/client";
import {
  deleteMemory,
  listMemories,
  resolveMemory,
  verifyMemory,
  type MemoryFilter,
} from "../../../src/api/memories";
import BigButton from "../../../src/components/BigButton";
import TrustBadge from "../../../src/components/TrustBadge";
import type { Theme } from "../../../src/theme";
import { useTheme } from "../../../src/theme-context";
import type { Category, Memory, Trust } from "../../../src/types";
import { useCaregiverGate } from "../_layout";

type Phase = "loading" | "error" | "ready";

// Enum option lists mirror the src/types unions exactly (never free-typed).
const TRUST_OPTIONS: Trust[] = ["verified", "unverified", "conflicting", "outdated"];
const CATEGORY_OPTIONS: Category[] = [
  "identity",
  "routine",
  "history",
  "preference",
  "care_safety",
  "engagement",
];

export default function CaregiverMemories() {
  const theme = useTheme();
  const router = useRouter();
  const { leaveCaregiverMode, can } = useCaregiverGate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [trustFilter, setTrustFilter] = useState<Trust | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);
  // Per-row busy state so one row's action doesn't disable the whole list.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (trust: Trust | null, category: Category | null) => {
      setPhase("loading");
      setError(null);
      const filter: MemoryFilter = {};
      if (trust) filter.trust = trust;
      if (category) filter.category = category;
      try {
        const rows = await listMemories(Object.keys(filter).length ? filter : undefined);
        setMemories(rows);
        setPhase("ready");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load memories.");
        setPhase("error");
      }
    },
    [],
  );

  // Reload whenever the screen regains focus (e.g. returning from the form) or
  // the active filters change.
  useFocusEffect(
    useCallback(() => {
      void load(trustFilter, categoryFilter);
    }, [load, trustFilter, categoryFilter]),
  );

  const refresh = useCallback(
    () => load(trustFilter, categoryFilter),
    [load, trustFilter, categoryFilter],
  );

  async function onVerify(id: string) {
    setBusyId(id);
    try {
      await verifyMemory(id);
      await refresh();
    } catch (err) {
      Alert.alert(
        "Couldn't verify",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function onDelete(memory: Memory) {
    const label = memory.title?.trim() || memory.content;
    Alert.alert(
      "Delete memory",
      `Delete "${label.slice(0, 80)}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(memory.id);
            try {
              await deleteMemory(memory.id);
              await refresh();
            } catch (err) {
              Alert.alert(
                "Couldn't delete",
                err instanceof ApiError ? err.message : "Something went wrong.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  // Conflict resolution (MEM-4): keep THIS memory as the verified one; the hub
  // archives the memory it conflicts with in the same step
  // (POST /memories/{id}/resolve). Without a partner it is a plain verify.
  function onResolve(memory: Memory) {
    const otherId = memory.conflicts_with ?? null;
    Alert.alert(
      "Resolve conflict",
      otherId
        ? "Keep this memory as the verified one and archive the memory it conflicts with?"
        : "Mark this memory as the verified one?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Keep this one",
          onPress: async () => {
            setBusyId(memory.id);
            try {
              if (otherId) {
                await resolveMemory(memory.id, "archived");
              } else {
                await verifyMemory(memory.id);
              }
              await refresh();
            } catch (err) {
              Alert.alert(
                "Couldn't resolve",
                err instanceof ApiError ? err.message : "Something went wrong.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={styles.headerRow}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
            Memories
          </Text>
        </View>

        {can("create") ? (
          <BigButton
            label="Add memory"
            onPress={() => router.push("/(caregiver)/memories/new")}
            theme={theme}
          />
        ) : null}

        {/* Filters — each re-calls listMemories with the chosen trust/category. */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Filter by trust
          </Text>
          <FilterChips
            theme={theme}
            options={TRUST_OPTIONS}
            selected={trustFilter}
            onSelect={setTrustFilter}
            labelFor={labelTrust}
          />
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Filter by category
          </Text>
          <FilterChips
            theme={theme}
            options={CATEGORY_OPTIONS}
            selected={categoryFilter}
            onSelect={setCategoryFilter}
            labelFor={labelCategory}
          />
        </View>

        {phase === "loading" ? (
          <View style={[styles.center, { padding: theme.spacing.xl }]}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : null}

        {phase === "error" ? (
          <View style={{ gap: theme.spacing.md, alignItems: "center", padding: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Can't load memories
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
              {error}
            </Text>
            <BigButton label="Try again" onPress={() => void refresh()} theme={theme} />
          </View>
        ) : null}

        {phase === "ready" && memories.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            No memories{trustFilter || categoryFilter ? " match these filters" : " yet"}. Use
            “Add memory” to create one.
          </Text>
        ) : null}

        {phase === "ready" && memories.length > 0
          ? memories.map((m) => (
              <MemoryRow
                key={m.id}
                memory={m}
                theme={theme}
                busy={busyId === m.id}
                onEdit={() =>
                  router.push({
                    pathname: "/(caregiver)/memories/[id]",
                    params: { id: m.id },
                  })
                }
                onVerify={() => void onVerify(m.id)}
                onDelete={() => onDelete(m)}
                onResolve={() => onResolve(m)}
              />
            ))
          : null}

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

// ─────────────────────────────── row + chips ──────────────────────────────

function MemoryRow({
  memory,
  theme,
  busy,
  onEdit,
  onVerify,
  onDelete,
  onResolve,
}: {
  memory: Memory;
  theme: Theme;
  busy: boolean;
  onEdit: () => void;
  onVerify: () => void;
  onDelete: () => void;
  onResolve: () => void;
}) {
  const { can } = useCaregiverGate();
  const preview = memory.title?.trim() || memory.content;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.rowTop}>
        <TrustBadge trust={memory.trust} theme={theme} />
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption, fontWeight: "600" }}>
          {labelCategory(memory.category)}
        </Text>
      </View>

      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body }} numberOfLines={3}>
        {preview}
      </Text>

      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={styles.actionRow}>
            {can("update") ? <ActionButton label="Edit" theme={theme} onPress={onEdit} /> : null}
            {memory.trust !== "verified" && can("update") ? (
              <ActionButton label="Verify" theme={theme} onPress={onVerify} />
            ) : null}
            {can("delete") ? <ActionButton label="Delete" theme={theme} variant="danger" onPress={onDelete} /> : null}
          </View>
          {memory.trust === "conflicting" && can("update") ? (
            <ActionButton label="Resolve conflict" theme={theme} onPress={onResolve} />
          ) : null}
        </View>
      )}
    </View>
  );
}

function ActionButton({
  label,
  theme,
  onPress,
  variant = "primary",
}: {
  label: string;
  theme: Theme;
  onPress: () => void;
  variant?: "primary" | "danger";
}) {
  const bg = variant === "danger" ? theme.colors.danger : theme.colors.primary;
  const fg = variant === "danger" ? theme.colors.onDanger : theme.colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.button, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function FilterChips<T extends string>({
  theme,
  options,
  selected,
  onSelect,
  labelFor,
}: {
  theme: Theme;
  options: T[];
  selected: T | null;
  onSelect: (value: T | null) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <View style={styles.chipWrap}>
      <Chip theme={theme} label="All" active={selected === null} onPress={() => onSelect(null)} />
      {options.map((opt) => (
        <Chip
          key={opt}
          theme={theme}
          label={labelFor(opt)}
          active={selected === opt}
          // Tapping the active chip clears it back to "All".
          onPress={() => onSelect(selected === opt ? null : opt)}
        />
      ))}
    </View>
  );
}

function Chip({
  theme,
  label,
  active,
  onPress,
}: {
  theme: Theme;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.card,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.pill,
          paddingVertical: theme.spacing.xs,
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
        {label}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────── enum labels ──────────────────────────────

function labelTrust(t: Trust): string {
  switch (t) {
    case "verified":
      return "Verified";
    case "unverified":
      return "Unverified";
    case "conflicting":
      return "Conflicting";
    case "outdated":
      return "Outdated";
  }
}

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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  card: { borderWidth: 1 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
