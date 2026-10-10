// EchoVault mobile — choose a photo from the camera or the gallery (CGV-3, CGV-5),
// as a file part for the hub's photo upload routes (multipart field "photo").

import * as ImagePicker from "expo-image-picker";

import type { UploadFile } from "../api/client";

export type PhotoSource = "camera" | "library";

/** Returns the picked photo, or null if the caregiver cancelled or denied access. */
export async function pickPhoto(source: PhotoSource): Promise<UploadFile | null> {
  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType ?? "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `photo.${ext}`, type };
}
