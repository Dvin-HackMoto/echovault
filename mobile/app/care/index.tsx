// EchoVault mobile — caregiver overview (CGV-6, Kali design: CareDash).
// Built from GET /dashboard: memories to review, conflicts, outdated memories,
// doses that need attention, flagged answers, and engagement as played vs
// skipped (never a score). Each item links to where it can be fixed.

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Activity as ActivityIcon, ChevronRight, Flag, LogOut, Pill as PillIcon } from "lucide-react-native";
import { View } from "react-native";

import { getDashboard } from "../../src/api/dashboard";
import { todaySchedule } from "../../src/api/schedule";
import { getPatient } from "../../src/api/settings";
import { useSession } from "../../src/caregiver/session";
import { isForDay, timeState } from "../../src/patient/logic";
import { clockLabel } from "../../src/time";
import type { Memory } from "../../src/types";
import { categoryIcon, kindIcon } from "../../src/ui/icons";
import { Banner, Btn, Card, EmptyState, HubChip, IconBox, KaliTip, Loading, Overline, Row, Screen, TrustBadge, Txt, initials } from "../../src/ui/kit";
import { memoryTitle } from "../../src/ui/labels";
import { CARE_NAME, kc, navy } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

const ACTIVITY_NAMES: Record<string, string> = {
  family_matching: "Family Matching",
  name_recall: "Who Is This?",
  event_recall: "Special Days",
  routine_recall: "My Day",
  picture_matching: "Picture Matching",
  memory_quiz: "About Me",
  trivia_prompt: "Daily Question",
};

function Stat({ n, label, bg }: { n: number | string; label: string; bg: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 16, backgroundColor: bg, padding: 12 }}>
      <Txt size={24} weight="black" color={kc.navy} fixed>
        {n}
      </Txt>
      <Txt size={13} weight="bold" muted fixed>
        {label}
      </Txt>
    </View>
  );
}

function ReviewRow({ m }: { m: Memory }) {
  const Icon = categoryIcon[m.category];
  return (
    <Card onPress={() => router.push({ pathname: "/care/memories/[id]", params: { id: m.id } })} label={memoryTitle(m)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <IconBox icon={Icon} size={42} />
      <View style={{ flex: 1, gap: 4 }}>
        <Txt size={16} weight="extra" color={kc.navy} numberOfLines={1}>
          {memoryTitle(m)}
        </Txt>
        <TrustBadge trust={m.trust} short />
      </View>
      <ChevronRight size={18} color={navy(0.4)} />
    </Card>
  );
}

export default function CareDash() {
  const { caregiver, signOut } = useSession();
  const dash = useHub(getDashboard, "care-dashboard");
  const patient = useHub(getPatient, "profile");
  const today = useHub(todaySchedule, "schedule-today");

  const d = dash.data;
  const review = d ? [...d.conflicting_pairs, ...d.unverified_memories] : [];
  const played = d ? d.activity_summary.reduce((n, r) => n + r.played_count, 0) : 0;
  const items = today.data && isForDay(today.data, new Date()) ? today.data : [];
  const fullName = (patient.data as { full_name?: string } | null)?.full_name;

  async function refresh() {
    await Promise.all([dash.reload(), patient.reload(), today.reload()]);
  }

  return (
    <Screen care onRefresh={refresh} contentStyle={{ paddingTop: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Txt size={13} weight="black" color={kc.primary} style={{ letterSpacing: 1, textTransform: "uppercase" }} fixed>
            {CARE_NAME}
          </Txt>
          <Txt size={24} weight="black" color={kc.navy} numberOfLines={1}>
            Hello, {caregiver.name.split(" ")[0]}
          </Txt>
        </View>
        <Btn variant="ghost" size="md" icon={LogOut} label="Patient app" onPress={signOut} />
      </Row>

      <LinearGradient colors={[kc.navy, "#34507D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginTop: 16, borderRadius: 24, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: kc.blush, alignItems: "center", justifyContent: "center" }}>
          <Txt size={20} weight="black" color={kc.navy} fixed>
            {fullName ? initials(fullName) : "?"}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={18} weight="extra" color={kc.white} numberOfLines={1}>
            {fullName ?? "Patient profile not set"}
          </Txt>
          <Txt size={14} color="rgba(255,255,255,.75)">
            Signed in as {caregiver.access_level}
          </Txt>
        </View>
        <HubChip />
      </LinearGradient>

      {dash.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text="Can't reach the hub. Showing the last saved overview." /> : null}
      {dash.loading && !d ? <Loading /> : null}
      {dash.error && !d ? <EmptyState title="The overview isn't available" body={dash.error} /> : null}

      {d ? (
        <>
          <Row gap={8} style={{ marginTop: 12, alignItems: "stretch" }}>
            <Stat n={review.length} label="Need review" bg={kc.cream} />
            <Stat n={d.medication_attention.length} label="Doses to check" bg="rgba(247,215,217,.6)" />
            <Stat n={played} label="Activities played" bg={kc.sky} />
          </Row>

          <Overline>Needs your review</Overline>
          {review.length ? (
            <View style={{ gap: 8 }}>
              {review.slice(0, 6).map((m) => (
                <ReviewRow key={m.id} m={m} />
              ))}
              {review.length > 6 ? <Btn variant="soft" size="md" label={`See all ${review.length}`} onPress={() => router.push("/care/memories")} /> : null}
            </View>
          ) : (
            <KaliTip pose="happy" tone="sky">
              All records are verified. Nice work!
            </KaliTip>
          )}

          {d.outdated_memories.length ? (
            <>
              <Overline>Recently outdated</Overline>
              <View style={{ gap: 8 }}>
                {d.outdated_memories.slice(0, 3).map((m) => (
                  <ReviewRow key={m.id} m={m} />
                ))}
              </View>
            </>
          ) : null}

          {d.medication_attention.length ? (
            <>
              <Overline>Doses that need attention</Overline>
              <Card style={{ padding: 8 }}>
                {d.medication_attention.slice(0, 5).map((l, i) => (
                  <Row key={l.id} style={{ padding: 8, borderTopWidth: i ? 1 : 0, borderTopColor: navy(0.05) }}>
                    <PillIcon size={20} color={kc.primary} />
                    <View style={{ flex: 1 }}>
                      <Txt size={16} weight="bold">
                        {l.medication_name} · {l.medication_dose}
                      </Txt>
                      <Txt size={13} muted>
                        {l.due_at.slice(0, 10)} {clockLabel(l.due_at)} · {l.status === "skipped" ? "Skipped" : "No answer"}
                      </Txt>
                    </View>
                  </Row>
                ))}
                <Btn variant="soft" size="md" label="Review doses" style={{ margin: 8 }} onPress={() => router.push({ pathname: "/care/schedule", params: { tab: "meds" } })} />
              </Card>
            </>
          ) : null}

          {d.flagged_answers.length ? (
            <>
              <Overline>Answers flagged as wrong</Overline>
              <Card style={{ padding: 12, gap: 10 }}>
                {d.flagged_answers.slice(0, 4).map((a) => (
                  <Row key={a.id} style={{ alignItems: "flex-start" }}>
                    <Flag size={18} color={kc.red} />
                    <View style={{ flex: 1 }}>
                      <Txt size={15} weight="bold">
                        “{a.question}”
                      </Txt>
                      <Txt size={14} muted numberOfLines={2}>
                        {a.answer}
                      </Txt>
                    </View>
                  </Row>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <Overline>Today's schedule</Overline>
      <Card style={{ padding: 8 }}>
        {items.length ? (
          items.map((a, i) => {
            const Icon = kindIcon[a.kind];
            const state = timeState(a, new Date());
            return (
              <Row key={a.id + a.occurrence_at} style={{ padding: 8, borderTopWidth: i ? 1 : 0, borderTopColor: navy(0.05) }}>
                <Icon size={20} color={kc.primary} />
                <Txt size={14} weight="bold" muted style={{ width: 76 }} fixed>
                  {clockLabel(a.occurrence_at)}
                </Txt>
                <Txt size={16} weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                  {a.title}
                </Txt>
                <Txt size={12} weight="bold" muted fixed>
                  {state === "past" ? "Done" : state === "now" ? "Now" : "Later"}
                </Txt>
              </Row>
            );
          })
        ) : (
          <Txt size={15} muted style={{ padding: 8 }}>
            {today.error ?? "Nothing planned today."}
          </Txt>
        )}
      </Card>

      {d?.activity_summary.length ? (
        <>
          <Overline>Engagement</Overline>
          <Card style={{ padding: 12, gap: 8 }}>
            {d.activity_summary.map((r) => (
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
            ))}
            <Txt size={12} muted>
              Engagement is shown for care planning only — it is not a clinical score.
            </Txt>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
