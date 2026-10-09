// EchoVault mobile — today's medicines (PAT-6, Kali design: Meds).
// The patient only says what they did: "taken" asks once more before saving,
// and is recorded as confirmed_by=patient (the caregiver checks separately).
// "Remind me later" just hides the buttons on this phone for 15 minutes.

import { router } from "expo-router";
import { Check, Clock, Pill as PillIcon, SkipForward } from "lucide-react-native";
import { useState } from "react";
import { Image, View } from "react-native";

import { photoUri } from "../../src/api/client";
import { logMedicationStatus, todayMedicationLogs } from "../../src/api/medications";
import { usePatient } from "../../src/patient/context";
import { clockLabel } from "../../src/time";
import type { Dose } from "../../src/types";
import { Banner, Btn, Card, DemoNote, EmptyState, IconBox, KaliTip, Loading, Pill, Row, Screen, TopBar, Txt } from "../../src/ui/kit";
import { t } from "../../src/ui/labels";
import { useLang } from "../../src/ui/prefs";
import { useToast } from "../../src/ui/toast";
import { kc } from "../../src/ui/tokens";
import { saveError, useHub } from "../../src/ui/useHub";

const LATER_MS = 15 * 60 * 1000;

export default function Medications() {
  const L = useLang();
  const toast = useToast();
  const { hubUrl } = usePatient();
  const doses = useHub(todayMedicationLogs, "doses-today");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [later, setLater] = useState<Record<string, number>>({});

  function status(d: Dose): { label: string; bg: string; fg: string } {
    if (d.status === "taken" && d.confirmed_by === "caregiver") return { label: t(L, "Caregiver confirmed", "Kinumpirma ng tagapag-alaga"), bg: kc.green, fg: kc.white };
    if (d.status === "taken") return { label: t(L, "You said: taken", "Sabi mo: nainom"), bg: kc.greenBg, fg: kc.green };
    if (d.status === "skipped") return { label: t(L, "Skipped", "Nilaktawan"), bg: kc.slateBg, fg: kc.slate };
    if ((later[d.id] ?? 0) > Date.now()) return { label: t(L, "Remind later", "Paalala mamaya"), bg: kc.cream, fg: kc.amber };
    return { label: t(L, "Waiting", "Naghihintay"), bg: kc.sky, fg: kc.navy };
  }

  async function answer(d: Dose, value: "taken" | "skipped") {
    setBusy(d.id);
    try {
      await logMedicationStatus(d.id, value, "patient");
      setConfirming(null);
      toast(value === "taken" ? t(L, "Thank you. Saved as taken by you.", "Salamat. Naka-save na nainom mo.") : t(L, "Okay, saved as skipped. Your caregiver will see this.", "Sige, nilaktawan. Makikita ito ng tagapag-alaga."));
      await doses.reload();
    } catch (e) {
      toast(saveError(e));
    } finally {
      setBusy(null);
    }
  }

  function remindLater(d: Dose) {
    setLater((l) => ({ ...l, [d.id]: Date.now() + LATER_MS }));
    toast(t(L, "I'll remind you again in 15 minutes.", "Ipapaalala ko ulit sa loob ng 15 minuto."));
  }

  const list = doses.data ?? [];
  return (
    <Screen header={<TopBar title={t(L, "Medication", "Gamot")} onBack={() => router.back()} />} onRefresh={doses.reload}>
      <DemoNote feature="medications" />
      <KaliTip pose="idea">{t(L, "Only tap “Taken” after you have taken it. Your caregiver checks separately.", "I-tap lang ang “Nainom” kapag nainom mo na.")}</KaliTip>
      {doses.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text={t(L, "Can't reach the hub. Showing the saved list.", "Hindi maabot ang hub.")} /> : null}
      {doses.loading && !doses.data ? <Loading /> : null}
      {doses.error && !doses.data ? <EmptyState title={t(L, "Medicines aren't available", "Hindi makuha ang gamot")} body={doses.error} /> : null}
      {doses.data && list.length === 0 ? <EmptyState pose="happy" title={t(L, "No medicine today", "Walang gamot ngayon")} /> : null}
      <View style={{ marginTop: 16, gap: 12 }}>
        {list.map((d) => {
          const s = status(d);
          const open = d.status === "unconfirmed" && (later[d.id] ?? 0) <= Date.now();
          const photo = photoUri(hubUrl, d.photo_url, d.photo_path);
          return (
            <Card key={d.id}>
              <Row style={{ alignItems: "flex-start" }}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: kc.lilacBg }} accessibilityLabel={`Photo of ${d.name}`} />
                ) : (
                  <IconBox icon={PillIcon} size={56} bg={kc.lilacBg} />
                )}
                <View style={{ flex: 1 }}>
                  <Txt size={16} weight="bold" color={kc.primary}>
                    {clockLabel(d.due_at)}
                  </Txt>
                  <Txt size={20} weight="extra" color={kc.navy}>
                    {d.name}
                  </Txt>
                  <Txt size={16} muted>
                    {d.dose}
                  </Txt>
                </View>
                <Pill label={s.label} bg={s.bg} fg={s.fg} />
              </Row>
              {d.instructions ? (
                <View style={{ marginTop: 12, borderRadius: 16, backgroundColor: "rgba(234,243,252,.7)", padding: 12 }}>
                  <Txt size={17}>{d.instructions}</Txt>
                </View>
              ) : null}
              {open && confirming === d.id ? (
                <View style={{ marginTop: 12, borderRadius: 16, backgroundColor: kc.cream, padding: 12 }}>
                  <Txt size={17} weight="bold" color={kc.navy}>
                    {t(L, `Did you take ${d.name} just now?`, `Nainom mo ba ang ${d.name}?`)}
                  </Txt>
                  <Row gap={8} style={{ marginTop: 8 }}>
                    <Btn icon={Check} label={t(L, "Yes, taken", "Oo, nainom")} loading={busy === d.id} onPress={() => answer(d, "taken")} style={{ flex: 1 }} />
                    <Btn variant="ghost" label={t(L, "Not yet", "Hindi pa")} onPress={() => setConfirming(null)} />
                  </Row>
                </View>
              ) : open ? (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <Btn icon={Check} label={t(L, "Confirm taken", "Nainom ko na")} onPress={() => setConfirming(d.id)} />
                  <Row gap={8}>
                    <Btn variant="soft" size="md" icon={Clock} label={t(L, "Remind me later", "Mamaya")} onPress={() => remindLater(d)} style={{ flex: 2 }} />
                    <Btn variant="ghost" size="md" icon={SkipForward} label={t(L, "Skip", "Laktawan")} disabled={busy === d.id} onPress={() => answer(d, "skipped")} style={{ flex: 1 }} />
                  </Row>
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
