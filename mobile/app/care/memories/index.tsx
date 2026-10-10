// EchoVault mobile â€” caregiver memory records (CGV-2, Kali design: CareMemories).
// Every memory with its trust, importance and validity; filter by trust or see
// the archive. Verify is one tap from the list. Archived memories can be
// restored, or deleted for good by an admin (with a confirmation).

import { router } from "expo-router";
import { Archive, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { deleteMemory, listMemories, updateMemory, verifyMemory } from "../../../src/api/memories";
import { useSession } from "../../../src/caregiver/session";
import type { Memory, Trust } from "../../../src/types";
import { categoryIcon } from "../../../src/ui/icons";
import { Banner, Btn, Card, Chips, Confirm, EmptyState, GradientBox, IconBtn, KaliTip, Loading, Pill, Row, Screen, TopBar, TrustBadge, Txt } from "../../../src/ui/kit";
import { TRUST_ORDER, categoryHue, categoryLabel, importanceLabel, memoryTitle, trustLabel, validityLabel } from "../../../src/ui/labels";
import { useToast } from "../../../src/ui/toast";
import { kc } from "../../../src/ui/tokens";
import { saveError, useHub } from "../../../src/ui/useHub";

type Filter = Trust | "all" | "archived";

export default function CareMemories() {
  const { can } = useSession();
  const toast = useToast();
  const memories = useHub(() => listMemories(), "care-memories");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<Memory | null>(null);

  const all = memories.data ?? [];
  const active = all.filter((m) => m.validity !== "archived");
  const list = filter === "archived" ? all.filter((m) => m.validity === "archived") : active.filter((m) => filter === "all" || m.trust === filter);

  async function act(m: Memory, run: () => Promise<unknown>, done: string) {
    setBusy(m.id);
    try {
      await run();
      toast(done);
      await memories.reload();
    } catch (e) {
      toast(saveError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Screen
        care
        onRefresh={memories.reload}
        header={
          <TopBar
            title="Memory Records"
            sub={memories.data ? `${active.length} active Â· ${all.length - active.length} archived` : undefined}
            right={can("create") ? <Btn size="md" icon={Plus} label="Add" onPress={() => router.push({ pathname: "/care/memories/[id]", params: { id: "new" } })} /> : null}
          />
        }
      >
        <Chips
          scroll
          value={filter}
          onChange={setFilter}
          options={[
            { v: "all" as Filter, l: "All" },
            ...TRUST_ORDER.map((tr) => ({ v: tr as Filter, l: trustLabel[tr].short })),
            { v: "archived" as Filter, l: "Archived", icon: Archive },
          ]}
        />
        {memories.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text="Can't reach the hub. Showing saved records; changes need the hub." /> : null}
        {memories.loading && !memories.data ? <Loading /> : null}
        {memories.error && !memories.data ? <EmptyState title="Records aren't available" body={memories.error} /> : null}

        <View style={{ marginTop: 12, gap: 8 }}>
          {list.map((m) => {
            const archived = m.validity === "archived";
            return (
              <Card
                key={m.id}
                onPress={archived ? undefined : () => router.push({ pathname: "/care/memories/[id]", params: { id: m.id } })}
                label={memoryTitle(m)}
                style={{ padding: 12 }}
              >
                <Row style={{ alignItems: "flex-start" }}>
                  <GradientBox colors={archived ? ["#F1F5F9", "#E2E8F0"] : categoryHue[m.category]} icon={categoryIcon[m.category]} size={48} rounded={14} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={16} weight="extra" color={kc.navy} numberOfLines={2}>
                      {memoryTitle(m)}
                    </Txt>
                    <Txt size={12} weight="semi" muted>
                      {categoryLabel[m.category].en} Â· {m.source === "patient" ? "Added by the patient" : m.source === "ai_suggested" ? "Suggested" : "Caregiver"} Â· {m.updated_at.slice(0, 10)}
                    </Txt>
                    {archived ? (
                      <Row gap={8} style={{ marginTop: 8 }}>
                        {can("update") ? <Btn size="md" variant="soft" icon={RotateCcw} label="Restore" loading={busy === m.id} onPress={() => act(m, () => updateMemory(m.id, { validity: "persistent" }), "Memory restored")} /> : null}
                        {can("delete") ? <IconBtn icon={Trash2} tone="danger" label="Delete permanently" onPress={() => setDel(m)} /> : null}
                      </Row>
                    ) : (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        <TrustBadge trust={m.trust} short />
                        <Pill
                          label={importanceLabel[m.importance]}
                          bg={m.importance === "critical" ? kc.red : m.importance === "important" ? kc.sun : kc.sky}
                          fg={m.importance === "critical" ? kc.white : kc.navy}
                        />
                        <Pill label={validityLabel[m.validity]} bg={kc.slateBg} fg={kc.slate} />
                      </View>
                    )}
                  </View>
                  {!archived && m.trust === "unverified" && can("update") ? (
                    <Btn size="md" variant="warm" icon={ShieldCheck} label="Verify" loading={busy === m.id} onPress={() => act(m, () => verifyMemory(m.id), "Marked as verified")} />
                  ) : null}
                </Row>
              </Card>
            );
          })}
          {memories.data && list.length === 0 ? (
            <KaliTip pose="peek">{filter === "archived" ? "Nothing archived. Archived memories appear here and can be restored." : "No records match this filter."}</KaliTip>
          ) : null}
        </View>
      </Screen>
      <Confirm
        open={!!del}
        danger
        title="Delete permanently?"
        body={`â€œ${del ? memoryTitle(del) : ""}â€ will be removed from the hub. This cannot be undone.`}
        confirmLabel="Delete forever"
        busy={!!del && busy === del.id}
        onCancel={() => setDel(null)}
        onConfirm={() => del && act(del, () => deleteMemory(del.id), "Memory deleted").then(() => setDel(null))}
      />
    </>
  );
}
