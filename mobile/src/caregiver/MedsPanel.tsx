// EchoVault mobile — medications (CGV-5, Kali design: CareSchedule › Medication).
// Today's doses with who answered them (the patient's own answer is kept apart
// from a caregiver's confirmation), and the medicines themselves: name, dose,
// instructions, photo and dose times. Pausing a medicine stops new doses.

import { Archive, Camera, Check, Image as ImageIcon, Pencil, Pill as PillIcon, Plus, RotateCcw, ShieldCheck, Trash2, Undo2, X } from "lucide-react-native";
import { useState } from "react";
import { Image, View } from "react-native";

import { getHubUrl, photoUri } from "../api/client";
import {
  createMedication,
  deleteMedication,
  listMedications,
  logMedicationStatus,
  todayMedicationLogs,
  updateMedication,
  uploadMedicationPhoto,
  type MedicationWithTimes,
} from "../api/medications";
import { clockLabel } from "../time";
import type { Dose } from "../types";
import { Banner, Btn, Card, Confirm, EmptyState, Field, IconBox, IconBtn, Input, Loading, Overline, Pill, Row, Sheet, Txt } from "../ui/kit";
import { useToast } from "../ui/toast";
import { kc } from "../ui/tokens";
import { saveError, useHub } from "../ui/useHub";
import { WEEKDAYS, WEEKDAY_LABEL, medicineDays, parseTime, type Weekday } from "./forms";
import { pickPhoto, type PhotoSource } from "./pickPhoto";
import { useSession } from "./session";

interface TimeDraft {
  time: string;
  weekdays: Weekday[];
}

interface Draft {
  id: string | null;
  name: string;
  dose: string;
  instructions: string;
  times: TimeDraft[];
}

const toTimeDraft = (t: { time_of_day: string; days: string }): TimeDraft => ({
  time: clockLabel(t.time_of_day),
  weekdays: t.days === "daily" ? [] : (t.days.split(",") as Weekday[]),
});

function doseStatus(d: Dose): { label: string; bg: string; fg: string } {
  if (d.status === "taken" && d.confirmed_by === "caregiver") return { label: "Caregiver confirmed", bg: kc.green, fg: kc.white };
  if (d.status === "taken") return { label: "Patient said taken", bg: kc.greenBg, fg: kc.green };
  if (d.status === "skipped") return { label: d.confirmed_by === "caregiver" ? "Skipped (caregiver)" : "Skipped", bg: kc.slateBg, fg: kc.slate };
  return { label: "No answer yet", bg: kc.sky, fg: kc.navy };
}

export default function MedsPanel() {
  const { can } = useSession();
  const toast = useToast();
  const meds = useHub(listMedications, "care-meds");
  const doses = useHub(todayMedicationLogs, "doses-today");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<MedicationWithTimes | null>(null);

  // photo URLs need the hub address
  const hubUrl = useHub(getHubUrl).data ?? null;

  async function run(task: () => Promise<unknown>, message: string, keepSheet = false) {
    setBusy(true);
    try {
      await task();
      toast(message);
      if (!keepSheet) setDraft(null);
      setDel(null);
      await Promise.all([meds.reload(), doses.reload()]);
    } catch (e) {
      const msg = saveError(e);
      if (draft) setError(msg);
      else toast(msg);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Medicine name is required.");
    if (!draft.dose.trim()) return setError("Dose is required, e.g. 1 tablet or 5 ml.");
    if (!draft.times.length) return setError("Add at least one time.");
    const times = [];
    for (const t of draft.times) {
      const parsed = parseTime(t.time);
      if (!parsed) return setError(`“${t.time}” isn't a time. Try 8:00 AM or 20:00.`);
      times.push({ time_of_day: parsed, days: medicineDays(t.weekdays) });
    }
    setError(null);
    const body = { name: draft.name.trim(), dose: draft.dose.trim(), instructions: draft.instructions.trim() || null, times };
    run(() => (draft.id ? updateMedication(draft.id, body) : createMedication(body)), draft.id ? "Medicine updated" : "Medicine added");
  }

  async function addPhoto(source: PhotoSource) {
    if (!draft?.id) return;
    const file = await pickPhoto(source).catch(() => null);
    if (!file) return;
    run(() => uploadMedicationPhoto(draft.id as string, file), "Photo saved", true);
  }

  const up = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setTime = (i: number, p: Partial<TimeDraft>) => setDraft((d) => (d ? { ...d, times: d.times.map((t, k) => (k === i ? { ...t, ...p } : t)) } : d));
  const editing = draft?.id ? (meds.data ?? []).find((m) => m.id === draft.id) : null;
  const editingPhoto = editing ? photoUri(hubUrl, (editing as { photo_url?: string | null }).photo_url, editing.photo_path) : null;

  const todays = doses.data ?? [];
  const active = (meds.data ?? []).filter((m) => m.is_active);
  const paused = (meds.data ?? []).filter((m) => !m.is_active);

  return (
    <>
      <Overline>Today's doses</Overline>
      {doses.loading && !doses.data ? <Loading /> : null}
      {doses.error && !doses.data ? <Banner tone="warning" text={doses.error} /> : null}
      {doses.data && !todays.length ? (
        <Txt size={15} muted>
          No doses today.
        </Txt>
      ) : null}
      <View style={{ gap: 8 }}>
        {todays.map((d) => {
          const s = doseStatus(d);
          return (
            <Card key={d.id} style={{ padding: 12 }}>
              <Row>
                <IconBox icon={PillIcon} size={42} bg={kc.lilacBg} />
                <View style={{ flex: 1 }}>
                  <Txt size={16} weight="extra" color={kc.navy}>
                    {d.name} · {d.dose}
                  </Txt>
                  <Txt size={13} muted>
                    {clockLabel(d.due_at)}
                  </Txt>
                </View>
                <Pill label={s.label} bg={s.bg} fg={s.fg} />
              </Row>
              {can("update") ? (
                d.status === "taken" && d.confirmed_by === "patient" ? (
                  <View style={{ marginTop: 10, borderRadius: 12, backgroundColor: kc.cream, padding: 10, gap: 8 }}>
                    <Txt size={14}>The patient reported taking this. Did you see it taken?</Txt>
                    <Btn size="md" variant="warm" icon={ShieldCheck} label="Confirm taken" disabled={busy} onPress={() => run(() => logMedicationStatus(d.id, "taken", "caregiver"), "Dose confirmed")} />
                  </View>
                ) : d.status === "unconfirmed" ? (
                  <Row gap={8} style={{ marginTop: 10 }}>
                    <Btn size="md" variant="soft" icon={Check} label="Taken" disabled={busy} style={{ flex: 1 }} onPress={() => run(() => logMedicationStatus(d.id, "taken", "caregiver"), "Recorded as taken")} />
                    <Btn size="md" variant="ghost" icon={X} label="Skipped" disabled={busy} style={{ flex: 1 }} onPress={() => run(() => logMedicationStatus(d.id, "skipped", "caregiver"), "Recorded as skipped")} />
                  </Row>
                ) : (
                  <Btn size="md" variant="ghost" icon={Undo2} label="Correct this" disabled={busy} style={{ marginTop: 10, alignSelf: "flex-start" }} onPress={() => run(() => logMedicationStatus(d.id, "unconfirmed", "caregiver"), "Reset to no answer")} />
                )
              ) : null}
            </Card>
          );
        })}
      </View>

      <Overline>Medicines</Overline>
      {can("create") ? <Btn size="md" icon={Plus} label="Add a medicine" onPress={() => { setError(null); setDraft({ id: null, name: "", dose: "", instructions: "", times: [{ time: "8:00 AM", weekdays: [] }] }); }} /> : null}
      {meds.fromCache ? <Banner tone="warning" style={{ marginTop: 8 }} text="Can't reach the hub. Showing saved medicines." /> : null}
      {meds.error && !meds.data ? <EmptyState title="Medicines aren't available" body={meds.error} /> : null}
      <View style={{ gap: 8, marginTop: 8 }}>
        {[...active, ...paused].map((m) => (
          <Card key={m.id} style={{ padding: 12, opacity: m.is_active ? 1 : 0.7 }}>
            <Row>
              <PillIcon size={22} color={kc.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={16} weight="extra" color={kc.navy} numberOfLines={1}>
                  {m.name} · {m.dose}
                </Txt>
                <Txt size={13} muted numberOfLines={2}>
                  {m.times.map((t) => `${clockLabel(t.time_of_day)}${t.days === "daily" ? "" : ` (${t.days})`}`).join(", ") || "No times"}
                  {m.is_active ? "" : " · paused"}
                </Txt>
              </View>
              {m.is_active && can("update") ? (
                <>
                  <IconBtn icon={Pencil} label={`Edit ${m.name}`} onPress={() => { setError(null); setDraft({ id: m.id, name: m.name, dose: m.dose, instructions: m.instructions ?? "", times: m.times.map(toTimeDraft) }); }} />
                  <IconBtn icon={Archive} label={`Pause ${m.name}`} onPress={() => run(() => updateMedication(m.id, { is_active: 0 }), "Medicine paused")} />
                </>
              ) : null}
              {!m.is_active && can("update") ? <IconBtn icon={RotateCcw} label={`Restore ${m.name}`} onPress={() => run(() => updateMedication(m.id, { is_active: 1 }), "Medicine restored")} /> : null}
              {!m.is_active && can("delete") ? <IconBtn icon={Trash2} tone="danger" label={`Delete ${m.name}`} onPress={() => setDel(m)} /> : null}
            </Row>
          </Card>
        ))}
      </View>

      <Sheet open={!!draft} title={draft?.id ? "Edit medicine" : "New medicine"} onClose={() => setDraft(null)}>
        {draft ? (
          <>
            {draft.id ? (
              <Row>
                {editingPhoto ? <Image source={{ uri: editingPhoto }} style={{ width: 72, height: 72, borderRadius: 16 }} /> : <IconBox icon={PillIcon} size={72} bg={kc.lilacBg} />}
                <View style={{ flex: 1, gap: 6 }}>
                  <Btn size="md" variant="soft" icon={Camera} label="Take photo" disabled={busy} onPress={() => addPhoto("camera")} />
                  <Btn size="md" variant="ghost" icon={ImageIcon} label="From gallery" disabled={busy} onPress={() => addPhoto("library")} />
                </View>
              </Row>
            ) : (
              <Txt size={14} muted>
                You can add a photo of the pill or box after saving.
              </Txt>
            )}
            <Field label="Medicine name">
              <Input value={draft.name} onChangeText={(v) => up({ name: v })} placeholder="Metformin" />
            </Field>
            <Field label="Dose">
              <Input value={draft.dose} onChangeText={(v) => up({ dose: v })} placeholder="1 tablet" />
            </Field>
            <Field label="Instructions (shown to the patient)">
              <Input multiline value={draft.instructions} onChangeText={(v) => up({ instructions: v })} placeholder="After breakfast, with a full glass of water" />
            </Field>
            <Field label="Times">
              <View style={{ gap: 10 }}>
                {draft.times.map((t, i) => (
                  <Card key={i} style={{ padding: 10, gap: 8, backgroundColor: kc.careBg }}>
                    <Row gap={8}>
                      <Input value={t.time} onChangeText={(v) => setTime(i, { time: v })} placeholder="8:00 AM" style={{ flex: 1 }} />
                      {draft.times.length > 1 ? <IconBtn icon={X} label="Remove this time" onPress={() => up({ times: draft.times.filter((_, k) => k !== i) })} /> : null}
                    </Row>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {WEEKDAYS.map((d) => {
                        const on = t.weekdays.includes(d);
                        return <Btn key={d} size="md" variant={on ? "navy" : "soft"} label={WEEKDAY_LABEL[d]} onPress={() => setTime(i, { weekdays: on ? t.weekdays.filter((x) => x !== d) : [...t.weekdays, d] })} />;
                      })}
                    </View>
                    <Txt size={12} muted>
                      {t.weekdays.length === 0 || t.weekdays.length === 7 ? "Every day" : "Only on the days picked"}
                    </Txt>
                  </Card>
                ))}
                <Btn size="md" variant="ghost" icon={Plus} label="Add another time" onPress={() => up({ times: [...draft.times, { time: "8:00 PM", weekdays: [] }] })} />
              </View>
            </Field>
            {error ? <Banner tone="error" text={error} /> : null}
            <Btn icon={Check} label="Save" loading={busy} onPress={save} />
          </>
        ) : null}
      </Sheet>

      <Confirm
        open={!!del}
        danger
        title="Delete permanently?"
        body={`${del?.name ?? ""} and its dose history will be removed from the hub. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={busy}
        onCancel={() => setDel(null)}
        onConfirm={() => del && run(() => deleteMedication(del.id), "Medicine deleted")}
      />
    </>
  );
}
