// EchoVault mobile — caregiver app layout (Module 16, CGV-1, Kali design: Care).
//
// Lives at /care (not a route group) so its screens never share a URL with the
// patient's /schedule, /people and /memories. Asks for the PIN first; once
// unlocked, tabs: Overview, Records, Schedule, Family, More. On open it re-reads
// the caregiver from the hub (an admin may have changed their access level or
// deactivated them; a 401 asks for the PIN again).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/tabs";
import { CalendarCog, Database, LayoutDashboard, type LucideIcon, MoreHorizontal, Users } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { endCaregiverSession, getAccessLevel, refreshCaregiverSession, type CaregiverIdentity } from "../../src/api/auth";
import { getCaregiverId, setRole } from "../../src/api/client";
import PinScreen from "../../src/caregiver/PinScreen";
import { SessionProvider } from "../../src/caregiver/session";
import { Loading, Txt } from "../../src/ui/kit";
import { kc, navy } from "../../src/ui/tokens";

const KEY_NAME = "ev.caregiverName";

const TABS: { name: string; icon: LucideIcon; label: string }[] = [
  { name: "index", icon: LayoutDashboard, label: "Overview" },
  { name: "memories/index", icon: Database, label: "Records" },
  { name: "schedule", icon: CalendarCog, label: "Schedule" },
  { name: "people", icon: Users, label: "Family" },
  { name: "more", icon: MoreHorizontal, label: "More" },
];

const PARENT: Record<string, string> = {
  "memories/[id]": "memories/index",
  activities: "more",
  backup: "more",
  hub: "more",
  profile: "more",
};

function CareTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index].name;
  const active = PARENT[current] ?? current;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
      {TABS.map(({ name, icon: Icon, label }) => {
        const on = active === name;
        return (
          <Pressable
            key={name}
            onPress={() => navigation.navigate(name as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            style={styles.item}
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

export default function CareLayout() {
  const [caregiver, setCaregiver] = useState<CaregiverIdentity | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getCaregiverId();
      if (!id) return !cancelled && setCaregiver(null);
      // the patient app may have run since: send caregiver headers again before any request
      await setRole("caregiver");
      try {
        const fresh = await refreshCaregiverSession();
        if (fresh) AsyncStorage.setItem(KEY_NAME, fresh.name).catch(() => {});
        if (!fresh) await setRole("patient").catch(() => {});
        if (!cancelled) setCaregiver(fresh);
      } catch {
        // hub unreachable: keep the saved session; screens show what was saved
        const [level, name] = await Promise.all([getAccessLevel(), AsyncStorage.getItem(KEY_NAME)]);
        if (!cancelled) setCaregiver(level ? { id, name: name ?? "Caregiver", access_level: level } : null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unlocked = useCallback((c: CaregiverIdentity) => {
    AsyncStorage.setItem(KEY_NAME, c.name).catch(() => {});
    setCaregiver(c);
  }, []);

  const signOut = useCallback(async () => {
    await endCaregiverSession();
    await AsyncStorage.removeItem(KEY_NAME).catch(() => {});
    router.replace("/(patient)/home");
  }, []);

  const leave = useCallback(async () => {
    await setRole("patient");
    router.replace("/(patient)/home");
  }, []);

  if (caregiver === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: kc.sky }}>
        <Loading />
      </View>
    );
  }
  if (caregiver === null) return <PinScreen onUnlocked={unlocked} onLeave={leave} />;

  return (
    <SessionProvider caregiver={caregiver} signOut={signOut}>
      <Tabs tabBar={(props) => <CareTabBar {...props} />} backBehavior="history" screenOptions={{ headerShown: false }}>
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} />
        ))}
        {Object.keys(PARENT).map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
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
  item: { flex: 1, alignItems: "center", gap: 4, minHeight: 56, justifyContent: "flex-end" },
  iconPill: { width: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
