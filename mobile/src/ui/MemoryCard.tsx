// EchoVault mobile — a memory in a list (Kali design: MemoryCard).

import { View } from "react-native";

import type { Memory } from "../types";
import { categoryIcon } from "./icons";
import { Card, GradientBox, TrustBadge, Txt } from "./kit";
import { categoryHue, categoryLabel, dayLabel, memoryTitle, t } from "./labels";
import { useLang } from "./prefs";
import { kc } from "./tokens";

export function MemoryCard({ m, onPress }: { m: Memory; onPress?: () => void }) {
  const L = useLang();
  return (
    <Card onPress={onPress} label={memoryTitle(m)} style={{ flexDirection: "row", gap: 16, opacity: m.trust === "outdated" ? 0.75 : 1 }}>
      <GradientBox colors={categoryHue[m.category]} icon={categoryIcon[m.category]} size={76} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={19} weight="extra" color={kc.navy}>
          {memoryTitle(m)}
        </Txt>
        <Txt size={15} muted style={{ marginTop: 2 }}>
          {dayLabel(m.event_date) ?? t(L, categoryLabel[m.category].en, categoryLabel[m.category].fil)}
        </Txt>
        <View style={{ marginTop: 8 }}>
          <TrustBadge trust={m.trust} />
        </View>
      </View>
    </Card>
  );
}
