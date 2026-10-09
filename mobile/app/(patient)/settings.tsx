// EchoVault mobile — patient settings (Kali design: Settings).
// This phone's display choices (language, text size, voice, contrast), who
// looks after the patient, how privacy works, and the way to caregiver mode.

import { router } from "expo-router";
import { HeartHandshake, Lock, Server, Settings as Cog } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { getHubUrl } from "../../src/api/client";
import { listPeople } from "../../src/api/people";
import { Btn, Card, Field, KaliTip, Row, Screen, Segmented, Toggle, TopBar, Txt, Overline } from "../../src/ui/kit";
import { t } from "../../src/ui/labels";
import { usePrefs } from "../../src/ui/prefs";
import { APP_NAME, COMPANION, kc, navy } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Overline>{title}</Overline>
      <Card style={{ paddingVertical: 4 }}>{children}</Card>
    </>
  );
}

export default function Settings() {
  const { prefs, setPref } = usePrefs();
  const L = prefs.lang;
  const people = useHub(() => listPeople("verified"), "people");
  const hub = useHub(getHubUrl);
  const caregiver = (people.data ?? []).find((p) => p.is_caregiver && p.trust === "verified");

  return (
    <Screen header={<TopBar title={t(L, "Settings", "Settings")} onBack={() => router.back()} right={<Cog size={24} color={navy(0.4)} />} />}>
      <Field label="Language / Wika">
        <Segmented value={prefs.lang} onChange={(v) => setPref("lang", v)} options={[{ v: "en", l: "English" }, { v: "fil", l: "Filipino" }]} />
      </Field>
      <View style={{ height: 14 }} />
      <Field label={t(L, "Text size", "Laki ng teksto")}>
        <Segmented value={prefs.textSize} onChange={(v) => setPref("textSize", v)} options={[{ v: "md", l: "A" }, { v: "lg", l: "A+" }, { v: "xl", l: "A++" }]} />
      </Field>

      <Section title={t(L, "Voice", "Boses")}>
        <Toggle on={prefs.voice} onChange={(v) => setPref("voice", v)} label={t(L, "Talk with the microphone", "Gamitin ang mikropono")} desc={t(L, `Ask ${COMPANION} by speaking`, `Magtanong kay ${COMPANION} sa pagsasalita`)} />
        <Toggle on={prefs.readAloud} onChange={(v) => setPref("readAloud", v)} label={t(L, "Read answers aloud", "Basahin nang malakas")} desc={t(L, `${COMPANION} speaks replies automatically`, `Kusang magsasalita si ${COMPANION}`)} />
      </Section>

      <Section title={t(L, "Accessibility", "Accessibility")}>
        <Toggle on={prefs.highContrast} onChange={(v) => setPref("highContrast", v)} label={t(L, "High contrast", "Mataas na contrast")} desc={t(L, "Darker text everywhere", "Mas madilim na teksto")} />
      </Section>

      <View style={{ marginTop: 12 }}>
        <KaliTip pose="sleep" tone="sky">
          {t(L, "I stay quiet at night so you can rest. Medicine reminders still come through.", "Tahimik ako sa gabi para makapagpahinga ka. Darating pa rin ang paalala sa gamot.")}
        </KaliTip>
      </View>

      <Section title={t(L, "Your caregiver", "Iyong tagapag-alaga")}>
        <Row style={{ paddingVertical: 12 }}>
          <HeartHandshake size={24} color={kc.primary} />
          <View style={{ flex: 1 }}>
            <Txt size={17} weight="bold">
              {caregiver ? t(L, `${caregiver.nickname || caregiver.name} looks after you`, `Inaalagaan ka ni ${caregiver.nickname || caregiver.name}`) : t(L, "Your family keeps your records", "Ang pamilya mo ang nag-aayos ng tala")}
            </Txt>
            <Txt size={14} muted>
              {t(L, "Changes they make show up here on the next visit.", "Lalabas dito ang mga pagbabago nila.")}
            </Txt>
          </View>
        </Row>
        <Row style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: navy(0.05) }}>
          <Server size={22} color={kc.primary} />
          <View style={{ flex: 1 }}>
            <Txt size={17} weight="bold">
              {t(L, "Home hub", "Hub sa bahay")}
            </Txt>
            <Txt size={14} muted>
              {hub.data ?? t(L, "Demo data (no hub)", "Demo data")}
            </Txt>
          </View>
        </Row>
      </Section>

      <Section title={t(L, "Privacy", "Privacy")}>
        <Row style={{ paddingVertical: 12, alignItems: "flex-start" }}>
          <Lock size={22} color={kc.primary} />
          <Txt size={16} style={{ flex: 1 }}>
            {t(
              L,
              `Your memories stay on your family's hub at home. ${APP_NAME} does not send them to the internet or the cloud.`,
              `Nasa hub sa bahay ang iyong mga alaala. Hindi ito ipinapadala ng ${APP_NAME} sa internet.`,
            )}
          </Txt>
        </Row>
      </Section>

      <Btn variant="ghost" icon={HeartHandshake} label={t(L, "Switch to caregiver app", "Lumipat sa caregiver app")} style={{ marginTop: 20 }} onPress={() => router.replace("/care")} />
      <Btn variant="ghost" size="md" icon={Server} label={t(L, "Hub settings", "Hub settings")} style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/", params: { setup: "1" } })} />
    </Screen>
  );
}
