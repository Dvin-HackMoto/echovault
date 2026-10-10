// EchoVault mobile — caregiver backup / restore (CGV-8, REAL backend).
//
// Export (GET /backup/export): src/api/backup.exportBackupRequest() gives the
// URL and the caregiver's role headers; the zip is streamed to the app's
// document directory with expo-file-system, then offered through the OS share
// sheet with expo-sharing so the caregiver can file it somewhere safe.
//
// Import (POST /backup/import): pick a .zip with expo-document-picker, confirm
// with an explicit "this REPLACES current data" Alert, then upload the file via
// src/api/backup.importBackup(file, true). Import is ADMIN ONLY: the backend
// wraps it in require_admin, so we read the caregiver's access_level
// (GET /auth/me) and disable + explain the control for non-admins; a 403 from
// the server is surfaced the same way. If /auth/me fails (hub unreachable) the
// import stays closed.

import * as DocumentPicker from "expo-document-picker";
// SDK 57 moved documentDirectory / downloadAsync to the legacy entry point (as in src/platform.ts)
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { me } from "../../src/api/auth";
import { exportBackupRequest, importBackup } from "../../src/api/backup";
import { ApiError, type UploadFile } from "../../src/api/client";
import BigButton from "../../src/components/BigButton";
import { useTheme } from "../../src/theme-context";

type AdminState = "checking" | "admin" | "not-admin";

export default function CaregiverBackup() {
  const theme = useTheme();

  // Admin gating for import. Unknown (error) is treated as not-admin.
  const [adminState, setAdminState] = useState<AdminState>("checking");

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  const checkAdmin = useCallback(async () => {
    setAdminState("checking");
    try {
      const caregiver = await me();
      setAdminState(caregiver?.access_level === "admin" ? "admin" : "not-admin");
    } catch {
      // we cannot confirm admin (e.g. hub unreachable), so gate the import closed
      setAdminState("not-admin");
    }
  }, []);

  useEffect(() => {
    void checkAdmin();
  }, [checkAdmin]);

  // ─────────────────────────────── export ───────────────────────────────

  async function onExport() {
    setExportErr(null);
    setExportMsg(null);
    setExporting(true);
    try {
      const { url, headers } = await exportBackupRequest();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = `${FileSystem.documentDirectory}echovault-backup-${stamp}.zip`;

      // the hub only exports to a signed-in caregiver, so send the role headers
      const result = await FileSystem.downloadAsync(url, target, { headers });
      if (result.status < 200 || result.status >= 300) {
        setExportErr(`The hub returned ${result.status} while exporting.`);
        return;
      }

      setExportMsg(`Saved to ${result.uri}`);

      // Offer the file through the OS share sheet so the caregiver can store it.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/zip",
          dialogTitle: "Save EchoVault backup",
        });
      } else {
        setExportMsg(`Saved to ${result.uri} (sharing isn't available on this device).`);
      }
    } catch (err) {
      setExportErr(err instanceof ApiError ? err.message : "Couldn't export the backup.");
    } finally {
      setExporting(false);
    }
  }

  // ─────────────────────────────── import ───────────────────────────────

  async function onImport() {
    setImportErr(null);
    setImportMsg(null);

    // Pick a .zip. The picker may be cancelled.
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      });
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : "Couldn't open the file picker.");
      return;
    }

    if (picked.canceled || picked.assets.length === 0) {
      return; // user backed out — nothing to report
    }

    const asset = picked.assets[0];

    // Explicit, unmistakable confirmation that this REPLACES current data.
    Alert.alert(
      "Replace all data?",
      `Restoring "${asset.name}" will REPLACE the hub's current memories, people, ` +
        "schedule, medications and photos with the contents of this backup. This " +
        "cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace data",
          style: "destructive",
          onPress: () => void runImport(asset),
        },
      ],
      { cancelable: true },
    );
  }

  async function runImport(asset: DocumentPicker.DocumentPickerAsset) {
    setImporting(true);
    setImportErr(null);
    setImportMsg(null);
    try {
      const file: UploadFile = {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "application/zip",
      };
      const result = await importBackup(file, true);
      setImportMsg(result.detail || "Backup restored.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Server-side admin gate — mirror it in the UI.
        setAdminState("not-admin");
        setImportErr("Importing a backup needs an admin caregiver.");
      } else {
        setImportErr(err instanceof ApiError ? err.message : "Couldn't restore the backup.");
      }
    } finally {
      setImporting(false);
    }
  }

  const importDisabled = importing || adminState !== "admin";

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          Backup
        </Text>

        {/* ───────────────────────────── Export ──────────────────────────── */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Export a backup
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            Download a copy of everything on the hub (database and photos) as a
            single zip, then save it somewhere safe.
          </Text>
          <BigButton
            label={exporting ? "Exporting…" : "Export backup"}
            onPress={() => void onExport()}
            loading={exporting}
            theme={theme}
          />
          {exportErr ? (
            <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>{exportErr}</Text>
          ) : null}
          {exportMsg ? (
            <Text style={{ color: theme.colors.success, fontSize: theme.fontSizes.body }}>{exportMsg}</Text>
          ) : null}
        </View>

        {/* ───────────────────────────── Import ──────────────────────────── */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
            Restore from a backup
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            Pick a backup zip to restore. This REPLACES the hub's current data —
            you'll be asked to confirm first.
          </Text>

          {adminState === "checking" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
                Checking your access…
              </Text>
            </View>
          ) : null}

          {adminState === "not-admin" ? (
            <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>
              Importing a backup needs an admin caregiver. Sign in as an admin to
              restore data.
            </Text>
          ) : null}

          <BigButton
            label={importing ? "Restoring…" : "Choose backup to restore"}
            onPress={() => void onImport()}
            loading={importing}
            disabled={importDisabled}
            variant="danger"
            theme={theme}
          />
          {importErr ? (
            <Text style={{ color: theme.colors.danger, fontSize: theme.fontSizes.body }}>{importErr}</Text>
          ) : null}
          {importMsg ? (
            <Text style={{ color: theme.colors.success, fontSize: theme.fontSizes.body }}>{importMsg}</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
