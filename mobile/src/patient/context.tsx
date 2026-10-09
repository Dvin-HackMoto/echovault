// EchoVault mobile — patient mode state (Module 14).
// Profile and settings for every patient screen: name, simplified mode, voice,
// trivia frequency, and the hub address for photos. Loaded when patient mode
// opens (cached for offline). The profile's font_scale is pushed into the
// foundation ThemeProvider, so useTheme() sizes follow the caregiver's setting.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getHubUrl } from "../api/client";
import { getPatient, getSettings } from "../api/settings";
import { useThemeContext } from "../theme-context";
import type { Patient, SettingsValues } from "../types";
import { withCache } from "./cached";

type Profile = Partial<Patient>;

interface PatientState {
  profile: Profile;
  settings: Partial<SettingsValues>;
  /** What the app calls the patient. */
  name: string;
  /** Caregiver-managed: fewer options on screen. */
  managedMode: boolean;
  voiceEnabled: boolean;
  /** Saved hub address, for photo URLs (null in demo mode). */
  hubUrl: string | null;
  /** Trivia waits while a dose card is up. */
  medicationCardOpen: boolean;
  setMedicationCardOpen: (open: boolean) => void;
  reload: () => Promise<void>;
}

const PatientContext = createContext<PatientState | null>(null);

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { setFontScale } = useThemeContext();
  const [profile, setProfile] = useState<Profile>({});
  const [settings, setSettings] = useState<Partial<SettingsValues>>({});
  const [hubUrl, setHubUrlState] = useState<string | null>(null);
  const [medicationCardOpen, setMedicationCardOpen] = useState(false);

  const reload = useCallback(async () => {
    // a missing profile or settings endpoint must not block the app: use defaults
    const [p, s, hub] = await Promise.allSettled([
      withCache("profile", getPatient),
      withCache("settings", getSettings),
      getHubUrl(),
    ]);
    if (p.status === "fulfilled") {
      const loaded = (p.value.data ?? {}) as Profile;
      setProfile(loaded);
      if (typeof loaded.font_scale === "number" && loaded.font_scale > 0) setFontScale(loaded.font_scale);
    }
    if (s.status === "fulfilled") setSettings(s.value.data ?? {});
    if (hub.status === "fulfilled") setHubUrlState(hub.value);
  }, [setFontScale]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<PatientState>(
    () => ({
      profile,
      settings,
      name: profile.preferred_name || profile.full_name || "",
      managedMode: profile.managed_mode === 1,
      voiceEnabled: profile.voice_enabled !== 0,
      hubUrl,
      medicationCardOpen,
      setMedicationCardOpen,
      reload,
    }),
    [profile, settings, hubUrl, medicationCardOpen, reload],
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatient(): PatientState {
  const value = useContext(PatientContext);
  if (!value) throw new Error("usePatient must be used inside PatientProvider");
  return value;
}
