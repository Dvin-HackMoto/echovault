// EchoVault mobile — routines and appointments (CGV-4, Kali design: CareSchedule).
// Add, edit, pause and (admin) delete one-off and recurring items. Repeat is
// chosen from simple options, never typed as a string; an item can be a quiet
// period (no trivia during it).

import { Archive, CalendarPlus, Check, ChevronRight, Moon, Pencil, RotateCcw, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { listPeople } from "../api/people";
import { createScheduleItem, deleteScheduleItem, listSchedule, updateScheduleItem, type ScheduleInput } from "../api/schedule";
import { clockLabel } from "../time";
import type { ScheduleItem, ScheduleKind } from "../types";
import { kindIcon } from "../ui/icons";
import { Banner, Btn, Card, Chips, Confirm, EmptyState, Field, IconBtn, Input, Loading, Overline, Pill, Row, Sheet, Toggle, Txt } from "../ui/kit";
import { KIND_ORDER, kindLabel, recurrenceLabel } from "../ui/labels";
import { useToast } from "../ui/toast";
import { kc, navy } from "../ui/tokens";
import { saveError, useHub } from "../ui/useHub";
import { WEEKDAYS, WEEKDAY_LABEL, buildRecurrence, isIsoDate, parseTime, readRecurrence, todayIso, type Repeat, type Weekday } from "./forms";
import { useSession } from "./session";

interface Draft {
  id: string | null;
  title: string;
  kind: ScheduleKind;
  date: string;
  time: string;
  repeat: Repeat;
  weekdays: Weekday[];
  duration: string;
  remind: string;
  person_id: string | null;
  notes: string;
  quiet: boolean;
}

function newDraft(): Draft {
  return { id: null, title: "", kind: "appointment", date: todayIso(), time: "10:00", repeat: "once", weekdays: [], duration: "", remind: "30", person_id: null, notes: "", quiet: false };
}

function toDraft(item: ScheduleItem): Draft {
  const { repeat, weekdays } = readRecurrence(item.recurrence);
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    date: item.starts_at.slice(0, 10),
    time: item.starts_at.slice(11, 16),
    repeat,
    weekdays,
    duration: item.duration_min ? String(item.duration_min) : "",
    remind: String(item.remind_before_min ?? 30),
    person_id: item.person_id ?? null,
    notes: item.notes ?? "",
    quiet: item.is_quiet_period === 1,
  };
}

export default function RoutinesPanel() {
  const { can } = useSession();
  const toast = useToast();
  const items = useHub(listSchedule, "care-schedule");
  const people = useHub(() => listPeople(), "care-people");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<ScheduleItem | null>(null);
  const [showPaused, setShowPaused] = useState(false);

  const all = [...(items.data ?? [])].sort((a, b) => a.starts_at.slice(11).localeCompare(b.starts_at.slice(11)));
  const active = all.filter((i) => i.is_active);
  const paused = all.filter((i) => !i.is_active);
  const nameOf = (id: string | null | undefined) => {
    const p = (people.data ?? []).find((x) => x.id === id);
    return p ? p.nickname || p.name : null;
  };

  async function run(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await task();
      toast(message);
      setDraft(null);
      setDel(null);
      await items.reload();
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
    const time = parseTime(draft.time);
    if (!draft.title.trim()) return setError("Give it a title.");
    if (!isIsoDate(draft.date)) return setError("Start date must look like 2026-10-10.");
    if (!time) return setError("Time must look like 8:00 AM or 20:00.");
    if (draft.repeat === "weekly" && !draft.weekdays.length) return setError("Pick at least one day of the week.");
    const body: ScheduleInput = {
      title: draft.title.trim(),
      kind: draft.kind,
      starts_at: `${draft.date} ${time}:00`,
      recurrence: buildRecurrence(draft.repeat, draft.weekdays, draft.date),
      duration_min: draft.duration ? Number(draft.duration) : null,
      remind_before_min: Number(draft.remind),
      person_id: draft.person_id,
      notes: draft.notes.trim() || null,
      is_quiet_period: draft.quiet ? 1 : 0,
    };
    setError(null);
    run(() => (draft.id ? updateScheduleItem(draft.id, body) : createScheduleItem(body)), draft.id ? "Schedule updated" : "Added to schedule");
  }

  const up = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  function Item({ item }: { item: ScheduleItem }) {
    const Icon = kindIcon[item.kind];
    const who = nameOf(item.person_id);
    return (
      <Row style={{ padding: 8 }}>
        <Icon size={22} color={kc.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} weight="bold" numberOfLines={1}>
            {item.title}
          </Txt>
          <Txt size={13} weight="semi" muted>
            {clockLabel(item.starts_at)} · {item.recurrence ? recurrenceLabel(item.recurrence) : item.starts_at.slice(0, 10)}
            {who ? ` · with ${who}` : ""}
          </Txt>
          {item.is_quiet_period ? (
            <View style={{ marginTop: 4 }}>
              <Pill icon={Moon} label="Quiet period" bg={kc.lilacBg} fg={kc.lilac} />
            </View>
          ) : null}
        </View>
        {item.is_active ? (
          can("update") ? (
            <>
              <IconBtn icon={Pencil} label={`Edit ${item.title}`} onPress={() => { setError(null); setDraft(toDraft(item)); }} />
              <IconBtn icon={Archive} label={`Pause ${item.title}`} onPress={() => run(() => updateScheduleItem(item.id, { is_active: 0 }), "Moved to paused")} />
            </>
          ) : null
        ) : (
          <>
            {can("update") ? <IconBtn icon={RotateCcw} label={`Restore ${item.title}`} onPress={() => run(() => updateScheduleItem(item.id, { is_active: 1 }), "Restored")} /> : null}
            {can("delete") ? <IconBtn icon={Trash2} tone="danger" label={`Delete ${item.title}`} onPress={() => setDel(item)} /> : null}
          </>
        )}
      </Row>
    );
  }

  return (
    <>
      {can("create") ? <Btn size="md" icon={CalendarPlus} label="Add appointment or routine" style={{ marginTop: 12 }} onPress={() => { setError(null); setDraft(newDraft()); }} /> : null}
      {items.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text="Can't reach the hub. Showing the saved schedule." /> : null}
      {items.loading && !items.data ? <Loading /> : null}
      {items.error && !items.data ? <EmptyState title="The schedule isn't available" body={items.error} /> : null}
      {items.data ? (
        <>
          <Overline>Active</Overline>
          <Card style={{ padding: 6 }}>
            {active.map((item, i) => (
              <View key={item.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: navy(0.05) }}>
                <Item item={item} />
              </View>
            ))}
            {active.length === 0 ? (
              <Txt size={15} muted style={{ padding: 10 }}>
                Nothing planned yet.
              </Txt>
            ) : null}
          </Card>
        </>
      ) : null}
      {paused.length ? (
        <>
          <Btn variant="ghost" size="md" icon={ChevronRight} label={`Paused (${paused.length})`} style={{ marginTop: 16, alignSelf: "flex-start" }} onPress={() => setShowPaused(!showPaused)} />
          {showPaused ? (
            <Card style={{ padding: 6, marginTop: 8 }}>
              {paused.map((item, i) => (
                <View key={item.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: navy(0.05), opacity: 0.85 }}>
                  <Item item={item} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Sheet open={!!draft} title={draft?.id ? "Edit schedule item" : "Add to schedule"} onClose={() => setDraft(null)}>
        {draft ? (
          <>
            <Field label="Title">
              <Input value={draft.title} onChangeText={(v) => up({ title: v })} placeholder="e.g. Doctor check-up" />
            </Field>
            <Field label="Type">
              <Chips value={draft.kind} onChange={(v) => up({ kind: v })} options={KIND_ORDER.map((k) => ({ v: k, l: kindLabel[k], icon: kindIcon[k] }))} />
            </Field>
            <Row gap={8} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Field label="Start date">
                  <Input value={draft.date} onChangeText={(v) => up({ date: v })} placeholder="2026-10-10" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Time">
                  <Input value={draft.time} onChangeText={(v) => up({ time: v })} placeholder="8:00 AM" />
                </Field>
              </View>
            </Row>
            <Field label="Repeats">
              <Chips
                value={draft.repeat}
                onChange={(v) => up({ repeat: v })}
                options={[
                  { v: "once" as Repeat, l: "Once" },
                  { v: "daily" as Repeat, l: "Every day" },
                  { v: "weekly" as Repeat, l: "Some weekdays" },
                  { v: "monthly" as Repeat, l: "Monthly" },
                ]}
              />
            </Field>
            {draft.repeat === "weekly" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {WEEKDAYS.map((d) => {
                  const on = draft.weekdays.includes(d);
                  return (
                    <Btn
                      key={d}
                      size="md"
                      variant={on ? "navy" : "soft"}
                      label={WEEKDAY_LABEL[d]}
                      onPress={() => up({ weekdays: on ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d] })}
                    />
                  );
                })}
              </View>
            ) : null}
            <Field label="Remind before">
              <Chips value={draft.remind} onChange={(v) => up({ remind: v })} options={["0", "15", "30", "60"].map((m) => ({ v: m, l: m === "0" ? "At the time" : `${m} min` }))} />
            </Field>
            <Field label="How long, in minutes (optional)">
              <Input value={draft.duration} onChangeText={(v) => up({ duration: v.replace(/\D/g, "") })} keyboardType="number-pad" placeholder="30" />
            </Field>
            {(people.data ?? []).length ? (
              <Field label="With (optional)">
                <Chips
                  value={draft.person_id ?? "none"}
                  onChange={(v) => up({ person_id: v === "none" ? null : v })}
                  options={[{ v: "none", l: "Nobody" }, ...(people.data ?? []).map((p) => ({ v: p.id, l: p.nickname || p.name }))]}
                />
              </Field>
            ) : null}
            <Field label="Note for the patient">
              <Input value={draft.notes} onChangeText={(v) => up({ notes: v })} placeholder="Liza will go with you" />
            </Field>
            <Toggle on={draft.quiet} onChange={(v) => up({ quiet: v })} label="Quiet period" desc="No trivia questions during this time" />
            {error ? <Banner tone="error" text={error} /> : null}
            <Btn icon={Check} label="Save" loading={busy} onPress={save} />
          </>
        ) : null}
      </Sheet>

      <Confirm
        open={!!del}
        danger
        title="Delete permanently?"
        body={`“${del?.title ?? ""}” will be removed from the hub. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={busy}
        onCancel={() => setDel(null)}
        onConfirm={() => del && run(() => deleteScheduleItem(del.id), "Deleted")}
      />
    </>
  );
}
