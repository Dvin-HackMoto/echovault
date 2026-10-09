// EchoVault mobile — one person (PAT-5, Kali design: PersonDetail).
// Photo, name, relationship, the caregiver's notes, and verified memories about them.

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { photoUri } from "../../../src/api/client";
import { verifiedMemoriesAbout } from "../../../src/api/memories";
import { getPerson, listPeople } from "../../../src/api/people";
import { withCache } from "../../../src/patient/cached";
import { usePatient } from "../../../src/patient/context";
import type { Memory, Person } from "../../../src/types";
import { MemoryCard } from "../../../src/ui/MemoryCard";
import { Avatar, Btn, Card, EmptyState, Loading, Screen, SectionTitle, TopBar, TrustBadge, Txt } from "../../../src/ui/kit";
import { t } from "../../../src/ui/labels";
import { useLang } from "../../../src/ui/prefs";
import { kc, paletteFor } from "../../../src/ui/tokens";

export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const L = useLang();
  const { hubUrl } = usePatient();
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    let cancelled = false;
    setPerson(undefined);
    setMemories([]);
    (async () => {
      const saved = await withCache("people", () => listPeople("verified")).catch(() => null);
      let found = saved?.data.find((p) => p.id === id) ?? null;
      if (!found) found = await getPerson(id).catch(() => null);
      if (found && found.trust !== "verified") found = null;
      if (cancelled) return;
      setPerson(found);
      if (found) verifiedMemoriesAbout(found.id).then((m) => !cancelled && setMemories(m)).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const shown = person ? person.nickname || person.name : "";
  return (
    <Screen header={<TopBar title={shown || t(L, "Family", "Pamilya")} onBack={() => router.back()} />}>
      {person === undefined ? <Loading /> : null}
      {person === null ? (
        <EmptyState
          title={t(L, "This person isn't available", "Hindi makita ang taong ito")}
          body={t(L, "Your family may have changed their details.", "Maaaring binago ng pamilya ang detalye.")}
          action={<Btn variant="soft" label={t(L, "Back to family", "Bumalik sa pamilya")} onPress={() => router.replace("/people")} />}
        />
      ) : null}
      {person ? (
        <>
          <View style={{ alignItems: "center" }}>
            <Avatar name={person.name} colors={paletteFor(person.id)} uri={photoUri(hubUrl, person.photo_url, person.photo_path)} size={168} />
            <Txt size={30} weight="black" color={kc.navy} center style={{ marginTop: 14 }} accessibilityRole="header">
              {shown}
            </Txt>
            <Txt size={22} weight="bold" color={kc.primary} center>
              {t(L, `Your ${person.relationship}`, `Iyong ${person.relationship}`)}
            </Txt>
            {person.nickname && person.nickname !== person.name ? (
              <Txt size={16} weight="semi" muted center>
                {person.name}
              </Txt>
            ) : null}
            <View style={{ marginTop: 8 }}>
              <TrustBadge trust={person.trust} />
            </View>
          </View>
          {person.notes ? (
            <Card style={{ marginTop: 20 }}>
              <Txt size={19} weight="regular">
                {person.notes}
              </Txt>
            </Card>
          ) : null}
          {memories.length ? (
            <>
              <SectionTitle>{t(L, "Shared memories", "Mga alaala ninyo")}</SectionTitle>
              <View style={{ gap: 12 }}>
                {memories.slice(0, 5).map((m) => (
                  <MemoryCard key={m.id} m={m} onPress={() => router.push({ pathname: "/memories/[id]", params: { id: m.id } })} />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
