// EchoVault mobile — hub connection (replaces the design's simulated "Nearby
// Sync": phones share data through the family's hub on the home Wi-Fi).
// Shows the address, whether it answers, the data mode, and which parts still
// use demo data because their hub module is not merged yet.

import { router } from "expo-router";
import { CloudOff, RefreshCw, Server } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { checkHealth, getDataMode, getHubUrl, setDataMode, type DataMode } from "../../src/api/client";
import { Banner, Btn, Card, HubChip, Overline, Row, Screen, Segmented, TopBar, Txt, useDemoFeatures } from "../../src/ui/kit";
import { kc } from "../../src/ui/tokens";
import { useHub } from "../../src/ui/useHub";

export default function Hub() {
  const url = useHub(getHubUrl);
  const mode = useHub(getDataMode);
  const demo = useDemoFeatures();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<boolean | null>(null);

  async function test() {
    if (!url.data) return;
    setChecking(true);
    setStatus(await checkHealth(url.data));
    setChecking(false);
  }

  async function changeMode(next: DataMode) {
    await setDataMode(next);
    await mode.reload();
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
              {mode.data === "demo" ? "Using demo data only" : mode.data === "hub" ? "Hub only (never demo data)" : "Hub, with demo data for parts it doesn't have yet"}
            </Txt>
          </View>
          <HubChip />
        </Row>
        {status !== null ? <Banner tone={status ? "success" : "error"} text={status ? "The hub answered." : "The hub didn't answer. Check it's on and on the same Wi-Fi."} /> : null}
        {url.data ? <Btn variant="soft" size="md" icon={RefreshCw} label="Test connection" loading={checking} onPress={test} /> : null}
        <Btn variant="ghost" size="md" label="Change hub address" onPress={() => router.push({ pathname: "/", params: { setup: "1" } })} />
      </Card>

      {url.data ? (
        <>
          <Overline>Data</Overline>
          <Segmented value={mode.data === "hub" ? "hub" : "auto"} onChange={changeMode} options={[{ v: "auto", l: "Hub + demo" }, { v: "hub", l: "Hub only" }]} />
          <Txt size={13} muted style={{ marginTop: 6 }}>
            "Hub only" shows exactly what the hub has — use it to check the integration.
          </Txt>
        </>
      ) : null}

      {demo.length ? (
        <Banner tone="demo" style={{ marginTop: 16 }} text={`Still using demo data: ${demo.join(", ")}. These parts switch to the hub as soon as their modules are merged.`} />
      ) : null}
    </Screen>
  );
}
