// EchoVault mobile — caregiver schedule (CGV-4 + CGV-5, Kali design: CareSchedule).
// Routines & appointments, and medication, on one screen with a switch.
// ?tab=meds opens the medication side (from the overview's dose list).

import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import MedsPanel from "../../src/caregiver/MedsPanel";
import RoutinesPanel from "../../src/caregiver/RoutinesPanel";
import { DemoNote, Screen, Segmented, TopBar } from "../../src/ui/kit";

type Tab = "routine" | "meds";

export default function CareSchedule() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "meds" ? "meds" : "routine");

  useEffect(() => {
    if (params.tab === "meds") setTab("meds");
  }, [params.tab]);

  return (
    <Screen care header={<TopBar title="Schedule" sub="Routines, appointments, medication" />}>
      <DemoNote feature={["schedule", "medications"]} />
      <Segmented value={tab} onChange={setTab} options={[{ v: "routine", l: "Routines & Appts" }, { v: "meds", l: "Medication" }]} />
      {tab === "routine" ? <RoutinesPanel /> : <MedsPanel />}
    </Screen>
  );
}
