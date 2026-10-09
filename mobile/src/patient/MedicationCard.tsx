// EchoVault mobile — PAT-6: a large card for a dose that is due and still
// unconfirmed.
//
// The card only asks. Answering records what the patient said (confirmed_by =
// patient); it never claims the app knows the medicine was taken. "Remind me
// later" closes the card without answering, so nobody is pushed into a wrong
// answer.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { photoUri } from "../api/client";
import { logMedicationStatus, todayMedicationLogs } from "../api/medications";
import BigButton from "../components/BigButton";
import { DemoTag, Notice } from "../components/Notice";
import { useTheme } from "../theme-context";
import { clockLabel } from "../time";
import type { Dose } from "../types";
import { hubMessage, isUnreachable } from "./cached";
import { usePatient } from "./context";
import { dueDose } from "./logic";

const CHECK_EVERY_MS = 60 * 1000;
const LATER_MS = 15 * 60 * 1000;

export default function MedicationCard() {
  const theme = useTheme();
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
      setError(isUnreachable(e) ? `${hubMessage(e)} Please try again in a moment.` : "That did not save. Please try again.");
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
  const text = (size: number, extra: object = {}) => ({ fontSize: size, color: theme.colors.fg, ...extra });
  return (
    <Modal visible animationType="slide" onRequestClose={later}>
      <ScrollView
        contentContainerStyle={[styles.page, { padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.bg }]}
      >
        <Text style={text(theme.fontSizes.title, { fontWeight: "800" })} accessibilityRole="header">
          💊 Time for your medicine
        </Text>
        <DemoTag feature="medications" />
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={[styles.photo, { borderRadius: theme.radii.md, backgroundColor: theme.colors.bg }]}
              accessibilityLabel={`Photo of ${dose.name}`}
            />
          ) : null}
          <Text style={text(theme.fontSizes.display, { fontWeight: "800" })}>{dose.name}</Text>
          <Text style={text(theme.fontSizes.button)}>{dose.dose}</Text>
          {dose.instructions ? <Text style={text(theme.fontSizes.button)}>{dose.instructions}</Text> : null}
          <Text style={{ fontSize: theme.fontSizes.body, color: theme.colors.muted }}>For {clockLabel(dose.due_at)}</Text>
        </View>
        <Text style={text(theme.fontSizes.button, { fontWeight: "600" })}>Did you take it?</Text>
        {error ? <Notice tone="warning" text={error} /> : null}
        <BigButton icon="✅" label="Nainom ko na / I took it" variant="success" onPress={() => answer("taken")} disabled={sending} theme={theme} />
        <BigButton label="Skip this dose" variant="secondary" onPress={() => answer("skipped")} disabled={sending} theme={theme} />
        <BigButton label="Remind me later" variant="secondary" onPress={later} disabled={sending} theme={theme} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center" },
  photo: { width: "100%", height: 180, resizeMode: "contain" },
});
