// EchoVault mobile — this phone's display preferences (design: Settings screen).
//
// Language, text size, read-aloud, microphone and high contrast. They start from
// the hub's patient profile (language, font_scale, voice_enabled), which the
// caregiver sets; once someone changes them on this phone, the phone's choice is
// kept (saved in AsyncStorage) and the hub profile no longer overrides it.

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Patient } from "../types";
import type { Lang } from "./labels";
import { TEXT_ZOOM, textSizeFromScale, type TextSize } from "./tokens";

export interface Prefs {
  lang: Lang;
  textSize: TextSize;
  readAloud: boolean;
  voice: boolean;
  highContrast: boolean;
  /** True once someone changed a preference on this phone. */
  custom: boolean;
}

const KEY = "ev.prefs";
const DEFAULTS: Prefs = { lang: "en", textSize: "lg", readAloud: true, voice: true, highContrast: false, custom: false };

interface PrefsState {
  prefs: Prefs;
  /** Text multiplier for the chosen size. */
  zoom: number;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  /** Take defaults from the hub profile, unless this phone already has its own choices. */
  seedFromProfile: (profile: Partial<Patient>) => void;
}

const PrefsContext = createContext<PrefsState>({
  prefs: DEFAULTS,
  zoom: TEXT_ZOOM[DEFAULTS.textSize],
  setPref: () => {},
  seedFromProfile: () => {},
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setPrefs((p) => ({ ...p, ...(JSON.parse(raw) as Partial<Prefs>) }));
      })
      .catch(() => {});
  }, []);

  const save = (next: Prefs) => {
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  };

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => save({ ...p, [key]: value, custom: true }));
  }, []);

  const seedFromProfile = useCallback((profile: Partial<Patient>) => {
    setPrefs((p) => {
      if (p.custom || !profile.full_name) return p;
      return save({
        ...p,
        lang: profile.language === "fil" ? "fil" : "en",
        textSize: textSizeFromScale(profile.font_scale),
        readAloud: profile.voice_enabled !== 0,
        voice: profile.voice_enabled !== 0,
      });
    });
  }, []);

  const value = useMemo(
    () => ({ prefs, zoom: TEXT_ZOOM[prefs.textSize], setPref, seedFromProfile }),
    [prefs, setPref, seedFromProfile],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsState {
  return useContext(PrefsContext);
}

/** The current language, for t(lang, en, fil). */
export function useLang(): Lang {
  return useContext(PrefsContext).prefs.lang;
}
