// EchoVault mobile — patient route group layout (Module 14, Kali design).
// Bottom tabs (Home, Memories, Ask Kali, Family, Today) with the raised Ask
// button; every other patient screen is a hidden tab so the bar stays, as in the
// design (it hides only while asking Kali). Also: patient state for every
// screen, the two cards that can appear over any screen (a due medicine, an
// optional trivia question), and the offline reminders loop (REM-1..REM-3): asks
// for notification permission once, then refreshes the next 24 hours of schedule
// and medicine reminders from the hub every 30 minutes.

import { LinearGradient } from "expo-linear-gradient";
import { Tabs, type BottomTabBarProps } from "expo-router/tabs";
import { BookHeart, CalendarDays, Home, type LucideIcon, MessageCircleHeart, Users } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setRole } from "../../src/api/client";
import { offline } from "../../src/offline";
import MedicationCard from "../../src/patient/MedicationCard";
import TriviaCard from "../../src/patient/TriviaCard";
import { PatientProvider } from "../../src/patient/context";
import { prepareNotifications } from "../../src/platform";
import { Txt } from "../../src/ui/kit";
import { t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { kc, navy } from "../../src/ui/tokens";

const TABS: { name: string; icon: LucideIcon; en: string; fil: string }[] = [
  { name: "home", icon: Home, en: "Home", fil: "Home" },
  { name: "memories/index", icon: BookHeart, en: "Memories", fil: "Alaala" },
  { name: "ask", icon: MessageCircleHeart, en: "Ask Kali", fil: "Kali" },
  { name: "people/index", icon: Users, en: "Family", fil: "Pamilya" },
  { name: "schedule", icon: CalendarDays, en: "Today", fil: "Ngayon" },
];

/** Which tab a hidden screen belongs to, so its tab stays highlighted. */
const PARENT: Record<string, string> = {
  "memories/[id]": "memories/index",
  "people/[id]": "people/index",
  medications: "home",
  "games/index": "home",
  "games/[type]": "home",
  trivia: "home",
  orientation: "home",
  settings: "home",
};

function KaliTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const L = useLang();
  const current = state.routes[state.index].name;
  if (current === "ask") return null;
  const active = PARENT[current] ?? current;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
      {TABS.map(({ name, icon: Icon, en, fil }) => {
        const on = active === name;
        const label = t(L, en, fil);
        const go = () => navigation.navigate(name as never);
        if (name === "ask") {
          return (
            <Pressable key={name} onPress={go} accessibilityRole="tab" accessibilityLabel={label} style={styles.item}>
              <LinearGradient colors={[kc.primary, kc.navy]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bubble}>
                <Icon size={28} color={kc.white} />
              </LinearGradient>
              <Txt size={13} weight="extra" color={kc.navy} fixed>
                {label}
              </Txt>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={name}
            onPress={go}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={[styles.item, { minHeight: 56, justifyContent: "flex-end" }]}
          >
            <View style={[styles.iconPill, on && { backgroundColor: kc.sky }]}>
              <Icon size={23} color={on ? kc.navy : navy(0.5)} strokeWidth={on ? 2.6 : 2} />
            </View>
            <Txt size={12.5} weight="bold" color={on ? kc.navy : navy(0.6)} fixed>
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PatientLayout() {
  // Patient mode never sends caregiver headers, so nothing here can edit caregiver-only records.
  useEffect(() => {
    setRole("patient").catch(() => {});
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    prepareNotifications()
      .catch(() => false) // reminders still show in the banner without permission
      .then(() => {
        if (!cancelled) stop = offline.reminders.start();
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <PatientProvider>
      <View style={{ flex: 1, backgroundColor: kc.bgTop }}>
        <Tabs tabBar={(props) => <KaliTabBar {...props} />} backBehavior="history" screenOptions={{ headerShown: false }}>
          {TABS.map((tab) => (
            <Tabs.Screen key={tab.name} name={tab.name} />
          ))}
          {Object.keys(PARENT).map((name) => (
            <Tabs.Screen key={name} name={name} options={{ href: null }} />
          ))}
        </Tabs>
        <TriviaCard />
        <MedicationCard />
      </View>
    </PatientProvider>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: kc.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 8,
    paddingTop: 8,
    shadowColor: kc.navy,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  item: { flex: 1, alignItems: "center", gap: 4 },
  iconPill: { width: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 5,
    borderColor: kc.white,
    shadowColor: kc.navy,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
