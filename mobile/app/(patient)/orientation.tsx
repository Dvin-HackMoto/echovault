// EchoVault mobile — "Today and where I am" (Kali design: Orientation).
// Who I am, what day and time it is, today's plan, and the people close to me.

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { photoUri } from "../../src/api/client";
import { listPeople } from "../../src/api/people";
import { todaySchedule } from "../../src/api/schedule";
import { usePatient } from "../../src/patient/context";
import { isForDay, timeState } from "../../src/patient/logic";
import { clockLabel, nowLabel } from "../../src/time";
import { Avatar, Card, KaliTip, Screen, SectionTitle, TopBar, Txt } from "../../src/ui/kit";
import { longDate, t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { kc, navy, paletteFor } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

export default function Orientation() {
  const L = useLang();
  const { profile, name, hubUrl } = usePatient();
  const [now, setNow] = useState(new Date());
  const schedule = useHub(todaySchedule, "schedule-today");
  const people = useHub(() => listPeople("verified"), "people");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const items = schedule.data && isForDay(schedule.data, now) ? schedule.data : [];
  const verified = (people.data ?? []).filter((p) => p.trust === "verified");
  const caregiver = verified.find((p) => p.is_caregiver);

  return (
    <Screen header={<TopBar title={t(L, "Today", "Ngayon")} onBack={() => router.back()} />}>
      <LinearGradient colors={[kc.sky, kc.white]} style={{ borderRadius: 28, padding: 24, alignItems: "center" }}>
        {profile.full_name ? (
          <>
            <Txt size={18} weight="bold" muted center>
              {t(L, "Your name is", "Ang pangalan mo ay")}
            </Txt>
            <Txt size={32} weight="black" color={kc.navy} center>
              {profile.full_name}
            </Txt>
            {name && name !== profile.full_name ? (
              <Txt size={17} weight="semi" muted center>
                {t(L, `Family calls you ${name}`, `Tawag sa iyo ng pamilya: ${name}`)}
              </Txt>
            ) : null}
            <View style={{ height: 1, alignSelf: "stretch", backgroundColor: navy(0.1), marginVertical: 16 }} />
          </>
        ) : null}
        <Txt size={18} weight="bold" muted center>
          {t(L, "Today is", "Ngayon ay")}
        </Txt>
        <Txt size={24} weight="black" color={kc.navy} center>
          {longDate(now, L)}
        </Txt>
        <Txt size={44} weight="black" color={kc.primary} center style={{ marginTop: 4 }}>
          {nowLabel(now)}
        </Txt>
      </LinearGradient>

      {items.length ? (
        <>
          <SectionTitle>{t(L, "Today's plan", "Plano ngayon")}</SectionTitle>
          <Card style={{ paddingVertical: 6 }}>
            {items.map((a, i) => {
              const past = timeState(a, now) === "past";
              return (
                <View key={a.id + a.occurrence_at} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: navy(0.05) }}>
                  <Txt size={16} weight="bold" color={kc.primary} style={{ width: 96 }}>
                    {clockLabel(a.occurrence_at)}
                  </Txt>
                  <Txt size={18} weight="bold" color={past ? "rgba(37,50,74,.5)" : kc.navy} style={[{ flex: 1 }, past && { textDecorationLine: "line-through" }]}>
                    {a.title}
                  </Txt>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {verified.length ? (
        <>
          <SectionTitle>{t(L, "People close to you", "Mga malapit sa iyo")}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
            {verified.map((p) => (
              <Pressable key={p.id} onPress={() => router.push({ pathname: "/people/[id]", params: { id: p.id } })} accessibilityRole="button" style={{ width: 112, alignItems: "center" }}>
                <Avatar name={p.name} colors={paletteFor(p.id)} uri={photoUri(hubUrl, p.photo_url, p.photo_path)} size={88} />
                <Txt size={16} weight="extra" color={kc.navy} center numberOfLines={1} style={{ marginTop: 4 }}>
                  {p.nickname || p.name}
                </Txt>
                <Txt size={13} muted center numberOfLines={1}>
                  {p.relationship}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionTitle>{t(L, "Good to know", "Mabuting malaman")}</SectionTitle>
      <KaliTip pose="hug" tone="blush">
        {caregiver
          ? t(L, `${caregiver.nickname || caregiver.name} takes care of you. You are safe.`, `Inaalagaan ka ni ${caregiver.nickname || caregiver.name}. Ligtas ka.`)
          : t(L, "Your family is looking after you. You are safe.", "Inaalagaan ka ng pamilya mo. Ligtas ka.")}
      </KaliTip>
    </Screen>
  );
}
