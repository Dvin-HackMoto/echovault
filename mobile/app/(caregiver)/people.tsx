// EchoVault mobile — caregiver people management (CGV-3).
//
// Lists everyone with the shared PersonCard (photos resolved from the hub via
// getHubUrl()), and an inline Add/Edit modal form with: name (required),
// nickname, relationship (required), notes (multiline) and an is_caregiver
// toggle. At most ONE person may be the caregiver — the hub clears the flag on
// everyone else when it is set on one. SQLite booleans are sent as 1 | 0.
//
// Photo: the caregiver picks from the camera (ImagePicker.launchCameraAsync) or
// gallery (ImagePicker.launchImageLibraryAsync); the picked asset becomes an
// UploadFile { uri, name, type } and is uploaded via uploadPersonPhoto(id,file)
// AFTER the person exists — on create we createPerson() first, then upload to
// the returned id. Verify sets trust='verified'; remove confirms then deletes.
// Every network call goes through src/api/* — never a raw fetch.
//
// Hub errors (validation, 403 for a viewer or a non-admin delete) are shown as
// the hub's message; buttons this caregiver may not use are hidden.

import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getHubUrl, photoUri, type UploadFile } from "../../src/api/client";
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
  uploadPersonPhoto,
  type PersonInput,
} from "../../src/api/people";
import BigButton from "../../src/components/BigButton";
import PersonCard from "../../src/components/PersonCard";
import type { Theme } from "../../src/theme";
import { useTheme } from "../../src/theme-context";
import type { Person } from "../../src/types";
import { useCaregiverGate } from "./_layout";

type Phase = "loading" | "error" | "ready";

/** A photo the caregiver picked but hasn't uploaded yet (local file URI). */
interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

export default function CaregiverPeople() {
  const theme = useTheme();
  const { leaveCaregiverMode, can } = useCaregiverGate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [people, setPeople] = useState<Person[]>([]);
  const [hubUrl, setHubUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-row busy state so one row's action doesn't disable the whole list.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline Add/Edit form. `editing` null => the form is closed.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const [url, rows] = await Promise.all([getHubUrl(), listPeople()]);
      setHubUrl(url);
      setPeople(rows);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load people.");
      setPhase("error");
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. after closing the form).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(person: Person) {
    setEditing(person);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  // Called by the form once a save succeeds — refresh and close.
  async function onSaved() {
    closeForm();
    await load();
  }

  async function onVerify(person: Person) {
    setBusyId(person.id);
    try {
      await updatePerson(person.id, { trust: "verified" });
      await load();
    } catch (err) {
      Alert.alert(
        "Couldn't verify",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function onDelete(person: Person) {
    Alert.alert(
      "Remove person",
      `Remove "${person.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyId(person.id);
            try {
              await deletePerson(person.id);
              await load();
            } catch (err) {
              Alert.alert(
                "Couldn't remove",
                err instanceof ApiError ? err.message : "Something went wrong.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          People
        </Text>

        {can("create") ? <BigButton label="Add person" onPress={openAdd} theme={theme} /> : null}

        {phase === "loading" ? (
          <View style={[styles.center, { padding: theme.spacing.xl }]}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : null}

        {phase === "error" ? (
          <View style={{ gap: theme.spacing.md, alignItems: "center", padding: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Can't load people
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body, textAlign: "center" }}>
              {error}
            </Text>
            <BigButton label="Try again" onPress={() => void load()} theme={theme} />
          </View>
        ) : null}

        {phase === "ready" && people.length === 0 ? (
          <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.body }}>
            No people yet. Use “Add person” to create one.
          </Text>
        ) : null}

        {phase === "ready" && people.length > 0
          ? people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                hubUrl={hubUrl}
                theme={theme}
                busy={busyId === person.id}
                onEdit={() => openEdit(person)}
                onVerify={() => void onVerify(person)}
                onDelete={() => onDelete(person)}
              />
            ))
          : null}

        <BigButton
          label="Leave caregiver mode"
          variant="danger"
          onPress={() => void leaveCaregiverMode()}
          theme={theme}
        />
      </ScrollView>

      {/* Inline Add/Edit form, presented as a modal over the list. */}
      <Modal visible={formOpen} animationType="slide" onRequestClose={closeForm}>
        <PersonForm
          theme={theme}
          editing={editing}
          hubUrl={hubUrl}
          people={people}
          onCancel={closeForm}
          onSaved={() => void onSaved()}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ──────────────────────────────── list row ────────────────────────────────

function PersonRow({
  person,
  hubUrl,
  theme,
  busy,
  onEdit,
  onVerify,
  onDelete,
}: {
  person: Person;
  hubUrl: string | null;
  theme: Theme;
  busy: boolean;
  onEdit: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  const { can } = useCaregiverGate();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <PersonCard person={person} hubUrl={hubUrl} theme={theme} />

      <View style={styles.badgeRow}>
        {person.is_caregiver ? (
          <Badge label="Caregiver" theme={theme} tone="primary" />
        ) : null}
        <Badge
          label={person.trust === "verified" ? "Verified" : "Unverified"}
          theme={theme}
          tone={person.trust === "verified" ? "success" : "muted"}
        />
      </View>

      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <View style={styles.actionRow}>
          {can("update") ? <ActionButton label="Edit" theme={theme} onPress={onEdit} /> : null}
          {person.trust !== "verified" && can("update") ? (
            <ActionButton label="Verify" theme={theme} onPress={onVerify} />
          ) : null}
          {can("delete") ? <ActionButton label="Remove" theme={theme} variant="danger" onPress={onDelete} /> : null}
        </View>
      )}
    </View>
  );
}

// ──────────────────────────── add / edit form ─────────────────────────────

function PersonForm({
  theme,
  editing,
  hubUrl,
  people,
  onCancel,
  onSaved,
}: {
  theme: Theme;
  editing: Person | null;
  hubUrl: string | null;
  people: Person[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === null;

  const [name, setName] = useState(editing?.name ?? "");
  const [nickname, setNickname] = useState(editing?.nickname ?? "");
  const [relationship, setRelationship] = useState(editing?.relationship ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [isCaregiver, setIsCaregiver] = useState<boolean>(Boolean(editing?.is_caregiver));
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset local state whenever the form is reused for a different person.
  useEffect(() => {
    setName(editing?.name ?? "");
    setNickname(editing?.nickname ?? "");
    setRelationship(editing?.relationship ?? "");
    setNotes(editing?.notes ?? "");
    setIsCaregiver(Boolean(editing?.is_caregiver));
    setPhoto(null);
  }, [editing]);

  // Build an UploadFile from a picked asset: derive name/type from the asset,
  // defaulting the MIME type to image/jpeg when the picker doesn't report one.
  function assetToPhoto(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
    const type = asset.mimeType ?? "image/jpeg";
    const fallbackExt = type.split("/")[1] ?? "jpg";
    const name = asset.fileName ?? `photo-${Date.now()}.${fallbackExt}`;
    return { uri: asset.uri, name, type };
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera needs permission", "Allow camera access to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(assetToPhoto(result.assets[0]));
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos need permission", "Allow photo access to pick an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(assetToPhoto(result.assets[0]));
    }
  }

  async function onSave() {
    const trimmedName = name.trim();
    const trimmedRelationship = relationship.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter this person's name.");
      return;
    }
    if (!trimmedRelationship) {
      Alert.alert("Relationship required", "Please enter how they're related.");
      return;
    }

    // SQLite boolean goes over the wire as 1 | 0.
    const input: PersonInput = {
      name: trimmedName,
      nickname: emptyToNull(nickname),
      relationship: trimmedRelationship,
      notes: emptyToNull(notes),
      is_caregiver: isCaregiver ? 1 : 0,
    };

    setSaving(true);
    try {
      // "At most one caregiver" is enforced by the hub: setting is_caregiver on
      // this person clears it on everyone else.
      // Create first so the photo can be uploaded to the returned id; edit
      // updates in place against the existing id.
      let personId: string;
      if (isNew) {
        const created = await createPerson(input);
        personId = created.id;
      } else {
        const updated = await updatePerson(editing!.id, input);
        personId = updated.id;
      }

      // Upload the photo AFTER the person exists (multipart via src/api).
      if (photo) {
        const file: UploadFile = { uri: photo.uri, name: photo.name, type: photo.type };
        await uploadPersonPhoto(personId, file);
      }

      onSaved();
    } catch (err) {
      Alert.alert(
        "Couldn't save",
        err instanceof ApiError ? err.message : "Something went wrong.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Preview: a freshly picked local photo wins; otherwise fall back to the
  // existing stored photo resolved via the hub URL.
  const previewUri = photo?.uri ?? photoUri(hubUrl, editing?.photo_url, editing?.photo_path);
  const avatarSize = theme.touchTargets.large;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.heading, fontWeight: "800" }}>
          {isNew ? "Add person" : "Edit person"}
        </Text>

        {/* Photo picker + preview. */}
        <Field label="Photo" theme={theme}>
          <View style={styles.photoRow}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                accessibilityIgnoresInvertColors
                style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
              />
            ) : (
              <View
                style={[
                  styles.photoPlaceholder,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>No photo</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: theme.spacing.sm, marginLeft: theme.spacing.md }}>
              <ActionButton label="Camera" theme={theme} onPress={() => void pickFromCamera()} />
              <ActionButton label="Gallery" theme={theme} onPress={() => void pickFromGallery()} />
            </View>
          </View>
        </Field>

        {/* Name (required). */}
        <Field label="Name" theme={theme}>
          <Input value={name} onChangeText={setName} placeholder="Full name" editable={!saving} theme={theme} />
        </Field>

        {/* Nickname (optional). */}
        <Field label="Nickname (optional)" theme={theme}>
          <Input
            value={nickname}
            onChangeText={setNickname}
            placeholder="What they're called"
            editable={!saving}
            theme={theme}
          />
        </Field>

        {/* Relationship (required). */}
        <Field label="Relationship" theme={theme}>
          <Input
            value={relationship}
            onChangeText={setRelationship}
            placeholder="e.g. Daughter, Doctor, Neighbor"
            editable={!saving}
            theme={theme}
          />
        </Field>

        {/* Notes (optional, multiline). */}
        <Field label="Notes (optional)" theme={theme}>
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything helpful to remember"
            editable={!saving}
            theme={theme}
            multiline
          />
        </Field>

        {/* is_caregiver toggle — at most one person across the list. */}
        <View style={[styles.toggleRow, { gap: theme.spacing.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
              Mark as caregiver
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: theme.fontSizes.caption }}>
              Only one person can be the caregiver. Turning this on removes it from anyone else.
            </Text>
          </View>
          <Switch
            value={isCaregiver}
            onValueChange={setIsCaregiver}
            disabled={saving}
            accessibilityLabel="Mark as caregiver"
          />
        </View>

        <BigButton
          label={saving ? "Saving…" : isNew ? "Create person" : "Save changes"}
          onPress={() => void onSave()}
          loading={saving}
          theme={theme}
        />
        <BigButton label="Cancel" variant="danger" onPress={onCancel} disabled={saving} theme={theme} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ──────────────────────────── small components ────────────────────────────

function Field({
  label,
  theme,
  children,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text style={{ color: theme.colors.fg, fontSize: theme.fontSizes.title, fontWeight: "700" }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  editable,
  theme,
  multiline = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  editable: boolean;
  theme: Theme;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.muted}
      editable={editable}
      multiline={multiline}
      style={[
        styles.input,
        {
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          fontSize: theme.fontSizes.body,
          color: theme.colors.fg,
          minHeight: multiline ? theme.touchTargets.large : theme.touchTargets.min,
          textAlignVertical: multiline ? "top" : "center",
        },
      ]}
    />
  );
}

function ActionButton({
  label,
  theme,
  onPress,
  variant = "primary",
}: {
  label: string;
  theme: Theme;
  onPress: () => void;
  variant?: "primary" | "danger";
}) {
  const bg = variant === "danger" ? theme.colors.danger : theme.colors.primary;
  const fg = variant === "danger" ? theme.colors.onDanger : theme.colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.touchTargets.min,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.button, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Badge({
  label,
  theme,
  tone,
}: {
  label: string;
  theme: Theme;
  tone: "primary" | "success" | "muted";
}) {
  const bg =
    tone === "primary" ? theme.colors.primary : tone === "success" ? theme.colors.success : theme.colors.border;
  const fg = tone === "muted" ? theme.colors.fg : theme.colors.onPrimary;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: theme.radii.pill,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
      }}
    >
      <Text style={{ color: fg, fontSize: theme.fontSizes.caption, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────── helpers ────────────────────────────────

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  input: { borderWidth: 1 },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
