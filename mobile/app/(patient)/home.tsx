// EchoVault mobile — patient home (PAT-1, Kali design: Home).
// Greeting, the time and date, the hub connection, Kali's "Ask me" card, what
// is next today, and one tap to every area. In caregiver-managed mode the tiles
// are fewer. The reminder banner (Module 15) shows the schedule reminder due
// now, read from the phone's cache so it keeps working while the hub is off.

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  BookHeart,
  CalendarDays,
  ChevronRight,
  Compass,
  Lightbulb,
  Mic,
  Pill,
  Puzzle,
  Settings as Cog,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { todayMedicationLogs } from "../../src/api/medications";
import { listMemories } from "../../src/api/memories";
import { listPeople } from "../../src/api/people";
import { todaySchedule } from "../../src/api/schedule";
import { ReminderBanner } from "../../src/components/ReminderBanner";
import { offline } from "../../src/offline";
import { usePatient } from "../../src/patient/context";
import { comingUp, isForDay, timeState } from "../../src/patient/logic";
import { clockLabel, nowLabel } from "../../src/time";
import { kindIcon } from "../../src/ui/icons";
import { kali } from "../../src/ui/kali";
import { Banner, Card, HubChip, IconBtn, Row, Screen, Txt, useDemoFeatures } from "../../src/ui/kit";
import { greet, longDate, t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { useHub } from "../../src/ui/useHub";
import { COMPANION, cardShadow, kc, navy } from "../../src/ui/tokens";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

interface Tile {
  href: string;
  icon: LucideIcon;
  en: string;
  fil: string;
  sub: string;
  bg: string;
  fg: string;
}

export default function Home() {
  const L = useLang();
  const now = useClock();
  const { name, managedMode, reload } = usePatient();
  const demo = useDemoFeatures();

  const schedule = useHub(todaySchedule, "schedule-today");
  const people = useHub(() => listPeople("verified").then((ps) => ps.filter((p) => p.trust === "verified")), "people");
  const memories = useHub(() => listMemories({ trust: "verified" }), "memories-verified");
  const doses = useHub(todayMedicationLogs, "doses-today");

  const items = schedule.data && isForDay(schedule.data, now) ? schedule.data : [];
  const next = comingUp(items, now, 1)[0];
  const done = items.filter((i) => timeState(i, now) === "past").length;
  const dosesDue = (doses.data ?? []).filter((d) => d.status === "unconfirmed").length;
  const memoryCount = (memories.data ?? []).filter((m) => m.trust === "verified" && m.validity !== "archived").length;
  const offlineNow = schedule.fromCache || people.fromCache;

  const tiles: Tile[] = [
    { href: "/memories", icon: BookHeart, en: "My Memories", fil: "Aking Alaala", sub: memories.data ? t(L, `${memoryCount} saved`, `${memoryCount} naka-save`) : "", bg: "#F4C6CA", fg: "#8E3B45" },
    { href: "/people", icon: Users, en: "My Family", fil: "Aking Pamilya", sub: people.data ? t(L, `${people.data.length} people`, `${people.data.length} tao`) : "", bg: kc.skyDeep, fg: kc.navy },
    { href: "/schedule", icon: CalendarDays, en: "Today's Schedule", fil: "Iskedyul Ngayon", sub: schedule.data ? t(L, `${done} of ${items.length} done`, `${done} sa ${items.length} tapos`) : "", bg: "#FBE3AE", fg: "#7A5200" },
    { href: "/medications", icon: Pill, en: "Medication", fil: "Gamot", sub: doses.data ? (dosesDue ? t(L, `${dosesDue} still to take`, `${dosesDue} pa ang iinumin`) : t(L, "All set", "Ayos na")) : "", bg: "#E0D7F2", fg: kc.lilac },
    { href: "/games", icon: Puzzle, en: "Memory Games", fil: "Mga Laro", sub: t(L, "Relaxed, no timers", "Walang oras"), bg: "#CDE8D9", fg: kc.green },
    { href: "/trivia", icon: Lightbulb, en: "Daily Question", fil: "Tanong Ngayon", sub: t(L, "Just for fun", "Para sa saya"), bg: "#FFE6B8", fg: "#7A5200" },
  ];
  const shown = managedMode ? tiles.filter((x) => ["/people", "/schedule", "/medications"].includes(x.href)) : tiles;

  async function refresh() {
    await Promise.all([schedule.reload(), people.reload(), memories.reload(), doses.reload(), reload()]);
  }

  const NextIcon = next ? kindIcon[next.kind] ?? CalendarDays : CalendarDays;

  return (
    <Screen onRefresh={refresh} contentStyle={{ paddingTop: 12 }}>
      <ReminderBanner reminders={offline.reminders} />
      <Row>
        <LinearGradient colors={[kc.blush, "#E9A6AC"]} style={styles.initial}>
          <Txt size={18} weight="black" color={kc.navy} fixed>
            {(name || "?").slice(0, 1).toUpperCase()}
          </Txt>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Txt size={15} weight="bold" muted>
            {greet(now, L)}
            {name ? "," : ""}
          </Txt>
          {name ? (
            <Txt size={24} weight="black" color={kc.navy} numberOfLines={1}>
              {name}!
            </Txt>
          ) : null}
        </View>
        <IconBtn icon={Compass} label={t(L, "Today and where I am", "Ngayon at nasaan ako")} tone="white" size={48} onPress={() => router.push("/orientation")} />
        <IconBtn icon={Cog} label={t(L, "Settings", "Settings")} tone="white" size={48} onPress={() => router.push("/settings")} />
      </Row>

      <Card style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Txt size={40} weight="black" color={kc.navy} style={{ letterSpacing: -0.5 }}>
            {nowLabel(now)}
          </Txt>
          <Txt size={16} weight="bold" muted style={{ marginTop: 4 }}>
            {longDate(now, L)}
          </Txt>
        </View>
        <HubChip />
      </Card>

      <LinearGradient colors={["#86AEDB", kc.primary, kc.navy]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={[styles.bubble, { top: -40, right: -40, width: 160, height: 160 }]} />
        <View style={[styles.bubble, { bottom: -56, right: 64, width: 128, height: 128 }]} />
        <Image source={kali.happy} style={styles.heroKali} resizeMode="contain" />
        <Txt size={13} weight="black" color="rgba(255,255,255,.75)" style={{ letterSpacing: 1.6, textTransform: "uppercase" }} fixed>
          {t(L, "Your memory companion", "Iyong kasama")}
        </Txt>
        <Txt size={20} weight="extra" color={kc.white} style={{ maxWidth: "64%", marginTop: 4 }}>
          {t(L, `Hi${name ? ` ${name}` : ""}! Ask me about your day or your family.`, `Kumusta${name ? ` ${name}` : ""}! Magtanong tungkol sa araw mo o pamilya.`)}
        </Txt>
        <Pressable onPress={() => router.push("/ask")} accessibilityRole="button" style={({ pressed }) => [styles.askBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
          <Mic size={22} color={kc.primary} />
          <Txt size={18} weight="black" color={kc.navy}>
            {t(L, `Ask ${COMPANION}`, `Tanungin si ${COMPANION}`)}
          </Txt>
        </Pressable>
      </LinearGradient>

      {offlineNow ? <Banner tone="warning" style={{ marginTop: 14 }} text={t(L, "Can't reach the hub right now. Showing what was saved.", "Hindi maabot ang hub. Ipinapakita ang naka-save.")} /> : null}

      {next ? (
        <Pressable onPress={() => router.push("/schedule")} accessibilityRole="button" style={({ pressed }) => [styles.next, pressed && { opacity: 0.9 }]}>
          <View style={styles.nextIcon}>
            <NextIcon size={24} color={kc.navy} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={12} weight="black" color={kc.amber} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>
              {timeState(next, now) === "now" ? t(L, "Happening now", "Ngayon na") : `${t(L, "Next up", "Susunod")} · ${clockLabel(next.occurrence_at)}`}
            </Txt>
            <Txt size={20} weight="extra" color={kc.navy}>
              {next.title}
            </Txt>
            {next.person_name || next.place_name ? (
              <Txt size={15} muted numberOfLines={1}>
                {[next.person_name && t(L, `with ${next.person_name}`, `kasama si ${next.person_name}`), next.place_name && `@ ${next.place_name}`].filter(Boolean).join(" ")}
              </Txt>
            ) : null}
          </View>
          <ChevronRight size={22} color={navy(0.4)} />
        </Pressable>
      ) : null}

      <Txt size={19} weight="black" color={kc.navy} style={{ marginTop: 24, marginBottom: 12 }} accessibilityRole="header">
        {t(L, "What would you like to do?", "Ano ang gusto mong gawin?")}
      </Txt>
      <View style={styles.grid}>
        {shown.map((x) => (
          <Pressable key={x.href} onPress={() => router.push(x.href as never)} accessibilityRole="button" accessibilityLabel={t(L, x.en, x.fil)} style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }] }]}>
            <View style={[styles.tileIcon, { backgroundColor: x.bg }]}>
              <x.icon size={26} color={x.fg} />
            </View>
            <View>
              <Txt size={17} weight="extra" color={kc.navy}>
                {t(L, x.en, x.fil)}
              </Txt>
              {x.sub ? (
                <Txt size={13} weight="bold" muted>
                  {x.sub}
                </Txt>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>

      {demo.length ? <Banner tone="demo" style={{ marginTop: 18 }} text={`Demo data in: ${demo.join(", ")}. These parts are waiting for their hub modules.`} /> : null}
      <Pressable onPress={() => router.push({ pathname: "/", params: { setup: "1" } })} accessibilityRole="link" style={{ paddingVertical: 18 }}>
        <Txt size={14} muted center fixed style={{ textDecorationLine: "underline" }}>
          {t(L, "Hub settings (for caregivers)", "Hub settings (para sa tagapag-alaga)")}
        </Txt>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  initial: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: kc.white },
  hero: { marginTop: 16, borderRadius: 30, padding: 20, paddingBottom: 24, overflow: "hidden" },
  bubble: { position: "absolute", borderRadius: 999, backgroundColor: "rgba(255,255,255,.1)" },
  heroKali: { position: "absolute", right: -8, bottom: 6, width: 124, height: 118 },
  askBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    minHeight: 56,
    marginTop: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: kc.white,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  next: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: kc.cream,
    borderWidth: 1,
    borderColor: "rgba(247,201,107,.55)",
  },
  nextIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: kc.sun, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "48%",
    flexGrow: 1,
    minHeight: 132,
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: kc.white,
    borderWidth: 1,
    borderColor: navy(0.05),
    ...cardShadow,
  },
  tileIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
