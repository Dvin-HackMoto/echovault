// EchoVault mobile — theme context.
// Loads the patient's font_scale lazily (fallback 1.4) and exposes the scaled
// theme to the tree. Kept out of src/theme.ts so that module stays React-free
// and importable from src/api.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getPatient } from "./api/settings";
import { ApiError } from "./api/client";
import { DEFAULT_FONT_SCALE, makeTheme, type Theme } from "./theme";

interface ThemeContextValue {
  theme: Theme;
  /** Re-apply a font scale (e.g. after the caregiver changes it). */
  setFontScale: (scale: number) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: makeTheme(DEFAULT_FONT_SCALE),
  setFontScale: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScale] = useState<number>(DEFAULT_FONT_SCALE);

  useEffect(() => {
    let cancelled = false;
    // Best-effort: if the hub isn't set/reachable yet, keep the 1.4 default.
    getPatient()
      .then((patient) => {
        if (cancelled) return;
        const scale = (patient as { font_scale?: number }).font_scale;
        if (typeof scale === "number" && scale > 0) {
          setFontScale(scale);
        }
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiError)) {
          // Unexpected error — swallow it, the default theme still works.
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: makeTheme(fontScale), setFontScale }),
    [fontScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the current scaled theme. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** Access the full theme context (theme + setFontScale). */
export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}
