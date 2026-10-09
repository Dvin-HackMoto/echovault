// EchoVault mobile — memory games list (PAT-7, Kali design: Games).
// Optional activities, just for fun: no scores, no grades, no timers.

import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Image, View } from "react-native";

import { GAMES } from "../../../src/patient/games";
import { kali } from "../../../src/ui/kali";
import { Card, DemoNote, Screen, TopBar, Txt } from "../../../src/ui/kit";
import { t } from "../../../src/ui/labels";
import { useLang } from "../../../src/ui/prefs";
import { kc, navy } from "../../../src/ui/tokens";

export default function Games() {
  const L = useLang();
  return (
    <Screen header={<TopBar title={t(L, "Memory Games", "Mga Laro")} sub={t(L, "Relaxed, no timers", "Walang oras, walang puntos")} onBack={() => router.back()} />}>
      <DemoNote feature="games" />
      <View style={{ gap: 12 }}>
        {GAMES.map((g) => (
          <Card
            key={g.type}
            label={t(L, g.title, g.titleFil)}
            onPress={() => router.push({ pathname: "/games/[type]", params: { type: g.type } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Image source={kali[g.pose]} style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: kc.sky }} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Txt size={19} weight="extra" color={kc.navy}>
                {t(L, g.title, g.titleFil)}
              </Txt>
              <Txt size={16} muted>
                {t(L, g.about, g.aboutFil)}
              </Txt>
            </View>
            <ChevronRight size={22} color={navy(0.4)} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
