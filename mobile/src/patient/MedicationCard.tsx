// EchoVault mobile — PAT-6: a large card for a dose that is due and still
// unconfirmed (Kali design: medication card).
//
// The card only asks. Answering records what the patient said (confirmed_by =
// patient); it never claims the app knows the medicine was taken. "Remind me
// later" closes the card without answering, so nobody is pushed into a wrong
// answer.

import { LinearGradient } from "expo-linear-gradient";
import { Check, Clock, Pill, SkipForward } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Modal, ScrollView, View } from "react-native";

import { photoUri } from "../api/client";
import { logMedicationStatus, todayMedicationLogs } from "../api/medications";
import { clockLabel } from "../time";
import type { Dose } from "../types";
import { kali } from "../ui/kali";
import { Banner, Btn, Card, DemoNote, IconBox, Txt } from "../ui/kit";
import { t } from "../ui/labels";
import { useLang } from "../ui/prefs";
import { kc } from "../ui/tokens";
import { hubMessage, isUnreachable } from "./cached";
import { usePatient } from "./context";
import { dueDose } from "./logic";

const CHECK_EVERY_MS = 60 * 1000;
const LATER_MS = 15 * 60 * 1000;

export default function MedicationCard() {
  const L = useLang();
  const { hubUrl, setMedicationCardOpen } = usePatient();
  const [dose, setDose] = useState<Dose | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const laterUntil = useRef<Record<string, number>>({});

  const check = useCallback(async () => {
    try {
      const doses = await todayMedicationLogs();
      setDose((shown) => shown ?? dueDose(doses, new Date(), laterUntil.current));
    } catch {
      // no card is better than a wrong one; the next check tries again
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  useEffect(() => {
    setMedicationCardOpen(dose !== null);
  }, [dose, setMedicationCardOpen]);

  async function answer(status: "taken" | "skipped") {
    if (!dose) return;
    setSending(true);
    setError(null);
    try {
      await logMedicationStatus(dose.id, status, "patient");
      setDose(null);
      check(); // another dose may be due at the same time
    } catch (e) {
      setError(isUnreachable(e) ? `${hubMessage(e)} ${t(L, "Please try again in a moment.", "Subukan ulit mamaya.")}` : t(L, "That did not save. Please try again.", "Hindi na-save. Subukan ulit."));
    } finally {
      setSending(false);
    }
  }

  function later() {
    if (!dose) return;
    laterUntil.current[dose.id] = Date.now() + LATER_MS;
    setDose(null);
  }

  if (!dose) return null;
  const photo = photoUri(hubUrl, dose.photo_url, dose.photo_path);
  return (
    <Modal visible animationType="slide" onRequestClose={later}>
      <LinearGradient colors={[kc.bgTop, kc.white]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 14 }}>
          <Image source={kali.idea} style={{ width: 120, height: 120, alignSelf: "center" }} resizeMode="contain" />
          <Txt size={26} weight="black" color={kc.navy} center accessibilityRole="header">
            {t(L, "Time for your medicine", "Oras na ng iyong gamot")}
          </Txt>
          <DemoNote feature="medications" />
          <Card style={{ alignItems: "center", gap: 6 }}>
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: "100%", height: 180, borderRadius: 16 }} resizeMode="contain" accessibilityLabel={`Photo of ${dose.name}`} />
            ) : (
              <IconBox icon={Pill} size={72} bg={kc.lilacBg} />
            )}
            <Txt size={34} weight="black" color={kc.navy} center>
              {dose.name}
            </Txt>
            <Txt size={20} weight="bold" center>
              {dose.dose}
            </Txt>
            {dose.instructions ? (
              <Txt size={19} center>
                {dose.instructions}
              </Txt>
            ) : null}
            <Txt size={16} muted center>
              {t(L, "For", "Para sa")} {clockLabel(dose.due_at)}
            </Txt>
          </Card>
          <Txt size={20} weight="extra" color={kc.navy} center>
            {t(L, "Did you take it?", "Nainom mo na ba?")}
          </Txt>
          {error ? <Banner tone="warning" text={error} /> : null}
          <Btn variant="success" icon={Check} label="Nainom ko na / I took it" onPress={() => answer("taken")} disabled={sending} />
          <Btn variant="soft" icon={Clock} label={t(L, "Remind me later", "Paalalahanan mamaya")} onPress={later} disabled={sending} />
          <Btn variant="ghost" icon={SkipForward} label={t(L, "Skip this dose", "Laktawan ito")} onPress={() => answer("skipped")} disabled={sending} />
          <View style={{ height: 12 }} />
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}
