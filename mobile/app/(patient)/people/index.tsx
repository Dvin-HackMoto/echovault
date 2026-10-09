// EchoVault mobile — My Family (PAT-5, Kali design: Family).
// Verified people only, as a photo grid; tap for details.

import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { photoUri } from "../../../src/api/client";
import { listPeople } from "../../../src/api/people";
import { usePatient } from "../../../src/patient/context";
import { Avatar, Banner, DemoNote, EmptyState, KaliTip, Loading, Screen, TopBar, Txt } from "../../../src/ui/kit";
import { t } from "../../../src/ui/labels";
import { useLang } from "../../../src/ui/prefs";
import { cardShadow, kc, paletteFor } from "../../../src/ui/tokens";
import { useHub } from "../../../src/ui/useHub";

export default function Family() {
  const L = useLang();
  const { hubUrl } = usePatient();
  // the hub only gives the patient verified people; the filter is a second guard
  const people = useHub(() => listPeople("verified").then((ps) => ps.filter((p) => p.trust === "verified")), "people");

  return (
    <Screen
      header={<TopBar title={t(L, "My Family", "Aking Pamilya")} sub={t(L, "People who care about you", "Mga taong nagmamahal sa iyo")} onBack={() => router.back()} />}
      onRefresh={people.reload}
    >
      <DemoNote feature="people" />
      <KaliTip pose="photo" tone="sky">
        {t(L, "Tap a person to see more about them.", "I-tap ang isang tao para makita pa.")}
      </KaliTip>
      {people.fromCache ? <Banner tone="warning" style={{ marginTop: 12 }} text={t(L, "Can't reach the hub. These may not be up to date.", "Hindi maabot ang hub.")} /> : null}
      {people.loading && !people.data ? <Loading /> : null}
      {people.error && !people.data ? <EmptyState title={t(L, "Family isn't available", "Hindi makuha ang pamilya")} body={people.error} /> : null}
      {people.data && people.data.length === 0 ? (
        <EmptyState pose="hug" title={t(L, "No one added yet", "Wala pang naidagdag")} body={t(L, "Your family can add people from the caregiver app.", "Maaaring magdagdag ang pamilya.")} />
      ) : null}
      <View style={styles.grid}>
        {(people.data ?? []).map((p) => {
          const shown = p.nickname || p.name;
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: "/people/[id]", params: { id: p.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${shown}, your ${p.relationship}`}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={{ aspectRatio: 1, width: "100%" }}>
                <Avatar fill name={p.name} colors={paletteFor(p.id)} uri={photoUri(hubUrl, p.photo_url, p.photo_path)} size={130} rounded={18} />
              </View>
              <Txt size={19} weight="extra" color={kc.navy} style={{ marginTop: 10 }} numberOfLines={1}>
                {shown}
              </Txt>
              <Txt size={16} weight="semi" muted numberOfLines={1}>
                {t(L, `Your ${p.relationship}`, `Iyong ${p.relationship}`)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  card: { width: "48%", flexGrow: 1, maxWidth: "50%", backgroundColor: kc.white, borderRadius: 24, padding: 12, alignItems: "flex-start", ...cardShadow },
});
