// EchoVault mobile â€” add or edit a memory (CGV-2, Kali design: CareMemoryEdit).
// Sets content, title, category, importance, validity (with dates for
// scheduled/temporary memories), an optional event date and an optional person.
// Verify, archive and (admin) delete are here too. A conflicting pair is
// resolved by keeping one: it is verified, the other is archived as outdated,
// and both forget the conflict. Until the Memories module adds a dedicated
// resolve route (MEM-4), that is done through the CRUD and verify routes.

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Archive, Check, ShieldCheck, Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { createMemory, deleteMemory, getMemory, updateMemory, verifyMemory, type MemoryInput } from "../../../src/api/memories";
import { listPeople } from "../../../src/api/people";
import { useSession } from "../../../src/caregiver/session";
import type { Category, Importance, Memory, Person, Validity } from "../../../src/types";
import { categoryIcon } from "../../../src/ui/icons";
import { Banner, Btn, Card, Chips, Confirm, EmptyState, Field, Input, KaliTip, Loading, Row, Screen, TopBar, TrustBadge, Txt } from "../../../src/ui/kit";
import { CATEGORY_ORDER, IMPORTANCE_ORDER, VALIDITY_ORDER, categoryLabel, importanceLabel, memoryTitle, validityLabel } from "../../../src/ui/labels";
import { useToast } from "../../../src/ui/toast";
import { kc } from "../../../src/ui/tokens";
import { saveError, useHub } from "../../../src/ui/useHub";

interface Draft {
  title: string;
  content: string;
  category: Category;
  importance: Importance;
  validity: Validity;
  event_date: string;
  valid_from: string;
  valid_until: string;
  person_id: string | null;
}

const EMPTY: Draft = { title: "", content: "", category: "identity", importance: "general", validity: "persistent", event_date: "", valid_from: "", valid_until: "", person_id: null };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDraft(m: Memory): Draft {
  return {
    title: m.title ?? "",
    content: m.content,
    category: m.category,
    importance: m.importance,
    validity: m.validity === "archived" ? "persistent" : m.validity,
    event_date: m.event_date?.slice(0, 10) ?? "",
    valid_from: m.valid_from?.slice(0, 10) ?? "",
    valid_until: m.valid_until?.slice(0, 10) ?? "",
    person_id: m.person_id ?? null,
  };
}

export default function CareMemoryEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { can } = useSession();
  const toast = useToast();
  const people = useHub(() => listPeople(), "care-people");
  const [existing, setExisting] = useState<Memory | null | undefined>(isNew ? null : undefined);
  const [other, setOther] = useState<Memory | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  // tab screens stay mounted: load (or clear the form) every time this opens
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setError(null);
    setOther(null);
    if (isNew) {
      setExisting(null);
      setDraft(EMPTY);
      return;
    }
    setExisting(undefined);
    getMemory(id)
      .then(async (m) => {
        if (cancelled) return;
        setExisting(m);
        setDraft(toDraft(m));
        if (m.trust === "conflicting" && m.conflicts_with) {
          const o = await getMemory(m.conflicts_with).catch(() => null);
          if (!cancelled) setOther(o);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setExisting(null);
          setError(saveError(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]));

  const up = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const editable = isNew ? can("create") : can("update");
  const needsDates = draft.validity === "scheduled" || draft.validity === "temporary";

  function payload(): MemoryInput | null {
    if (!draft.content.trim()) {
      setError("Write what the memory is about (description).");
      return null;
    }
    for (const [label, value] of [["Event date", draft.event_date], ["Valid from", draft.valid_from], ["Valid until", draft.valid_until]] as const) {
      if (value && !DATE.test(value)) {
        setError(`${label} must look like 2026-03-12.`);
        return null;
      }
    }
    setError(null);
    return {
      title: draft.title.trim() || null,
      content: draft.content.trim(),
      category: draft.category,
      importance: draft.importance,
      validity: draft.validity,
      event_date: draft.event_date || null,
      valid_from: needsDates ? draft.valid_from || null : null,
      valid_until: needsDates ? draft.valid_until || null : null,
      person_id: draft.person_id,
    };
  }

  async function run(task: () => Promise<unknown>, message: string, leave = true) {
    setBusy(true);
    try {
      await task();
      toast(message);
      if (leave) router.back();
    } catch (e) {
      setError(saveError(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  function save() {
    const body = payload();
    if (!body) return;
    run(() => (isNew ? createMemory({ ...body, source: "caregiver" }) : updateMemory(id, body)), isNew ? "Memory added" : "Record saved");
  }

  function resolve(keep: Memory, drop: Memory) {
    run(async () => {
      await updateMemory(drop.id, { validity: "archived", trust: "outdated", conflicts_with: null });
      await updateMemory(keep.id, { conflicts_with: null });
      await verifyMemory(keep.id);
    }, "Conflict resolved");
  }

  const verifiedPeople: Person[] = people.data ?? [];

  return (
    <>
      <Screen care header={<TopBar title={isNew ? "Add Memory" : "Edit Record"} onBack={() => router.back()} />}>
        {existing === undefined ? <Loading /> : null}
        {!isNew && existing === null ? <EmptyState title="This record isn't available" body={error ?? undefined} action={<Btn variant="soft" label="Back to records" onPress={() => router.back()} />} /> : null}
        {isNew || existing ? (
          <View style={{ gap: 16 }}>
            {existing ? (
              <Row gap={8}>
                <TrustBadge trust={existing.trust} />
                <Txt size={13} muted>
                  {existing.source === "patient" ? "Added by the patient" : existing.source === "ai_suggested" ? "Suggested by the assistant" : "Added by a caregiver"} Â· updated {existing.updated_at.slice(0, 10)}
                </Txt>
              </Row>
            ) : null}

            {existing && other && can("update") ? (
              <Card style={{ backgroundColor: kc.redBg, gap: 8 }}>
                <Row gap={8}>
                  <AlertTriangle size={18} color={kc.red} />
                  <Txt size={16} weight="extra" color={kc.red}>
                    These records disagree
                  </Txt>
                </Row>
                <Txt size={14}>This one: {existing.content}</Txt>
                <Txt size={14}>Other: {other.content}</Txt>
                <Btn variant="ghost" size="md" label="Keep this one" disabled={busy} onPress={() => resolve(existing, other)} />
                <Btn variant="ghost" size="md" label="Keep the other one" disabled={busy} onPress={() => resolve(other, existing)} />
              </Card>
            ) : null}

            {existing?.source === "patient" && existing.trust === "unverified" ? (
              <KaliTip pose="idea">The patient added this. Check the details, then Verify so Kali can share it confidently.</KaliTip>
            ) : null}

            <Field label="Title (optional)">
              <Input value={draft.title} onChangeText={(v) => up({ title: v })} editable={editable} placeholder="e.g. Sunday lunch at Lola's" />
            </Field>
            <Field label="Description (use simple words)">
              <Input multiline value={draft.content} onChangeText={(v) => up({ content: v })} editable={editable} placeholder="Ana is your daughter. She lives with you." />
            </Field>
            <Field label="Category">
              <Chips value={draft.category} onChange={(v) => editable && up({ category: v })} options={CATEGORY_ORDER.map((c) => ({ v: c, l: categoryLabel[c].en, icon: categoryIcon[c] }))} />
            </Field>
            <Field label="Importance">
              <Chips value={draft.importance} onChange={(v) => editable && up({ importance: v })} options={IMPORTANCE_ORDER.map((i) => ({ v: i, l: importanceLabel[i] }))} />
            </Field>
            <Field label="Validity">
              <Chips value={draft.validity} onChange={(v) => editable && up({ validity: v })} options={VALIDITY_ORDER.map((v) => ({ v, l: validityLabel[v] }))} />
            </Field>
            {needsDates ? (
              <Row gap={8} style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Field label="Valid from">
                    <Input value={draft.valid_from} onChangeText={(v) => up({ valid_from: v })} placeholder="2026-10-01" editable={editable} />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Valid until">
                    <Input value={draft.valid_until} onChangeText={(v) => up({ valid_until: v })} placeholder="2026-12-31" editable={editable} />
                  </Field>
                </View>
              </Row>
            ) : null}
            <Field label="Event date (optional)">
              <Input value={draft.event_date} onChangeText={(v) => up({ event_date: v })} placeholder="2026-03-12" editable={editable} />
            </Field>
            {verifiedPeople.length ? (
              <Field label="About a person (optional)">
                <Chips
                  value={draft.person_id ?? "none"}
                  onChange={(v) => editable && up({ person_id: v === "none" ? null : v })}
                  options={[{ v: "none", l: "Nobody" }, ...verifiedPeople.map((p) => ({ v: p.id, l: p.nickname || p.name }))]}
                />
              </Field>
            ) : null}

            {error ? <Banner tone="error" text={error} /> : null}
            {editable ? <Btn icon={Check} label={isNew ? "Add memory" : "Save record"} loading={busy} disabled={!draft.content.trim()} onPress={save} /> : <Banner text="Your access is view-only." />}

            {existing ? (
              <Row gap={8}>
                {existing.trust !== "verified" && can("update") ? (
                  <Btn variant="warm" size="md" icon={ShieldCheck} label="Verify" disabled={busy} style={{ flex: 1 }} onPress={() => run(() => verifyMemory(existing.id), "Marked as verified")} />
                ) : null}
                {can("update") ? <Btn variant="danger" size="md" icon={Archive} label="Archive" disabled={busy} style={{ flex: 1 }} onPress={() => setConfirm("archive")} /> : null}
                {can("delete") ? <Btn variant="danger" size="md" icon={Trash2} label="Delete" disabled={busy} onPress={() => setConfirm("delete")} /> : null}
              </Row>
            ) : null}
          </View>
        ) : null}
      </Screen>
      <Confirm
        open={confirm === "archive"}
        title={`Archive â€œ${existing ? memoryTitle(existing) : ""}â€?`}
        body="The patient will no longer see it. You can restore it from the Archived filter."
        confirmLabel="Yes, archive"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => existing && run(() => updateMemory(existing.id, { validity: "archived" }), "Record archived")}
      />
      <Confirm
        open={confirm === "delete"}
        danger
        title="Delete permanently?"
        body="This memory will be removed from the hub. This cannot be undone."
        confirmLabel="Delete forever"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => existing && run(() => deleteMemory(existing.id), "Memory deleted")}
      />
    </>
  );
}
