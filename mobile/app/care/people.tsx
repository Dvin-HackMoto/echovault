// EchoVault mobile â€” family directory (CGV-3, Kali design: CareFamily).
// Add, edit, verify and (admin) remove people, with a photo from the camera or
// gallery. One person can be marked as the caregiver the assistant refers the
// patient to ("You can ask Ana"). Only verified people reach the patient app.

import { Camera, Check, Image as ImageIcon, Pencil, Trash2, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { getHubUrl, photoUri } from "../../src/api/client";
import { createPerson, deletePerson, listPeople, updatePerson, uploadPersonPhoto, type PersonInput } from "../../src/api/people";
import { pickPhoto, type PhotoSource } from "../../src/caregiver/pickPhoto";
import { useSession } from "../../src/caregiver/session";
import type { Person } from "../../src/types";
import { Avatar, Banner, Btn, Card, Confirm, EmptyState, Field, IconBtn, Input, KaliTip, Loading, Pill, Row, Screen, Sheet, Toggle, TopBar, TrustBadge, Txt } from "../../src/ui/kit";
import { useToast } from "../../src/ui/toast";
import { kc, paletteFor } from "../../src/ui/tokens";
import { saveError, useHub } from "../../src/ui/useHub";

interface Draft {
  id: string | null;
  name: string;
  nickname: string;
  relationship: string;
  notes: string;
  is_caregiver: boolean;
  verified: boolean;
}

const EMPTY: Draft = { id: null, name: "", nickname: "", relationship: "", notes: "", is_caregiver: false, verified: true };

export default function CareFamily() {
  const { can } = useSession();
  const toast = useToast();
  const people = useHub(() => listPeople(), "care-people");
  const hubUrl = useHub(getHubUrl).data ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Person | null>(null);

  const list = people.data ?? [];
  const editing = draft?.id ? list.find((p) => p.id === draft.id) ?? null : null;

  async function run(task: () => Promise<unknown>, message: string, keepSheet = false) {
    setBusy(true);
    try {
      await task();
      toast(message);
      if (!keepSheet) setDraft(null);
      setDel(null);
      await people.reload();
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
    if (!draft.name.trim()) return setError("Full name is required.");
    if (!draft.relationship.trim()) return setError("Relationship is required, e.g. daughter or neighbor.");
    setError(null);
    const body: PersonInput = {
      name: draft.name.trim(),
      nickname: draft.nickname.trim() || null,
      relationship: draft.relationship.trim(),
      notes: draft.notes.trim() || null,
      is_caregiver: draft.is_caregiver ? 1 : 0,
      trust: draft.verified ? "verified" : "unverified",
    };
    run(() => (draft.id ? updatePerson(draft.id, body) : createPerson(body)), draft.id ? "Saved" : `${body.name} added`);
  }

  async function addPhoto(source: PhotoSource) {
    if (!draft?.id) return;
    const file = await pickPhoto(source).catch(() => null);
    if (!file) return;
    run(() => uploadPersonPhoto(draft.id as string, file), "Photo saved", true);
  }

  const up = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <>
      <Screen
        care
        onRefresh={people.reload}
        header={<TopBar title="Family Directory" right={can("create") ? <Btn size="md" icon={UserPlus} label="Add" onPress={() => { setError(null); setDraft(EMPTY); }} /> : null} />}
      >
        {people.fromCache ? <Banner tone="warning" style={{ marginBottom: 10 }} text="Can't reach the hub. Showing saved people." /> : null}
        {people.loading && !people.data ? <Loading /> : null}
        {people.error && !people.data ? <EmptyState title="The directory isn't available" body={people.error} /> : null}
        <View style={{ gap: 8 }}>
          {list.map((p) => (
            <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
              <Avatar name={p.name} colors={paletteFor(p.id)} uri={photoUri(hubUrl, p.photo_url, p.photo_path)} size={56} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={16} weight="extra" color={kc.navy} numberOfLines={1}>
                  {p.name}
                  {p.nickname && p.nickname !== p.name ? ` (${p.nickname})` : ""}
                </Txt>
                <Txt size={14} muted numberOfLines={1}>
                  {p.relationship}
                </Txt>
                <Row gap={4}>
                  <TrustBadge trust={p.trust} short />
                  {p.is_caregiver ? <Pill label="Main caregiver" bg={kc.lilacBg} fg={kc.lilac} /> : null}
                </Row>
              </View>
              {p.trust !== "verified" && can("update") ? (
                <Btn size="md" variant="warm" label="Verify" disabled={busy} onPress={() => run(() => updatePerson(p.id, { trust: "verified" }), `${p.nickname || p.name} verified`)} />
              ) : null}
              {can("update") ? (
                <IconBtn
                  icon={Pencil}
                  label={`Edit ${p.name}`}
                  onPress={() => {
                    setError(null);
                    setDraft({ id: p.id, name: p.name, nickname: p.nickname ?? "", relationship: p.relationship, notes: p.notes ?? "", is_caregiver: !!p.is_caregiver, verified: p.trust === "verified" });
                  }}
                />
              ) : null}
            </Card>
          ))}
          {people.data && list.length === 0 ? <KaliTip pose="peek">No one here yet. Tap Add to introduce the family.</KaliTip> : null}
        </View>
      </Screen>

      <Sheet open={!!draft} title={draft?.id ? "Edit person" : "Add person"} onClose={() => setDraft(null)}>
        {draft ? (
          <>
            {draft.id ? (
              <Row>
                <Avatar name={draft.name || "?"} colors={paletteFor(draft.id)} uri={editing ? photoUri(hubUrl, editing.photo_url, editing.photo_path) : null} size={80} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Btn size="md" variant="soft" icon={Camera} label="Take photo" disabled={busy} onPress={() => addPhoto("camera")} />
                  <Btn size="md" variant="ghost" icon={ImageIcon} label="From gallery" disabled={busy} onPress={() => addPhoto("library")} />
                </View>
              </Row>
            ) : (
              <Txt size={14} muted>
                You can add their photo after saving.
              </Txt>
            )}
            <Field label="Full name">
              <Input value={draft.name} onChangeText={(v) => up({ name: v })} placeholder="Ana Santos-Reyes" />
            </Field>
            <Field label="What the patient calls them (optional)">
              <Input value={draft.nickname} onChangeText={(v) => up({ nickname: v })} placeholder="Ana" />
            </Field>
            <Field label="Relationship to the patient">
              <Input value={draft.relationship} onChangeText={(v) => up({ relationship: v })} placeholder="daughter" autoCapitalize="none" />
            </Field>
            <Field label="Description (shown to the patient)">
              <Input multiline value={draft.notes} onChangeText={(v) => up({ notes: v })} placeholder="Your eldest. She lives with you and helps you every day." />
            </Field>
            <Card style={{ paddingVertical: 4 }}>
              <Toggle on={draft.verified} onChange={(v) => up({ verified: v })} label="Information verified" desc="Only verified people appear in the patient app" />
              <Toggle on={draft.is_caregiver} onChange={(v) => up({ is_caregiver: v })} label="Main caregiver" desc="Kali tells the patient to ask this person when it doesn't know" />
            </Card>
            {error ? <Banner tone="error" text={error} /> : null}
            <Btn icon={Check} label="Save" loading={busy} onPress={save} />
            {draft.id && can("delete") ? (
              <Btn variant="danger" icon={Trash2} label="Remove person" disabled={busy} onPress={() => {
                  // one modal at a time: close the sheet, then ask
                  setDraft(null);
                  if (editing) setDel(editing);
                }} />
            ) : null}
          </>
        ) : null}
      </Sheet>

      <Confirm
        open={!!del}
        danger
        title={`Remove ${del?.name ?? ""}?`}
        body="They will be removed from the hub and the patient's family list. This cannot be undone."
        confirmLabel="Remove"
        busy={busy}
        onCancel={() => setDel(null)}
        onConfirm={() => del && run(() => deletePerson(del.id), "Removed")}
      />
    </>
  );
}
