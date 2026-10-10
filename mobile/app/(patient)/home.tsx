// EchoVault mobile — patient home / orientation screen (PAT-1).
// Date and time, what is happening now and next, familiar people, and one tap
// to every main area. In caregiver-managed mode the screen shows fewer choices.
// The reminder banner (Module 15) shows the schedule reminder due now, read
// from the phone's cache so it keeps working while the hub is off.

import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { listVerifiedPeople } from "../../src/api/people";
import { todaySchedule } from "../../src/api/schedule";
import BigButton from "../../src/components/BigButton";
import { Notice } from "../../src/components/Notice";
import PersonCard from "../../src/components/PersonCard";
import { ReminderBanner } from "../../src/components/ReminderBanner";
import { offline } from "../../src/offline";
import { withCache } from "../../src/patient/cached";
import { usePatient } from "../../src/patient/context";
import { comingUp, isForDay, timeState } from "../../src/patient/logic";
import { useTheme } from "../../src/theme-context";
import { clockLabel, dateLabel, greeting, nowLabel } from "../../src/time";
import type { Person, ScheduleOccurrence } from "../../src/types";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function Home() {
  const theme = useTheme();
  const { name, managedMode, hubUrl, reload } = usePatient();
  const now = useClock();
  const [items, setItems] = useState<ScheduleOccurrence[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { colors, fontSizes, spacing } = theme;

  const load = useCallback(async () => {
    const [sched, ppl] = await Promise.allSettled([
      withCache("schedule-today", todaySchedule),
      withCache("people", listVerifiedPeople),
    ]);
    if (sched.status === "fulfilled") {
      setItems(isForDay(sched.value.data, new Date()) ? sched.value.data : []);
    } else {
      setItems(null);
    }
    if (ppl.status === "fulfilled") setPeople(ppl.value.data);
    setUnreachable(
      (sched.status === "fulfilled" && sched.value.fromCache)
      || (ppl.status === "fulfilled" && ppl.value.fromCache)
      || sched.status === "rejected",
    );
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(), reload()]);
    setRefreshing(false);
  }

  const next = items ? comingUp(items, now, managedMode ? 2 : 3) : [];
  const familiar = people.slice(0, managedMode ? 2 : 4);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.page, { padding: spacing.lg, gap: spacing.md }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <ReminderBanner reminders={offline.reminders} />
        <View accessible accessibilityRole="header">
          <Text style={{ fontSize: fontSizes.button, color: colors.muted }}>{greeting(now)}{name ? "," : ""}</Text>
          {name ? <Text style={{ fontSize: fontSizes.display, fontWeight: "800", color: colors.fg }}>{name}</Text> : null}
        </View>
        <View
          accessible
          style={{ backgroundColor: colors.card, borderRadius: theme.radii.lg, padding: spacing.lg, gap: spacing.xs }}
        >
          <Text style={{ fontSize: fontSizes.button, color: colors.fg, fontWeight: "600" }}>{dateLabel(now)}</Text>
          <Text style={{ fontSize: fontSizes.display, color: colors.primary, fontWeight: "800" }}>{nowLabel(now)}</Text>
        </View>

        {unreachable ? <Notice tone="warning" text="Can't reach the helper right now. This may not be up to date." /> : null}

        <Text style={[styles.section, { fontSize: fontSizes.title, color: colors.fg, marginTop: spacing.sm }]} accessibilityRole="header">
          Coming up
        </Text>
        {items === null ? (
          <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>Your schedule is not available right now.</Text>
        ) : next.length === 0 ? (
          <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>Nothing else is planned for today.</Text>
        ) : (
          next.map((item) => (
            <View
              key={item.id + item.occurrence_at}
              accessible
              style={{ borderLeftWidth: 6, borderLeftColor: colors.primary, paddingLeft: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ fontSize: fontSizes.body, color: colors.primary, fontWeight: "700" }}>
                {timeState(item, now) === "now" ? "Now" : clockLabel(item.occurrence_at)}
              </Text>
              <Text style={{ fontSize: fontSizes.button, color: colors.fg, fontWeight: "600" }}>{item.title}</Text>
              {item.person_name || item.place_name ? (
                <Text style={{ fontSize: fontSizes.body, color: colors.muted }}>
                  {[item.person_name && `with ${item.person_name}`, item.place_name && `at ${item.place_name}`].filter(Boolean).join(" ")}
                </Text>
              ) : null}
            </View>
          ))
        )}

        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <BigButton icon="🗣️" label="Ask a question" onPress={() => router.push("/ask")} theme={theme} />
          <BigButton icon="📅" label="My day" onPress={() => router.push("/schedule")} theme={theme} />
          <BigButton icon="👪" label="My family" onPress={() => router.push("/people")} theme={theme} />
          {managedMode ? null : (
            <BigButton icon="🧩" label="Games" variant="secondary" onPress={() => router.push("/games")} theme={theme} />
          )}
        </View>

        {familiar.length ? (
          <>
            <Text style={[styles.section, { fontSize: fontSizes.title, color: colors.fg, marginTop: spacing.sm }]} accessibilityRole="header">
              Familiar faces
            </Text>
            {familiar.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                hubUrl={hubUrl}
                compact
                patientView
                onPress={() => router.push({ pathname: "/people", params: { id: p.id } })}
                theme={theme}
              />
            ))}
          </>
        ) : null}

        <Text
          onPress={() => router.push({ pathname: "/", params: { setup: "1" } })}
          accessibilityRole="link"
          style={{ fontSize: fontSizes.caption, color: colors.muted, textDecorationLine: "underline", textAlign: "center", paddingVertical: spacing.md }}
        >
          Hub settings (for caregivers)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 200 },
  section: { fontWeight: "700" },
});
