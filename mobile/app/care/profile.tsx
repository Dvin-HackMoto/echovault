// EchoVault mobile — patient profile (SET-2: GET/PUT /patient).
// The caregiver sets the patient's name, what the family calls them, language,
// text size, voice and simplified (managed) mode. The patient phone uses these
// as its defaults until someone changes them on that phone.

import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";

import { getPatient, updatePatient } from "../../src/api/settings";
import { useSession } from "../../src/caregiver/session";
import type { Language, Patient } from "../../src/types";
import { Banner, Btn, Card, Chips, EmptyState, Field, Input, Loading, Screen, Toggle, TopBar } from "../../src/ui/kit";
import { useToast } from "../../src/ui/toast";
import { saveError, useHub } from "../../src/ui/useHub";

const SCALES = [
  { v: "1.2", l: "Large" },
  { v: "1.4", l: "Larger" },
  { v: "1.6", l: "Largest" },
];

export default function Profile() {
  const { can } = useSession();
  const toast = useToast();
  const profile = useHub(getPatient, "profile");
  const [fullName, setFullName] = useState("");
  const [preferred, setPreferred] = useState("");
  const [language, setLanguage] = useState<Language>("fil-en");
  const [scale, setScale] = useState("1.4");
  const [voice, setVoice] = useState(true);
  const [managed, setManaged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = profile.data as Partial<Patient> | null;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setPreferred(p.preferred_name ?? "");
    setLanguage(p.language ?? "fil-en");
    const s = p.font_scale ?? 1.4;
    setScale(s <= 1.3 ? "1.2" : s <= 1.5 ? "1.4" : "1.6");
    setVoice(p.voice_enabled !== 0);
    setManaged(p.managed_mode === 1);
  }, [profile.data]);

  async function save() {
    if (!fullName.trim()) return setError("The patient's full name is required.");
    setBusy(true);
    setError(null);
    try {
      await updatePatient({
        full_name: fullName.trim(),
        preferred_name: preferred.trim() || null,
        language,
        font_scale: Number(scale),
        voice_enabled: voice ? 1 : 0,
        managed_mode: managed ? 1 : 0,
      });
      toast("Profile saved");
      await profile.reload();
    } catch (e) {
      setError(saveError(e));
    } finally {
      setBusy(false);
    }
  }

  const editable = can("update");
  return (
    <Screen care header={<TopBar title="Patient profile" onBack={() => router.back()} />}>
      {profile.loading && !profile.data ? <Loading /> : null}
      {profile.error && !profile.data ? <EmptyState title="The profile isn't available" body={profile.error} /> : null}
      {profile.data ? (
        <Card style={{ gap: 16 }}>
          <Field label="Full name">
            <Input value={fullName} onChangeText={setFullName} editable={editable} placeholder="Maria Elena Santos" />
          </Field>
          <Field label="What the family calls them">
            <Input value={preferred} onChangeText={setPreferred} editable={editable} placeholder="Lola Nena" />
          </Field>
          <Field label="Language">
            <Chips value={language} onChange={(v) => editable && setLanguage(v)} options={[{ v: "fil-en" as Language, l: "Filipino + English" }, { v: "fil" as Language, l: "Filipino" }, { v: "en" as Language, l: "English" }]} />
          </Field>
          <Field label="Text size">
            <Chips value={scale} onChange={(v) => editable && setScale(v)} options={SCALES} />
          </Field>
          <Toggle on={voice} onChange={setVoice} disabled={!editable} label="Voice" desc="Microphone and reading answers aloud" />
          <Toggle on={managed} onChange={setManaged} disabled={!editable} label="Simplified mode" desc="Fewer choices on the patient's home screen" />
          {error ? <Banner tone="error" text={error} /> : null}
          {editable ? <Btn icon={Check} label="Save profile" loading={busy} onPress={save} /> : <Banner text="Your access is view-only." />}
        </Card>
      ) : null}
    </Screen>
  );
}
