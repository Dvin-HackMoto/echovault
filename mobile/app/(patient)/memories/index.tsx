// EchoVault mobile â€” My Memories (Kali design: Memories).
// Verified, current memories with search and category chips. The patient can
// add a simple memory (title, text, category); it is saved as source=patient
// and stays unverified, so it only shows here once a caregiver verifies it
// (MEM-5). care_safety is caregiver-only, so it is not offered.

import { router } from "expo-router";
import { Check, Plus, Search, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { createMemory, listMemories } from "../../../src/api/memories";
import type { Category } from "../../../src/types";
import { categoryIcon } from "../../../src/ui/icons";
import { Banner, Btn, Chips, EmptyState, Field, Input, KaliTip, Loading, Screen, Sheet, TopBar, Txt } from "../../../src/ui/kit";
import { MemoryCard } from "../../../src/ui/MemoryCard";
import { CATEGORY_ORDER, categoryLabel, t } from "../../../src/ui/labels";
import { usePrefs } from "../../../src/ui/prefs";
import { useToast } from "../../../src/ui/toast";
import { fonts, kc, navy } from "../../../src/ui/tokens";
import { saveError, useHub } from "../../../src/ui/useHub";

const PATIENT_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "care_safety");

export default function Memories() {
  const { prefs, zoom } = usePrefs();
  const L = prefs.lang;
  const toast = useToast();
  const memories = useHub(() => listMemories({ trust: "verified" }), "memories-verified");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [draft, setDraft] = useState<{ title: string; content: string; category: Category } | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (memories.data ?? [])
      .filter((m) => m.trust === "verified" && m.validity !== "archived")
      .filter((m) => cat === "all" || m.category === cat)
      .filter((m) => !needle || `${m.title ?? ""} ${m.content}`.toLowerCase().includes(needle));
  }, [memories.data, q, cat]);

  async function save() {
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    try {
      await createMemory({
        title: draft.title.trim(),
        content: draft.content.trim() || draft.title.trim(),
        category: draft.category,
        source: "patient",
      });
      setDraft(null);
      toast(t(L, "Memory saved. Your family will check it.", "Naka-save. Titingnan ito ng pamilya mo."));
    } catch (e) {
      toast(saveError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Screen header={<TopBar title={t(L, "My Memories", "Aking mga Alaala")} onBack={() => router.back()} />} onRefresh={memories.reload}>
        <Btn variant="warm" icon={Plus} label={t(L, "Add a memory", "Magdagdag ng alaala")} onPress={() => setDraft({ title: "", content: "", category: "history" })} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, borderRadius: 16, backgroundColor: kc.white, paddingHorizontal: 16 }}>
          <Search size={22} color={navy(0.4)} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t(L, "Search memories", "Maghanap ng alaala")}
            placeholderTextColor="rgba(37,50,74,.5)"
            accessibilityLabel={t(L, "Search memories", "Maghanap ng alaala")}
            style={{ flex: 1, fontFamily: fonts.semi, fontSize: Math.round(18 * zoom), color: kc.ink, minHeight: 52 }}
          />
          {q ? (
            <Pressable onPress={() => setQ("")} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={10}>
              <X size={22} color={kc.navy} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ marginTop: 12 }}>
          <Chips
            scroll
            value={cat}
            onChange={setCat}
            options={[{ v: "all" as const, l: t(L, "All", "Lahat") }, ...PATIENT_CATEGORIES.map((c) => ({ v: c, l: t(L, categoryLabel[c].en, categoryLabel[c].fil) }))]}
          />
        </View>
        {memories.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text={t(L, "Can't reach the hub. Showing saved memories.", "Hindi maabot ang hub. Naka-save na alaala ang ipinapakita.")} /> : null}
        <View style={{ marginTop: 16, gap: 12 }}>
          {memories.loading && !memories.data ? <Loading /> : null}
          {memories.error && !memories.data ? <EmptyState pose="peek" title={t(L, "Memories aren't available", "Hindi makuha ang alaala")} body={memories.error} /> : null}
          {list.map((m) => (
            <MemoryCard key={m.id} m={m} onPress={() => router.push({ pathname: "/memories/[id]", params: { id: m.id } })} />
          ))}
          {memories.data && list.length === 0 ? (
            <KaliTip pose="peek">{q || cat !== "all" ? t(L, "No memories match that yet. Try another word or category.", "Walang tugma. Subukan ang ibang salita.") : t(L, "No memories saved yet. Your family can add some.", "Wala pang alaala. Maaaring magdagdag ang pamilya.")}</KaliTip>
          ) : null}
        </View>
      </Screen>

      <Sheet open={!!draft} title={t(L, "Add a memory", "Magdagdag ng alaala")} onClose={() => setDraft(null)}>
        {draft ? (
          <>
            <KaliTip pose="reading" tone="sky">
              {t(L, "Tell me something you want to remember. Your family will check it later.", "Sabihin ang gusto mong tandaan. Titingnan ito ng pamilya mo.")}
            </KaliTip>
            <Field label={t(L, "What is it about?", "Tungkol saan ito?")}>
              <Input big autoFocus value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} placeholder={t(L, "e.g. Lunch with Ana", "hal. Tanghalian kasama si Ana")} />
            </Field>
            <Field label={t(L, "Tell me more (optional)", "Ikuwento pa (opsyonal)")}>
              <Input big multiline value={draft.content} onChangeText={(v) => setDraft({ ...draft, content: v })} />
            </Field>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PATIENT_CATEGORIES.map((c) => {
                const on = draft.category === c;
                const Icon = categoryIcon[c];
                return (
                  <Pressable
                    key={c}
                    onPress={() => setDraft({ ...draft, category: c })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={{ width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, borderRadius: 16, paddingHorizontal: 12, backgroundColor: on ? kc.navy : kc.sky }}
                  >
                    <Icon size={20} color={on ? kc.white : kc.navy} />
                    <Txt size={14} weight="bold" color={on ? kc.white : kc.navy} style={{ flex: 1 }} fixed>
                      {t(L, categoryLabel[c].en, categoryLabel[c].fil)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Btn icon={Check} label={t(L, "Save memory", "I-save")} disabled={!draft.title.trim()} loading={saving} onPress={save} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
