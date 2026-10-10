// EchoVault mobile — games and trivia settings (CGV-7, Kali design: CareGames).
// Topics, difficulty, how often a question may appear, and quiet hours, saved
// to the hub (GET/PUT /settings). History shows what was played or skipped,
// never a score: this is not a clinical assessment.

import { router } from "expo-router";
import { Activity as ActivityIcon, Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { getDashboard } from "../../src/api/dashboard";
import { getSettings, updateSettings } from "../../src/api/settings";
import { parseTime } from "../../src/caregiver/forms";
import { useSession } from "../../src/caregiver/session";
import type { Difficulty, GameTopic } from "../../src/types";
import { Banner, Btn, Card, Chips, EmptyState, Field, Input, Loading, Overline, Row, Screen, Segmented, TopBar, Txt } from "../../src/ui/kit";
import { useToast } from "../../src/ui/toast";
import { kc } from "../../src/ui/tokens";
import { saveError, useHub } from "../../src/ui/useHub";

const TOPICS: { v: GameTopic; l: string }[] = [
  { v: "family_names", l: "Family names" },
  { v: "relationships", l: "Relationships" },
  { v: "routines", l: "Daily routines" },
  { v: "familiar_places", l: "Familiar places" },
  { v: "recent_events", l: "Recent events" },
];

const ACTIVITY_NAMES: Record<string, string> = {
  family_matching: "Family Matching",
  name_recall: "Who Is This?",
  event_recall: "Special Days",
  routine_recall: "My Day",
  picture_matching: "Picture Matching",
  memory_quiz: "About Me",
  trivia_prompt: "Daily Question",
};

export default function Activities() {
  const { can } = useSession();
  const toast = useToast();
  const settings = useHub(getSettings, "settings");
  const dash = useHub(getDashboard, "care-dashboard");
  const [topics, setTopics] = useState<GameTopic[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [frequency, setFrequency] = useState("120");
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setTopics(s.game_topics);
    setDifficulty(s.game_difficulty);
    setFrequency(String(s.trivia_frequency_min));
    setQuietStart(s.quiet_hours.start);
    setQuietEnd(s.quiet_hours.end);
  }, [settings.data]);

  async function save() {
    const start = parseTime(quietStart);
    const end = parseTime(quietEnd);
    if (!start || !end) return setError("Quiet hours must be times like 9:00 PM or 21:00.");
    setBusy(true);
    setError(null);
    try {
      await updateSettings({ game_topics: topics, game_difficulty: difficulty, trivia_frequency_min: Number(frequency), quiet_hours: { start, end } });
      toast("Settings saved");
      await settings.reload();
    } catch (e) {
      setError(saveError(e));
    } finally {
      setBusy(false);
    }
  }

  const editable = can("update");
  const summary = dash.data?.activity_summary ?? [];
  return (
    <Screen care header={<TopBar title="Games & Trivia" onBack={() => router.back()} />}>
      {settings.loading && !settings.data ? <Loading /> : null}
      {settings.error && !settings.data ? <EmptyState title="Settings aren't available" body={settings.error} /> : null}
      {settings.data ? (
        <View style={{ gap: 16 }}>
          <Field label="Familiar topics (games and questions use only these)">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {TOPICS.map((tp) => {
                const on = topics.includes(tp.v);
                return (
                  <Pressable
                    key={tp.v}
                    disabled={!editable}
                    onPress={() => setTopics(on ? topics.filter((x) => x !== tp.v) : [...topics, tp.v])}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: on ? kc.navy : kc.white }}
                  >
                    <Txt size={15} weight="bold" color={on ? kc.white : kc.navy} fixed>
                      {tp.l}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label="Difficulty">
            <Segmented value={String(difficulty)} onChange={(v) => editable && setDifficulty(Number(v) as Difficulty)} options={[{ v: "1", l: "Gentle" }, { v: "2", l: "A bit more" }, { v: "3", l: "More" }]} />
          </Field>
          <Field label="A question may appear at most every">
            <Chips value={frequency} onChange={(v) => editable && setFrequency(v)} options={[{ v: "60", l: "1 hour" }, { v: "120", l: "2 hours" }, { v: "240", l: "4 hours" }, { v: "480", l: "8 hours" }]} />
          </Field>
          <Field label="Quiet hours (no games or questions)">
            <Row gap={8}>
              <Input value={quietStart} onChangeText={setQuietStart} editable={editable} placeholder="21:00" style={{ flex: 1 }} />
              <Txt weight="bold">to</Txt>
              <Input value={quietEnd} onChangeText={setQuietEnd} editable={editable} placeholder="07:00" style={{ flex: 1 }} />
            </Row>
          </Field>
          {error ? <Banner tone="error" text={error} /> : null}
          {editable ? <Btn icon={Check} label="Save settings" loading={busy} onPress={save} /> : <Banner text="Your access is view-only." />}
        </View>
      ) : null}

      <Overline>Activity history</Overline>
      <Card style={{ gap: 8 }}>
        {summary.length ? (
          summary.map((r) => (
            <Row key={`${r.activity}-${r.topic}`}>
              <ActivityIcon size={16} color={kc.primary} />
              <Txt size={15} style={{ flex: 1 }}>
                {ACTIVITY_NAMES[r.activity] ?? r.activity}
                {r.topic ? ` · ${r.topic.replace(/_/g, " ")}` : ""}
              </Txt>
              <Txt size={14} muted>
                {r.played_count} played · {r.skipped_count} skipped
              </Txt>
            </Row>
          ))
        ) : (
          <Txt size={15} muted>
            {dash.error ?? "Nothing played yet."}
          </Txt>
        )}
        <Txt size={12} muted>
          Shows participation only — not a measure of memory and not a clinical assessment.
        </Txt>
      </Card>
    </Screen>
  );
}
