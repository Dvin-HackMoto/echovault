// EchoVault mobile — caregiver schedule management (CGV-4).
//
// Lists schedule items via listSchedule() and offers an inline Add/Edit form
// with: title (required), kind (segmented over ScheduleKind), starts_at (date
// + time typed as YYYY-MM-DD and HH:MM), remind_before_min (numeric), an
// optional person picker (listPeople()) and an is_quiet_period toggle (sent as
// 1 | 0). RECURRENCE is chosen from SIMPLE options only — none | daily |
// weekly (with a weekday multiselect) | monthly (with a day-of-month 1-31) —
// and translated to the backend string here; it is NEVER free-typed:
//   none    -> null
//   daily   -> 'daily'
//   weekly  -> 'weekly:MO,WE'   (selected weekday codes joined)
//   monthly -> 'monthly:15'
// Create/edit/remove go through createScheduleItem/updateScheduleItem/
// deleteScheduleItem (remove behind a confirm). Every network call goes
// through src/api/* — never a raw fetch.
//
// BACKEND IS A STUB: the schedule module routes 404 until the Schedule module
// (SCH-1) lands. This screen is wired to the documented contract and renders
// the ApiError message (incl. 404) in its error state instead of crashing.

import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "../../src/api/client";
import { listPeople } from "../../src/api/people";
import {
  createScheduleItem,
  deleteScheduleItem,
  listSchedule,
  updateScheduleItem,
  type ScheduleInput,
} from "../../src/api/schedule";
import BigButton from "../../src/components/BigButton";
import type { Theme } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import type { Person, ScheduleItem, ScheduleKind } from "../../src/types";
import { useCaregiverGate } from "./_layout";

type Phase = "loading" | "error" | "ready";

/** The ScheduleKind options, in the order they appear in the segmented control. */
const KINDS: ScheduleKind[] = ["appointment", "routine", "meal", "visit", "activity"];

/** The simple recurrence modes the form offers. */
type RecurrenceMode = "none" | "daily" | "weekly" | "monthly";
const RECURRENCE_MODES: RecurrenceMode[] = ["none", "daily", "weekly", "monthly"];

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

export default function CaregiverSchedule() {
  const theme = useTheme();
  const { leaveCaregiverMode } = useCaregiverGate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Per-row busy state so one row's action doesn't disable the whole list.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline Add/Edit form. `editing` null => the form is closed.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      // People power the optional picker; a people failure shouldn't block the
      // schedule list, so tolerate it and fall back to no picker options.
      const [rows, peopleRows] = await Promise.all([
        listSchedule(),
        listPeople().catch(() => [] as Person[]),
      ]);
      setItems(rows);
      setPeople(peopleRows);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the schedule.");
      setPhase("error");
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. after closing the form).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: ScheduleItem) {
    setEditing(item);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function onSaved() {
    closeForm();
    await load();
  }

  function onDelete(item: ScheduleItem) {
    Alert.alert(
      "Remove schedule item",
      `Remove "${item.title}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyId(item.id);
            try {
              await deleteScheduleItem(item.id);
              await load();
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

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          Schedule
        </Text>

        <BigButton label="Add schedule item" onPress={openAdd} theme={theme} />

        {phase === "loading" ? (
          <View style={[styles.center, { padding: theme.spacing.xl }]}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : null}

        {phase === "error" ? (
          <View style={{ gap: theme.spacing.md, alignItems: "center", padding: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Can't load the schedule
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
              {error}
            </Text>
            <BigButton label="Try again" onPress={() => void load()} theme={theme} />
          </View>
        ) : null}

        {phase === "ready" && items.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            No schedule items yet. Use “Add schedule item” to create one.
          </Text>
        ) : null}

        {phase === "ready" && items.length > 0
          ? items.map((item) => (
              <ScheduleRow
                key={item.id}
                item={item}
                people={people}
                theme={theme}
                busy={busyId === item.id}
                onEdit={() => openEdit(item)}
                onDelete={() => onDelete(item)}
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
        <ScheduleForm
          theme={theme}
          editing={editing}
          people={people}
          onCancel={closeForm}
          onSaved={() => void onSaved()}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ──────────────────────────────── list row ────────────────────────────────

function ScheduleRow({
  item,
  people,
  theme,
  busy,
  onEdit,
  onDelete,
}: {
  item: ScheduleItem;
  people: Person[];
  theme: Theme;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const person = people.find((p) => p.id === item.person_id) ?? null;
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
        {item.title}
      </Text>
      <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
        {prettyKind(item.kind)} · {item.starts_at}
      </Text>
      <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
        Reminds {item.remind_before_min} min before · {prettyRecurrence(item.recurrence)}
      </Text>
      {person ? (
        <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
          With {person.name}
        </Text>
      ) : null}

      <View style={styles.badgeRow}>
        {item.is_quiet_period ? <Badge label="Quiet period" theme={theme} tone="muted" /> : null}
      </View>

      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={styles.actionRow}>
          <ActionButton label="Edit" theme={theme} onPress={onEdit} />
          <ActionButton label="Remove" theme={theme} variant="danger" onPress={onDelete} />
        </View>
      )}
    </View>
  );
}

// ──────────────────────────── add / edit form ─────────────────────────────

function ScheduleForm({
  theme,
  editing,
  people,
  onCancel,
  onSaved,
}: {
  theme: Theme;
  editing: ScheduleItem | null;
  people: Person[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === null;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [kind, setKind] = useState<ScheduleKind>(editing?.kind ?? "appointment");
  const [date, setDate] = useState(() => splitStartsAt(editing?.starts_at).date);
  const [time, setTime] = useState(() => splitStartsAt(editing?.starts_at).time);
  const [remindBefore, setRemindBefore] = useState(
    editing ? String(editing.remind_before_min) : "15",
  );
  const [personId, setPersonId] = useState<string | null>(editing?.person_id ?? null);
  const [isQuietPeriod, setIsQuietPeriod] = useState<boolean>(Boolean(editing?.is_quiet_period));

  // Recurrence builder state, parsed back from the stored backend string.
  const parsed = parseRecurrence(editing?.recurrence);
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>(parsed.mode);
  const [weekdays, setWeekdays] = useState<string[]>(parsed.weekdays);
  const [dayOfMonth, setDayOfMonth] = useState<string>(parsed.dayOfMonth);

  const [saving, setSaving] = useState(false);

  // Reset local state whenever the form is reused for a different item.
  useEffect(() => {
    const start = splitStartsAt(editing?.starts_at);
    const rec = parseRecurrence(editing?.recurrence);
    setTitle(editing?.title ?? "");
    setKind(editing?.kind ?? "appointment");
    setDate(start.date);
    setTime(start.time);
    setRemindBefore(editing ? String(editing.remind_before_min) : "15");
    setPersonId(editing?.person_id ?? null);
    setIsQuietPeriod(Boolean(editing?.is_quiet_period));
    setRecurrenceMode(rec.mode);
    setWeekdays(rec.weekdays);
    setDayOfMonth(rec.dayOfMonth);
  }, [editing]);

  function toggleWeekday(code: string) {
    setWeekdays((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function onSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Please enter a title for this item.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert("Date needed", "Enter the date as YYYY-MM-DD.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time.trim())) {
      Alert.alert("Time needed", "Enter the time as HH:MM (24-hour).");
      return;
    }
    const remind = Number.parseInt(remindBefore.trim(), 10);
    if (Number.isNaN(remind) || remind < 0) {
      Alert.alert("Reminder needed", "Enter how many minutes before to remind (0 or more).");
      return;
    }

    // Translate the simple recurrence selection to the backend string. The
    // string is built here from the controls, never free-typed.
    const recurrence = buildRecurrence(recurrenceMode, weekdays, dayOfMonth);
    if (recurrenceMode === "weekly" && weekdays.length === 0) {
      Alert.alert("Pick days", "Choose at least one weekday for a weekly schedule.");
      return;
    }
    if (recurrenceMode === "monthly" && !isValidDayOfMonth(dayOfMonth)) {
      Alert.alert("Pick a day", "Choose a day of the month between 1 and 31.");
      return;
    }

    const input: ScheduleInput = {
      title: trimmedTitle,
      kind,
      // Combine the typed date + time into the schema's starts_at string.
      starts_at: `${date.trim()} ${time.trim()}`,
      remind_before_min: remind,
      recurrence, // null | 'daily' | 'weekly:MO,WE' | 'monthly:15'
      person_id: personId,
      // SQLite boolean goes over the wire as 1 | 0.
      is_quiet_period: isQuietPeriod ? 1 : 0,
    };

    setSaving(true);
    try {
      if (isNew) {
        await createScheduleItem(input);
      } else {
        await updateScheduleItem(editing!.id, input);
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
          {isNew ? "Add schedule item" : "Edit schedule item"}
        </Text>

        {/* Title (required). */}
        <Field label="Title" theme={theme}>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Doctor appointment" editable={!saving} theme={theme} />
        </Field>

        {/* Kind (segmented over ScheduleKind). */}
        <Field label="Kind" theme={theme}>
          <Segmented
            options={KINDS.map((k) => ({ value: k, label: prettyKind(k) }))}
            value={kind}
            onChange={(v) => setKind(v)}
            theme={theme}
            disabled={saving}
          />
        </Field>

        {/* Start date + time (plain inputs with format hints). */}
        <Field label="Starts" theme={theme}>
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" editable={!saving} theme={theme} />
            </View>
            <View style={{ flex: 1 }}>
              <Input value={time} onChangeText={setTime} placeholder="HH:MM" editable={!saving} theme={theme} />
            </View>
          </View>
        </Field>

        {/* Reminder lead time (minutes). */}
        <Field label="Remind before (minutes)" theme={theme}>
          <Input
            value={remindBefore}
            onChangeText={setRemindBefore}
            placeholder="15"
            editable={!saving}
            theme={theme}
            keyboardType="number-pad"
          />
        </Field>

        {/* Optional person picker. */}
        <Field label="Person (optional)" theme={theme}>
          <View style={styles.chipRow}>
            <Chip
              label="None"
              selected={personId === null}
              onPress={() => setPersonId(null)}
              theme={theme}
              disabled={saving}
            />
            {people.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={personId === p.id}
                onPress={() => setPersonId(p.id)}
                theme={theme}
                disabled={saving}
              />
            ))}
          </View>
        </Field>

        {/* Recurrence builder — simple options only; translated on save. */}
        <Field label="Repeats" theme={theme}>
          <Segmented
            options={RECURRENCE_MODES.map((m) => ({ value: m, label: prettyMode(m) }))}
            value={recurrenceMode}
            onChange={(v) => setRecurrenceMode(v)}
            theme={theme}
            disabled={saving}
          />
          {recurrenceMode === "weekly" ? (
            <View style={[styles.chipRow, { marginTop: theme.spacing.sm }]}>
              {WEEKDAYS.map((d) => (
                <Chip
                  key={d.code}
                  label={d.label}
                  selected={weekdays.includes(d.code)}
                  onPress={() => toggleWeekday(d.code)}
                  theme={theme}
                  disabled={saving}
                />
              ))}
            </View>
          ) : null}
          {recurrenceMode === "monthly" ? (
            <View style={{ marginTop: theme.spacing.sm }}>
              <Input
                value={dayOfMonth}
                onChangeText={setDayOfMonth}
                placeholder="Day of month (1-31)"
                editable={!saving}
                theme={theme}
                keyboardType="number-pad"
              />
            </View>
          ) : null}
        </Field>

        {/* Quiet-period toggle. */}
        <View style={[styles.toggleRow, { gap: theme.spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Quiet period
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
              Suppresses prompts during this item (e.g. a nap or rest time).
            </Text>
          </View>
          <Switch
            value={isQuietPeriod}
            onValueChange={setIsQuietPeriod}
            disabled={saving}
            accessibilityLabel="Quiet period"
          />
        </View>

        <BigButton
          label={saving ? "Saving…" : isNew ? "Create item" : "Save changes"}
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

/** A single-select segmented control over a small set of string options. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  theme,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  theme: Theme;
  disabled?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={opt.value === value}
          onPress={() => onChange(opt.value)}
          theme={theme}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

/** A pill-shaped, selectable chip used by the segmented controls and pickers. */
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
  tone: "primary" | "success" | "muted";
}) {
  const bg =
    tone === "primary" ? theme.colors.primary : tone === "success" ? theme.colors.success : theme.colors.border;
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

/** Human label for a ScheduleKind. */
function prettyKind(kind: ScheduleKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Human label for a recurrence mode. */
function prettyMode(mode: RecurrenceMode): string {
  switch (mode) {
    case "none":
      return "None";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
  }
}

/** Human-readable summary of a stored recurrence string for the list row. */
function prettyRecurrence(recurrence: string | null | undefined): string {
  const { mode, weekdays, dayOfMonth } = parseRecurrence(recurrence);
  switch (mode) {
    case "none":
      return "Does not repeat";
    case "daily":
      return "Repeats daily";
    case "weekly":
      return weekdays.length ? `Weekly on ${weekdays.join(", ")}` : "Weekly";
    case "monthly":
      return dayOfMonth ? `Monthly on day ${dayOfMonth}` : "Monthly";
  }
}

/** Split a stored starts_at ("YYYY-MM-DD HH:MM[:SS]") into date + time parts. */
function splitStartsAt(startsAt: string | null | undefined): { date: string; time: string } {
  if (!startsAt) return { date: "", time: "" };
  // Accept either a space or a 'T' separator; keep only HH:MM of the time.
  const [datePart, timePartRaw = ""] = startsAt.trim().split(/[ T]/);
  const timePart = timePartRaw.slice(0, 5);
  return { date: datePart ?? "", time: timePart };
}

/** Build the backend recurrence string from the simple controls (never typed). */
function buildRecurrence(
  mode: RecurrenceMode,
  weekdays: string[],
  dayOfMonth: string,
): string | null {
  switch (mode) {
    case "none":
      return null;
    case "daily":
      return "daily";
    case "weekly": {
      // Preserve week order for a stable, readable string.
      const ordered = WEEKDAYS.map((d) => d.code).filter((c) => weekdays.includes(c));
      return `weekly:${ordered.join(",")}`;
    }
    case "monthly":
      return `monthly:${dayOfMonth.trim()}`;
  }
}

/** Parse a stored recurrence string back into the builder's control state. */
function parseRecurrence(recurrence: string | null | undefined): {
  mode: RecurrenceMode;
  weekdays: string[];
  dayOfMonth: string;
} {
  if (!recurrence) return { mode: "none", weekdays: [], dayOfMonth: "" };
  if (recurrence === "daily") return { mode: "daily", weekdays: [], dayOfMonth: "" };
  if (recurrence.startsWith("weekly:")) {
    const codes = recurrence.slice("weekly:".length).split(",").filter(Boolean);
    return { mode: "weekly", weekdays: codes, dayOfMonth: "" };
  }
  if (recurrence.startsWith("monthly:")) {
    return { mode: "monthly", weekdays: [], dayOfMonth: recurrence.slice("monthly:".length) };
  }
  // Unknown stored value — fall back to "none" rather than free-type it back.
  return { mode: "none", weekdays: [], dayOfMonth: "" };
}

/** Validate a day-of-month string is an integer in 1..31. */
function isValidDayOfMonth(value: string): boolean {
  const n = Number.parseInt(value.trim(), 10);
  return !Number.isNaN(n) && n >= 1 && n <= 31;
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
