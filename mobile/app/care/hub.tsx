// EchoVault mobile — hub connection (replaces the design's simulated "Nearby
// Sync": phones share data through the family's hub on the home Wi-Fi).
// Shows the saved address and whether it answers. Every screen reads its data
// from the hub; there is no demo/offline data source.

import { router } from "expo-router";
import { CloudOff, RefreshCw, Server } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { checkHealth, getHubUrl } from "../../src/api/client";
import { Banner, Btn, Card, HubChip, Overline, Row, Screen, TopBar, Txt } from "../../src/ui/kit";
import { kc } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

export default function Hub() {
  const url = useHub(getHubUrl);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<boolean | null>(null);

  async function test() {
    if (!url.data) return;
    setChecking(true);
    setStatus(await checkHealth(url.data));
    setChecking(false);
  }

  return (
    <Screen care header={<TopBar title="Hub connection" sub="Phones share data through the family's hub" onBack={() => router.back()} />}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: kc.sky }}>
        <CloudOff size={22} color={kc.navy} />
        <Txt size={14} weight="semi" style={{ flex: 1 }}>
          No cloud. The hub is a laptop at home; both phones talk to it over the home Wi-Fi or a hotspot.
        </Txt>
      </Card>

      <Overline>This phone</Overline>
      <Card style={{ gap: 10 }}>
        <Row>
          <Server size={22} color={kc.primary} />
          <View style={{ flex: 1 }}>
            <Txt size={16} weight="bold">
              {url.data ?? "No hub address saved"}
            </Txt>
            <Txt size={13} muted>
              Every screen reads from the hub.
            </Txt>
          </View>
          <HubChip />
        </Row>
        {status !== null ? <Banner tone={status ? "success" : "error"} text={status ? "The hub answered." : "The hub didn't answer. Check it's on and on the same Wi-Fi."} /> : null}
        {url.data ? <Btn variant="soft" size="md" icon={RefreshCw} label="Test connection" loading={checking} onPress={test} /> : null}
        <Btn variant="ghost" size="md" label="Change hub address" onPress={() => router.push({ pathname: "/", params: { setup: "1" } })} />
      </Card>
    </Screen>
  );
}
