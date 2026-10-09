// EchoVault mobile — caregiver "More" (Kali design: CareMore).
// Settings and tools, plus who is signed in and what their access allows.

import { router } from "expo-router";
import { ChevronRight, HardDriveDownload, KeyRound, LogOut, Puzzle, Server, UserRound, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { useSession } from "../../src/caregiver/session";
import { Btn, Card, IconBox, KaliTip, Overline, Row, Screen, TopBar, Txt } from "../../src/ui/kit";
import { COMPANION, kc, navy } from "../../src/ui/tokens";

const ITEMS: { href: string; icon: LucideIcon; title: string; sub: string }[] = [
  { href: "/care/profile", icon: UserRound, title: "Patient profile", sub: "Name, language, text size, voice" },
  { href: "/care/activities", icon: Puzzle, title: "Games & trivia", sub: "Topics, difficulty, quiet hours, history" },
  { href: "/care/backup", icon: HardDriveDownload, title: "Backup & restore", sub: "Save or restore everything on the hub" },
  { href: "/care/hub", icon: Server, title: "Hub connection", sub: "Address, status, demo data" },
];

const ACCESS: Record<string, string> = {
  admin: "Can add, edit, verify and delete records, and restore backups.",
  editor: "Can add, edit and verify records. Only an admin can delete.",
  viewer: "Can look at everything, but not change it.",
};

export default function CareMore() {
  const { caregiver, signOut } = useSession();
  return (
    <Screen care header={<TopBar title="More" />}>
      <View style={{ gap: 8 }}>
        {ITEMS.map((i) => (
          <Card key={i.href} onPress={() => router.push(i.href as never)} label={i.title} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <IconBox icon={i.icon} size={48} />
            <View style={{ flex: 1 }}>
              <Txt size={17} weight="extra" color={kc.navy}>
                {i.title}
              </Txt>
              <Txt size={13} muted>
                {i.sub}
              </Txt>
            </View>
            <ChevronRight size={22} color={navy(0.4)} />
          </Card>
        ))}
      </View>

      <Overline>Signed in</Overline>
      <Card>
        <Row style={{ alignItems: "flex-start" }}>
          <IconBox icon={KeyRound} size={44} />
          <View style={{ flex: 1 }}>
            <Txt size={17} weight="extra" color={kc.navy}>
              {caregiver.name}
              {caregiver.relationship ? ` · ${caregiver.relationship}` : ""}
            </Txt>
            <Txt size={14} weight="bold" color={kc.primary} style={{ textTransform: "capitalize" }}>
              {caregiver.access_level}
            </Txt>
            <Txt size={14} muted>
              {ACCESS[caregiver.access_level]}
            </Txt>
          </View>
        </Row>
      </Card>

      <View style={{ marginTop: 16 }}>
        <KaliTip pose="idea">Tip: verify new records soon so {COMPANION} can share them confidently.</KaliTip>
      </View>
      <Btn variant="ghost" icon={LogOut} label="Sign out (back to the patient app)" style={{ marginTop: 16 }} onPress={signOut} />
    </Screen>
  );
}
