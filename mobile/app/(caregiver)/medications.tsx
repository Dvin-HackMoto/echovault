// EchoVault mobile — caregiver medications management (CGV-5).
//
// Two sections:
//   (a) Manage meds — list via listMedications(); an inline Add/Edit form with
//       name (required), dose (required), instructions, optional photo, and
//       one+ dosing times. Each time is a time_of_day ('HH:MM') + days ('daily'
//       or a weekday multiselect joined as 'MO,WE,FR'). The client exposes NO
//       standalone medication_times endpoint, so the times ride inside the
//       create/update payload, and the hub replaces them. Edit via
//       updateMedication, remove via deleteMedication behind a confirm.
//   (b) Review today's doses — load via todayMedicationLogs(); each dose shows
//       its status (unconfirmed/taken/skipped) and confirmed_by (none/patient/
//       caregiver). The caregiver can confirm or correct a dose via
//       logMedicationStatus(logId, 'taken'|'skipped', 'caregiver').
//
// Every network call goes through src/api/* — never a raw fetch. Errors from the
// hub (validation, 403 for a viewer) are shown as the hub's message.

import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import * as ImagePicker from "expo-image-picker";

import { ApiError, getHubUrl, photoUri } from "../../src/api/client";
import {
  createMedication,
  deleteMedication,
  listMedications,
  logMedicationStatus,
  todayMedicationLogs,
  updateMedication,
  uploadMedicationPhoto,
  type MedicationInput,
  type MedicationWithTimes,
} from "../../src/api/medications";
import BigButton from "../../src/components/BigButton";
import type { Theme } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import type { MedStatus, MedicationLog, MedicationTime } from "../../src/types";
import { useCaregiverGate } from "./_layout";

type Phase = "loading" | "error" | "ready";

/** Weekday codes, in week order. These are the exact codes the backend expects. */
const WEEKDAYS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
] as const;

/** One dosing time as the form edits it before translation to the payload. */
interface TimeDraft {
  timeOfDay: string; // "HH:MM"
  everyDay: boolean; // true => days 'daily'; false => the weekday multiselect
  weekdays: string[]; // ['MO','WE','FR'] when !everyDay
}

/** A saved dosing time as the form edits it. */
function toDraft(time: MedicationTime): TimeDraft {
  const everyDay = !time.days || time.days === "daily";
  return { timeOfDay: time.time_of_day, everyDay, weekdays: everyDay ? [] : time.days.split(",") };
}

function draftsFor(med: MedicationWithTimes | null): TimeDraft[] {
  return med?.times?.length ? med.times.map(toDraft) : [{ timeOfDay: "08:00", everyDay: true, weekdays: [] }];
}

interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

export default function CaregiverMedications() {
  const theme = useTheme();
  const { leaveCaregiverMode, can } = useCaregiverGate();

  // Section (a) state.
  const [medsPhase, setMedsPhase] = useState<Phase>("loading");
  const [meds, setMeds] = useState<MedicationWithTimes[]>([]);
  const [medsError, setMedsError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Section (b) state.
  const [logsPhase, setLogsPhase] = useState<Phase>("loading");
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [busyLogId, setBusyLogId] = useState<string | null>(null);

  // Inline Add/Edit form. `editing` null + closed form => hidden.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MedicationWithTimes | null>(null);

  const loadMeds = useCallback(async () => {
    setMedsPhase("loading");
    setMedsError(null);
    try {
      const rows = await listMedications();
      setMeds(rows);
      setMedsPhase("ready");
    } catch (err) {
      setMedsError(err instanceof ApiError ? err.message : "Couldn't load medications.");
      setMedsPhase("error");
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsPhase("loading");
    setLogsError(null);
    try {
      const rows = await todayMedicationLogs();
      setLogs(rows);
      setLogsPhase("ready");
    } catch (err) {
      setLogsError(err instanceof ApiError ? err.message : "Couldn't load today's doses.");
      setLogsPhase("error");
    }
  }, []);

  const loadAll = useCallback(async () => {
    // Both sections load independently so one failure doesn't blank the other.
    await Promise.all([loadMeds(), loadLogs()]);
  }, [loadMeds, loadLogs]);

  // Reload whenever the screen regains focus (e.g. after closing the form).
  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(med: MedicationWithTimes) {
    setEditing(med);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function onSaved() {
    closeForm();
    await loadMeds();
  }

  function onDelete(med: MedicationWithTimes) {
    Alert.alert(
      "Remove medication",
      `Remove "${med.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyId(med.id);
            try {
              await deleteMedication(med.id);
              await loadMeds();
            } catch (err) {
              Alert.alert(
                "Couldn't remove",
                err instanceof ApiError ? err.message : "Something went wrong.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  // Caregiver confirms or corrects a dose. confirmed_by is always 'caregiver'
  // here (this is the caregiver app), separating it from a patient tap.
  async function onSetDose(log: MedicationLog, status: MedStatus) {
    setBusyLogId(log.id);
    try {
      await logMedicationStatus(log.id, status, "caregiver");
      await loadLogs();
    } catch (err) {
      Alert.alert(
        "Couldn't update dose",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setBusyLogId(null);
    }
  }

  function medName(medicationId: string): string {
    return meds.find((m) => m.id === medicationId)?.name ?? "Medication";
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          Medications
        </Text>

        {/* ───────────────── Section (a): Manage meds ───────────────── */}
        <SectionHeader title="Manage medications" theme={theme} />

        {can("create") ? <BigButton label="Add medication" onPress={openAdd} theme={theme} /> : null}

        {medsPhase === "loading" ? (
          <View style={[styles.center, { padding: theme.spacing.xl }]}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : null}

        {medsPhase === "error" ? (
          <View style={{ gap: theme.spacing.md, alignItems: "center", padding: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Can't load medications
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
              {medsError}
            </Text>
            <BigButton label="Try again" onPress={() => void loadMeds()} theme={theme} />
          </View>
        ) : null}

        {medsPhase === "ready" && meds.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            No medications yet. Use “Add medication” to create one.
          </Text>
        ) : null}

        {medsPhase === "ready" && meds.length > 0
          ? meds.map((med) => (
              <MedicationRow
                key={med.id}
                med={med}
                theme={theme}
                busy={busyId === med.id}
                onEdit={() => openEdit(med)}
                onDelete={() => onDelete(med)}
              />
            ))
          : null}

        {/* ──────────────── Section (b): Today's doses ──────────────── */}
        <SectionHeader title="Today's doses" theme={theme} />

        {logsPhase === "loading" ? (
          <View style={[styles.center, { padding: theme.spacing.xl }]}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : null}

        {logsPhase === "error" ? (
          <View style={{ gap: theme.spacing.md, alignItems: "center", padding: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Can't load today's doses
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
              {logsError}
            </Text>
            <BigButton label="Try again" onPress={() => void loadLogs()} theme={theme} />
          </View>
        ) : null}

        {logsPhase === "ready" && logs.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            No doses due today.
          </Text>
        ) : null}

        {logsPhase === "ready" && logs.length > 0
          ? logs.map((log) => (
              <DoseRow
                key={log.id}
                log={log}
                medName={medName(log.medication_id)}
                theme={theme}
                busy={busyLogId === log.id}
                onConfirm={() => void onSetDose(log, "taken")}
                onSkip={() => void onSetDose(log, "skipped")}
              />
            ))
          : null}

        <BigButton
          label="Leave caregiver mode"
          variant="danger"
          onPress={() => void leaveCaregiverMode()}
          theme={theme}
        />
      </ScrollView>

      {/* Inline Add/Edit form, presented as a modal over the list. */}
      <Modal visible={formOpen} animationType="slide" onRequestClose={closeForm}>
        <MedicationForm
          theme={theme}
          editing={editing}
          onCancel={closeForm}
          onSaved={() => void onSaved()}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ──────────────────────────────── list rows ───────────────────────────────

function MedicationRow({
  med,
  theme,
  busy,
  onEdit,
  onDelete,
}: {
  med: MedicationWithTimes;
  theme: Theme;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { can } = useCaregiverGate();
  return (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        {med.name}
      </Text>
      <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>{med.dose}</Text>
      {med.instructions ? (
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
          {med.instructions}
        </Text>
      ) : null}

      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={styles.actionRow}>
          {can("update") ? <ActionButton label="Edit" theme={theme} onPress={onEdit} /> : null}
          {can("delete") ? <ActionButton label="Remove" theme={theme} variant="danger" onPress={onDelete} /> : null}
        </View>
      )}
    </View>
  );
}

function DoseRow({
  log,
  medName,
  theme,
  busy,
  onConfirm,
  onSkip,
}: {
  log: MedicationLog;
  medName: string;
  theme: Theme;
  busy: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const { can } = useCaregiverGate();
  return (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        {medName}
      </Text>
      <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
        Due {log.due_at}
      </Text>

      <View style={styles.badgeRow}>
        <Badge label={prettyStatus(log.status)} theme={theme} tone={statusTone(log.status)} />
        <Badge label={prettyConfirmedBy(log.confirmed_by)} theme={theme} tone="muted" />
      </View>

      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={styles.actionRow}>
          {can("update") ? <ActionButton label="Mark taken" theme={theme} onPress={onConfirm} /> : null}
          {can("update") ? <ActionButton label="Mark skipped" theme={theme} variant="danger" onPress={onSkip} /> : null}
        </View>
      )}
    </View>
  );
}

// ──────────────────────────── add / edit form ─────────────────────────────

function MedicationForm({
  theme,
  editing,
  onCancel,
  onSaved,
}: {
  theme: Theme;
  editing: MedicationWithTimes | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === null;

  const [name, setName] = useState(editing?.name ?? "");
  const [dose, setDose] = useState(editing?.dose ?? "");
  const [instructions, setInstructions] = useState(editing?.instructions ?? "");
  // Optional pill/box photo, uploaded after the medicine is saved (multipart).
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  // Saved times are pre-filled; a new medicine starts with one daily time.
  const [times, setTimes] = useState<TimeDraft[]>(draftsFor(editing));
  const [saving, setSaving] = useState(false);
  const [hubUrl, setHubUrlState] = useState<string | null>(null);

  useEffect(() => {
    getHubUrl().then(setHubUrlState).catch(() => setHubUrlState(null));
  }, []);

  // Reset local state whenever the form is reused for a different medication.
  useEffect(() => {
    setName(editing?.name ?? "");
    setDose(editing?.dose ?? "");
    setInstructions(editing?.instructions ?? "");
    setPhoto(null);
    setTimes(draftsFor(editing));
  }, [editing]);

  async function pickPhoto(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", fromCamera ? "Allow camera access to take a photo." : "Allow photo access to pick an image.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, quality: 0.7 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = !result.canceled ? result.assets[0] : null;
    if (asset) {
      const type = asset.mimeType ?? "image/jpeg";
      setPhoto({ uri: asset.uri, name: asset.fileName ?? `medicine-${Date.now()}.${type.split("/")[1] ?? "jpg"}`, type });
    }
  }

  function updateTime(index: number, patch: Partial<TimeDraft>) {
    setTimes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function toggleTimeWeekday(index: number, code: string) {
    setTimes((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const weekdays = t.weekdays.includes(code)
          ? t.weekdays.filter((c) => c !== code)
          : [...t.weekdays, code];
        return { ...t, weekdays };
      }),
    );
  }

  function addTime() {
    setTimes((prev) => [...prev, { timeOfDay: "08:00", everyDay: true, weekdays: [] }]);
  }

  function removeTime(index: number) {
    setTimes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSave() {
    const trimmedName = name.trim();
    const trimmedDose = dose.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter the medication name.");
      return;
    }
    if (!trimmedDose) {
      Alert.alert("Dose required", "Please enter the dose.");
      return;
    }
    // Validate each dosing time.
    for (const t of times) {
      if (!/^\d{2}:\d{2}$/.test(t.timeOfDay.trim())) {
        Alert.alert("Time needed", "Enter each dose time as HH:MM (24-hour).");
        return;
      }
      if (!t.everyDay && t.weekdays.length === 0) {
        Alert.alert("Pick days", "Choose at least one weekday for each non-daily time.");
        return;
      }
    }

    // Build the days string for a draft: 'daily' or week-ordered 'MO,WE,FR'.
    const timesPayload = times.map((t) => ({
      time_of_day: t.timeOfDay.trim(),
      days: t.everyDay
        ? "daily"
        : WEEKDAYS.map((d) => d.code).filter((c) => t.weekdays.includes(c)).join(","),
    }));

    // The times ride inside the medication payload — the hub replaces them.
    const payload: MedicationInput = {
      name: trimmedName,
      dose: trimmedDose,
      instructions: emptyToNull(instructions),
      times: timesPayload,
    };

    setSaving(true);
    try {
      const saved = isNew ? await createMedication(payload) : await updateMedication(editing!.id, payload);
      if (photo) {
        await uploadMedicationPhoto(saved.id, photo);
      }
      onSaved();
    } catch (err) {
      Alert.alert(
        "Couldn't save",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          {isNew ? "Add medication" : "Edit medication"}
        </Text>

        {/* Name (required). */}
        <Field label="Name" theme={theme}>
          <Input value={name} onChangeText={setName} placeholder="e.g. Metformin" editable={!saving} theme={theme} />
        </Field>

        {/* Dose (required). */}
        <Field label="Dose" theme={theme}>
          <Input value={dose} onChangeText={setDose} placeholder="e.g. 500 mg, 1 tablet" editable={!saving} theme={theme} />
        </Field>

        {/* Instructions (optional, multiline). */}
        <Field label="Instructions (optional)" theme={theme}>
          <Input
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. Take with food"
            editable={!saving}
            theme={theme}
            multiline
          />
        </Field>

        {/* Photo (optional): shown on the patient's medicine card. */}
        <Field label="Pill or box photo (optional)" theme={theme}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
            {photo?.uri || photoUri(hubUrl, editing?.photo_url, editing?.photo_path) ? (
              <Image
                source={{ uri: photo?.uri ?? photoUri(hubUrl, editing?.photo_url, editing?.photo_path)! }}
                accessibilityLabel="Medicine photo"
                style={{ width: 72, height: 72, borderRadius: theme.radii.md }}
              />
            ) : (
              <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>No photo</Text>
            )}
            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <ActionButton label="Camera" theme={theme} onPress={() => void pickPhoto(true)} />
              <ActionButton label="Gallery" theme={theme} onPress={() => void pickPhoto(false)} />
            </View>
          </View>
        </Field>

        {/* Dosing times — one or more. */}
        <Field label="Times" theme={theme}>
          <View style={{ gap: theme.spacing.md }}>
            {times.map((t, index) => (
              <View
                key={index}
                style={{
                  gap: theme.spacing.sm,
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.body, fontWeight: "700" }}>
                  Time {index + 1}
                </Text>
                <Input
                  value={t.timeOfDay}
                  onChangeText={(v) => updateTime(index, { timeOfDay: v })}
                  placeholder="HH:MM"
                  editable={!saving}
                  theme={theme}
                  keyboardType="number-pad"
                />
                <View style={styles.chipRow}>
                  <Chip
                    label="Every day"
                    selected={t.everyDay}
                    onPress={() => updateTime(index, { everyDay: true })}
                    theme={theme}
                    disabled={saving}
                  />
                  <Chip
                    label="Specific days"
                    selected={!t.everyDay}
                    onPress={() => updateTime(index, { everyDay: false })}
                    theme={theme}
                    disabled={saving}
                  />
                </View>
                {!t.everyDay ? (
                  <View style={styles.chipRow}>
                    {WEEKDAYS.map((d) => (
                      <Chip
                        key={d.code}
                        label={d.label}
                        selected={t.weekdays.includes(d.code)}
                        onPress={() => toggleTimeWeekday(index, d.code)}
                        theme={theme}
                        disabled={saving}
                      />
                    ))}
                  </View>
                ) : null}
                {times.length > 1 ? (
                  <ActionButton
                    label="Remove time"
                    theme={theme}
                    variant="danger"
                    onPress={() => removeTime(index)}
                  />
                ) : null}
              </View>
            ))}
            <ActionButton label="Add another time" theme={theme} onPress={addTime} />
          </View>
        </Field>

        <BigButton
          label={saving ? "Saving…" : isNew ? "Create medication" : "Save changes"}
          onPress={() => void onSave()}
          loading={saving}
          theme={theme}
        />
        <BigButton label="Cancel" variant="danger" onPress={onCancel} disabled={saving} theme={theme} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ──────────────────────────── small components ────────────────────────────

function SectionHeader({ title, theme }: { title: string; theme: Theme }) {
  return (
    <Text
      style={{
        color: theme.colors.fg,
        fontSize: theme.fontSizes.title,
        fontWeight: "800",
        marginTop: theme.spacing.sm,
      }}
    >
      {title}
    </Text>
  );
}

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  editable,
  theme,
  multiline = false,
  keyboardType = "default",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable: boolean;
  theme: Theme;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      editable={editable}
      multiline={multiline}
      keyboardType={keyboardType}
      style={[
        styles.input,
        {
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          fontSize: theme.fontSizes.body,
          color: theme.colors.fg,
          minHeight: multiline ? theme.touchTargets.large : theme.touchTargets.min,
          textAlignVertical: multiline ? "top" : "center",
        },
      ]}
    />
  );
}

/** A pill-shaped, selectable chip used by the day pickers. */
function Chip({
  label,
  selected,
  onPress,
  theme,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: Theme;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.primary : theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radii.pill,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.colors.onPrimary : theme.colors.fg,
          fontSize: theme.fontSizes.button,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  theme,
  onPress,
  variant = "primary",
}: {
  label: string;
  theme: Theme;
  onPress: () => void;
  variant?: "primary" | "danger";
}) {
  const bg = variant === "danger" ? theme.colors.danger : theme.colors.primary;
  const fg = variant === "danger" ? theme.colors.onDanger : theme.colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.button, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Badge({
  label,
  theme,
  tone,
}: {
  label: string;
  theme: Theme;
  tone: "primary" | "success" | "danger" | "muted";
}) {
  const bg =
    tone === "primary"
      ? theme.colors.primary
      : tone === "success"
        ? theme.colors.success
        : tone === "danger"
          ? theme.colors.danger
          : theme.colors.border;
  const fg = tone === "muted" ? theme.colors.fg : theme.colors.onPrimary;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: theme.radii.pill,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
      }}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.caption, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────── helpers ────────────────────────────────

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function prettyStatus(status: MedStatus): string {
  switch (status) {
    case "unconfirmed":
      return "Unconfirmed";
    case "taken":
      return "Taken";
    case "skipped":
      return "Skipped";
  }
}

function statusTone(status: MedStatus): "primary" | "success" | "danger" | "muted" {
  switch (status) {
    case "unconfirmed":
      return "muted";
    case "taken":
      return "success";
    case "skipped":
      return "danger";
  }
}

function prettyConfirmedBy(confirmedBy: MedicationLog["confirmed_by"]): string {
  switch (confirmedBy) {
    case "none":
      return "Not confirmed";
    case "patient":
      return "By patient";
    case "caregiver":
      return "By caregiver";
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  input: { borderWidth: 1 },
});
