// EchoVault mobile — today's schedule (PAT-4).
// Today's items in time order with the person or place. Past, current and
// upcoming items differ in label as well as color ("Earlier" / "Now" /
// "Later"), so color is never the only signal. Reads the saved copy when the
// hub is unreachable.

import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";

import { todaySchedule } from "../../src/api/schedule";
import { DemoTag, Notice } from "../../src/components/Notice";
import { hubMessage, withCache, type Cached } from "../../src/patient/cached";
import { isForDay, timeState, type TimeState } from "../../src/patient/logic";
import { useTheme } from "../../src/theme-context";
import { clockLabel, nowLabel } from "../../src/time";
import type { ScheduleOccurrence } from "../../src/types";

export default function Schedule() {
  const theme = useTheme();
  const { colors, fontSizes, spacing } = theme;
  const [result, setResult] = useState<Cached<ScheduleOccurrence[]> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setResult(await withCache("schedule-today", todaySchedule));
      setFailure(null);
    } catch (e) {
      setFailure(hubMessage(e));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const look: Record<TimeState, { label: string; fg: string; bg: string; sub: string; border: string }> = {
    past: { label: "Earlier", fg: colors.past, bg: colors.bg, sub: colors.past, border: colors.border },
    now: { label: "Now", fg: colors.onPrimary, bg: colors.primary, sub: colors.onPrimary, border: colors.primary },
    upcoming: { label: "Later", fg: colors.primary, bg: colors.card, sub: colors.muted, border: colors.border },
  };

  const now = new Date();
  const stale = result?.fromCache && !isForDay(result.data, now);
  const items = result && !stale ? result.data : [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 200 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <DemoTag feature="schedule" />
      {result?.fromCache && !stale ? (
        <Notice
          tone="warning"
          text={`Can't reach the helper right now. This list was saved at ${nowLabel(new Date(result.savedAt ?? 0))} and may not be up to date.`}
        />
      ) : null}
      {stale ? <Notice tone="warning" text="Can't reach the helper right now, and there is no saved schedule for today." /> : null}
      {failure && !result ? <Notice tone="warning" text={failure} /> : null}
      {!result && !failure ? <ActivityIndicator size="large" style={{ marginTop: spacing.xl }} /> : null}
      {result && !stale && items.length === 0 ? (
        <Text style={{ fontSize: fontSizes.button, color: colors.muted }}>Nothing is planned for today.</Text>
      ) : null}

      {items.map((item) => {
        const state = timeState(item, now);
        const l = look[state];
        const withWhom = [item.person_name && `with ${item.person_name}`, item.place_name && `at ${item.place_name}`]
          .filter(Boolean)
          .join(" ");
        return (
          <View
            key={item.id + item.occurrence_at}
            accessible
            accessibilityLabel={`${l.label}. ${clockLabel(item.occurrence_at)}. ${item.title}. ${withWhom}`}
            style={{
              flexDirection: "row",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: theme.radii.md,
              borderWidth: 2,
              backgroundColor: l.bg,
              borderColor: l.border,
            }}
          >
            <View style={{ width: 120 }}>
              <Text style={{ fontSize: fontSizes.caption, fontWeight: "800", color: l.fg }}>{l.label.toUpperCase()}</Text>
              <Text style={{ fontSize: fontSizes.button, fontWeight: "700", color: l.fg }}>{clockLabel(item.occurrence_at)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSizes.button, fontWeight: "600", color: state === "upcoming" ? colors.fg : l.fg }}>
                {item.title}
              </Text>
              {withWhom ? <Text style={{ fontSize: fontSizes.body, color: l.sub }}>{withWhom}</Text> : null}
              {item.notes ? <Text style={{ fontSize: fontSizes.body, color: l.sub }}>{item.notes}</Text> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
