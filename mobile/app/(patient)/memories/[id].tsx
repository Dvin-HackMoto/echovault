// EchoVault mobile — one memory (Kali design: MemoryDetail).
// Read from the saved verified list first (works offline), then the hub. If the
// memory is gone or no longer verified, the patient is told kindly and sent back.

import { router, useLocalSearchParams } from "expo-router";
import { Volume2, Square } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { getMemory, listMemories } from "../../../src/api/memories";
import { withCache } from "../../../src/patient/cached";
import { usePatient } from "../../../src/patient/context";
import type { Memory } from "../../../src/types";
import { categoryIcon } from "../../../src/ui/icons";
import { Btn, EmptyState, GradientBox, KaliTip, Loading, Pill, Screen, TopBar, TrustBadge, Txt } from "../../../src/ui/kit";
import { categoryHue, categoryLabel, dayLabel, memoryTitle, t } from "../../../src/ui/labels";
import { usePrefs } from "../../../src/ui/prefs";
import { kc } from "../../../src/ui/tokens";
import { speak, stop, voiceLanguage } from "../../../src/voice/speak";

export default function MemoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { prefs, zoom } = usePrefs();
  const L = prefs.lang;
  const { profile } = usePatient();
  const [memory, setMemory] = useState<Memory | null | undefined>(undefined);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMemory(undefined);
    (async () => {
      const saved = await withCache("memories-verified", () => listMemories({ trust: "verified" })).catch(() => null);
      let found = saved?.data.find((m) => m.id === id) ?? null;
      if (!found) found = await getMemory(id).catch(() => null);
      // the patient only ever sees verified, current memories
      if (found && (found.trust !== "verified" || found.validity === "archived")) found = null;
      if (!cancelled) setMemory(found);
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [id]);

  function read() {
    if (!memory) return;
    if (speaking) {
      stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(`${memoryTitle(memory)}. ${memory.content}`, { language: voiceLanguage(profile.language), onDone: () => setSpeaking(false) });
  }

  return (
    <Screen header={<TopBar title={t(L, "Memory", "Alaala")} onBack={() => router.back()} />}>
      {memory === undefined ? <Loading /> : null}
      {memory === null ? (
        <EmptyState
          pose="peek"
          title={t(L, "This memory isn't available", "Hindi makita ang alaalang ito")}
          body={t(L, "It may have been changed by your family.", "Maaaring binago ito ng pamilya mo.")}
          action={<Btn variant="soft" label={t(L, "Back to memories", "Bumalik sa alaala")} onPress={() => router.replace("/memories")} />}
        />
      ) : null}
      {memory ? (
        <>
          <GradientBox colors={categoryHue[memory.category]} icon={categoryIcon[memory.category]} size="100%" iconSize={72} rounded={28} style={{ height: 200 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <TrustBadge trust={memory.trust} />
            <Pill label={t(L, categoryLabel[memory.category].en, categoryLabel[memory.category].fil)} />
          </View>
          <Txt size={26} weight="black" color={kc.navy} style={{ marginTop: 12 }} accessibilityRole="header">
            {memoryTitle(memory)}
          </Txt>
          {dayLabel(memory.event_date) ? (
            <Txt size={16} weight="semi" muted>
              {dayLabel(memory.event_date)}
            </Txt>
          ) : null}
          <Txt size={20} weight="regular" style={{ marginTop: 12, lineHeight: Math.round(20 * zoom * 1.5) }}>
            {memory.content}
          </Txt>
          {memory.importance === "critical" ? (
            <View style={{ marginTop: 16 }}>
              <KaliTip pose="idea" tone="blush">
                {t(L, "This is important to remember. Your family marked it as critical.", "Mahalagang tandaan ito.")}
              </KaliTip>
            </View>
          ) : null}
          <Txt size={14} muted style={{ marginTop: 16 }}>
            {t(L, "Checked by your family", "Sinuri ng iyong pamilya")}
            {memory.verified_at ? ` · ${dayLabel(memory.verified_at)}` : ""}
          </Txt>
          <Btn
            variant="soft"
            icon={speaking ? Square : Volume2}
            label={speaking ? t(L, "Stop reading", "Itigil") : t(L, "Read aloud", "Basahin nang malakas")}
            onPress={read}
            style={{ marginTop: 16 }}
          />
        </>
      ) : null}
    </Screen>
  );
}
