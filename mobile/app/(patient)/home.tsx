// EchoVault mobile — patient home (the full screen is built in Module 14).
// The reminder banner is live: it shows the schedule reminder due now, read
// from the phone's cache so it keeps working while the hub is off.
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Placeholder from "../../src/components/Placeholder";
import { ReminderBanner } from "../../src/components/ReminderBanner";
import { offline } from "../../src/offline";

export default function PatientHome() {
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={["top"]} style={{ paddingHorizontal: 16 }}>
        <ReminderBanner reminders={offline.reminders} />
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        <Placeholder title="Home" module="Module 14" />
      </View>
    </View>
  );
}
