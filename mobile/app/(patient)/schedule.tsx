// EchoVault mobile — Today / Tomorrow (PAT-4, Kali design: Schedule).
// A timeline in time order with the person or place. Done, now and later
// differ in words as well as color ("Done" / "Now" / "Later"), so color is never
// the only signal. Reads the saved copy when the hub is unreachable.

import { router } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { scheduleOn, todaySchedule } from "../../src/api/schedule";
import { isForDay, timeState, type TimeState } from "../../src/patient/logic";
import { clockLabel, nowLabel, toStamp } from "../../src/time";
import type { ScheduleOccurrence } from "../../src/types";
import { kindIcon } from "../../src/ui/icons";
import { Banner, Card, DemoNote, EmptyState, IconBox, KaliTip, Loading, Pill, Screen, Segmented, TopBar, Txt } from "../../src/ui/kit";
import { t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { kc } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toStamp(d).slice(0, 10);
}

const DOT: Record<TimeState, string> = { past: kc.greenMid, now: kc.sun, upcoming: "rgba(114,154,201,.45)" };

export default function Schedule() {
  const L = useLang();
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const today = useHub(todaySchedule, "schedule-today");
  const next = useHub(() => scheduleOn(tomorrow()), "schedule-tomorrow");
  const source = day === "today" ? today : next;
  const now = new Date();

  // a saved "today" list from another day must not be shown as today
  const stale = day === "today" && today.fromCache && today.data && !isForDay(today.data, now);
  const items: ScheduleOccurrence[] = source.data && !stale ? source.data : [];
  const visit = items.find((i) => i.kind === "visit" && i.person_name && (day === "tomorrow" || timeState(i, now) !== "past"));

  const label: Record<TimeState, string> = { past: t(L, "Done", "Tapos"), now: t(L, "Now", "Ngayon"), upcoming: t(L, "Later", "Mamaya") };

  return (
    <Screen header={<TopBar title={t(L, "My Day", "Aking Araw")} onBack={() => router.back()} />} onRefresh={source.reload}>
      <DemoNote feature="schedule" />
      <Segmented value={day} onChange={setDay} options={[{ v: "today", l: t(L, "Today", "Ngayon") }, { v: "tomorrow", l: t(L, "Tomorrow", "Bukas") }]} />
      {source.fromCache && !stale ? (
        <Banner
          tone="warning"
          style={{ marginTop: 12 }}
          text={t(L, `Can't reach the hub. Saved at ${nowLabel(new Date(source.savedAt ?? 0))}; may not be up to date.`, `Hindi maabot ang hub. Naka-save noong ${nowLabel(new Date(source.savedAt ?? 0))}.`)}
        />
      ) : null}
      {stale ? <Banner tone="warning" style={{ marginTop: 12 }} text={t(L, "Can't reach the hub, and there's no saved schedule for today.", "Walang naka-save na iskedyul ngayon.")} /> : null}
      {source.loading && !source.data ? <Loading /> : null}
      {source.error && !source.data ? <EmptyState title={t(L, "Your schedule isn't available", "Hindi makuha ang iskedyul")} body={source.error} /> : null}
      {source.data && !stale && items.length === 0 ? (
        <EmptyState pose="nap" title={t(L, "Nothing planned", "Walang nakaplano")} body={t(L, "A quiet day. Rest and enjoy.", "Tahimik na araw. Magpahinga.")} />
      ) : null}

      <View style={{ marginTop: 18, paddingLeft: 26 }}>
        {items.length ? <View style={styles.line} /> : null}
        {items.map((item) => {
          const state: TimeState = day === "tomorrow" ? "upcoming" : timeState(item, now);
          const Icon = kindIcon[item.kind] ?? CalendarDays;
          const withWhom = [item.person_name && t(L, `with ${item.person_name}`, `kasama si ${item.person_name}`), item.place_name && `@ ${item.place_name}`].filter(Boolean).join(" ");
          return (
            <View key={item.id + item.occurrence_at} style={{ marginBottom: 12 }}>
              <View style={[styles.dot, { backgroundColor: DOT[state] }]} />
              <Card
                style={[
                  { flexDirection: "row", alignItems: "center", gap: 14 },
                  state === "now" && { backgroundColor: kc.cream, borderWidth: 2, borderColor: kc.sun },
                  state === "past" && { opacity: 0.72 },
                ]}
              >
                <View accessible accessibilityLabel={`${label[state]}. ${clockLabel(item.occurrence_at)}. ${item.title}. ${withWhom}`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <IconBox icon={Icon} size={56} />
                  <View style={{ flex: 1 }}>
                    <Txt size={16} weight="bold" color={kc.primary}>
                      {clockLabel(item.occurrence_at)}
                    </Txt>
                    <Txt size={20} weight="extra" color={kc.navy}>
                      {item.title}
                    </Txt>
                    {withWhom ? (
                      <Txt size={16} muted>
                        {withWhom}
                      </Txt>
                    ) : null}
                    {item.notes ? (
                      <Txt size={16} muted>
                        {item.notes}
                      </Txt>
                    ) : null}
                  </View>
                </View>
                <Pill
                  label={label[state]}
                  bg={state === "past" ? kc.greenBg : state === "now" ? kc.sun : kc.sky}
                  fg={state === "past" ? kc.green : kc.navy}
                />
              </Card>
            </View>
          );
        })}
      </View>
      {items.length ? (
        <View style={{ marginTop: 8 }}>
          <KaliTip pose="walk">
            {visit
              ? t(L, `${visit.person_name} is visiting at ${clockLabel(visit.occurrence_at)}!`, `Darating si ${visit.person_name} ng ${clockLabel(visit.occurrence_at)}!`)
              : t(L, "One thing at a time. You're doing well.", "Isa-isa lang. Magaling ka.")}
          </KaliTip>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { position: "absolute", left: 9, top: 8, bottom: 8, width: 4, borderRadius: 2, backgroundColor: kc.sky },
  dot: { position: "absolute", left: -26, top: 26, width: 20, height: 20, borderRadius: 10, borderWidth: 4, borderColor: "#F5F9FE", zIndex: 1 },
});
