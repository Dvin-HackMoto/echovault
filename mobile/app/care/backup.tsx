// EchoVault mobile — backup and restore (CGV-8, Kali design: Privacy › backup).
// Export downloads the hub's zip (database + photos) to this phone and opens the
// share sheet so it can be saved to Files, Drive or another phone. Import (admin
// only) replaces everything on the hub, so it asks first.

import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { HardDriveDownload, HardDriveUpload } from "lucide-react-native";
import { useState } from "react";
import { Platform, View } from "react-native";

import { exportBackupUrl, importBackup } from "../../src/api/backup";
import { ApiError, roleHeaders, type UploadFile } from "../../src/api/client";
import { todayIso } from "../../src/caregiver/forms";
import { useSession } from "../../src/caregiver/session";
import { Banner, Btn, Card, Confirm, KaliTip, Screen, TopBar, Txt } from "../../src/ui/kit";
import { useToast } from "../../src/ui/toast";
import { saveError } from "../../src/ui/useHub";

export default function Backup() {
  const { can } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [picked, setPicked] = useState<UploadFile | null>(null);

  async function exportNow() {
    setBusy("export");
    setResult(null);
    try {
      const url = await exportBackupUrl();
      const name = `echovault-backup-${todayIso()}.zip`;
      if (Platform.OS === "web") {
        // the browser downloads it itself (headers can't ride on a link, so this needs the hub's own page)
        setResult({ tone: "error", text: "Export works from the phone app. On the web, open the hub's /backup/export while signed in." });
        return;
      }
      const file = await File.downloadFileAsync(url, new File(Paths.document, name), { headers: await roleHeaders(), idempotent: true });
      setResult({ tone: "success", text: `Backup saved on this phone as ${name}.` });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/zip", dialogTitle: "Save the EchoVault backup" });
      }
    } catch (e) {
      setResult({ tone: "error", text: e instanceof ApiError ? saveError(e) : "The backup could not be downloaded. Check the hub connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile() {
    setResult(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/zip", "application/x-zip-compressed"], copyToCacheDirectory: true }).catch(() => null);
    if (!res || res.canceled || !res.assets.length) return;
    const asset = res.assets[0];
    setPicked({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/zip" });
  }

  async function importNow() {
    if (!picked) return;
    setBusy("import");
    try {
      const done = await importBackup(picked);
      setResult({ tone: "success", text: done?.detail || "Backup restored. Everything on the hub now matches the backup." });
      toast("Backup restored");
    } catch (e) {
      setResult({ tone: "error", text: saveError(e) });
    } finally {
      setBusy(null);
      setPicked(null);
    }
  }

  return (
    <>
      <Screen care header={<TopBar title="Backup & restore" onBack={() => router.back()} />}>
        <KaliTip pose="hug" tone="sky">
          The family's memories stay on your devices. A backup is one file with every record and photo from the hub.
        </KaliTip>
        <Card style={{ marginTop: 16, gap: 10 }}>
          <Txt size={17} weight="extra">
            Save a backup
          </Txt>
          <Txt size={14} muted>
            Downloads everything from the hub to this phone, then lets you keep it somewhere safe.
          </Txt>
          <Btn variant="soft" icon={HardDriveDownload} label="Create backup" loading={busy === "export"} disabled={!!busy || !can("export_backup")} onPress={exportNow} />
        </Card>
        <Card style={{ marginTop: 12, gap: 10 }}>
          <Txt size={17} weight="extra">
            Restore a backup
          </Txt>
          <Txt size={14} muted>
            Replaces everything on the hub with the backup. Changes made since then are lost.
          </Txt>
          {can("import_backup") ? (
            <Btn variant="ghost" icon={HardDriveUpload} label="Choose a backup file" loading={busy === "import"} disabled={!!busy} onPress={chooseFile} />
          ) : (
            <Banner text="Only an admin caregiver can restore a backup." />
          )}
        </Card>
        {result ? (
          <View style={{ marginTop: 12 }}>
            <Banner tone={result.tone} text={result.text} />
          </View>
        ) : null}
      </Screen>
      <Confirm
        open={!!picked}
        danger
        title="Replace everything on the hub?"
        body={`Restoring “${picked?.name ?? ""}” replaces every memory, person, schedule item, medicine and photo on the hub. This cannot be undone.`}
        confirmLabel="Restore"
        busy={busy === "import"}
        onCancel={() => setPicked(null)}
        onConfirm={importNow}
      />
    </>
  );
}
