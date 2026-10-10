// EchoVault mobile — design tokens.
//
// Goals (PRODUCT accessibility): large text, high contrast, big touch targets.
// This is a plain module with NO React dependency so both `src/api` and the
// components can import it. Font sizes scale by the patient's `font_scale`
// (schema default 1.4) via `fontSizes()` / `makeTheme()`.

/**
 * High-contrast color tokens. Foreground/background pairs are chosen to clear
 * the WCAG AA 4.5:1 contrast ratio for body text:
 *   - fg (#1A1A1A) on bg (#FFFFFF)              ≈ 17.4:1
 *   - onPrimary (#FFFFFF) on primary (#1B4F9C)  ≈  7.0:1
 *   - onDanger (#FFFFFF) on danger (#B00020)    ≈  7.4:1
 * Full WCAG conformance still needs manual testing with assistive tech.
 */
export const colors = {
  bg: "#FFFFFF",
  fg: "#1A1A1A",
  card: "#F4F6FA",
  border: "#C4CAD3",
  muted: "#4A4A4A",
  primary: "#1B4F9C",
  onPrimary: "#FFFFFF",
  danger: "#B00020",
  onDanger: "#FFFFFF",
  success: "#1E6B2E",
  // Calm secondary buttons and soft status backgrounds (Module 14 patient screens).
  // Each fg/bg pair below clears 4.5:1.
  secondary: "#E3ECF7",
  onSecondary: "#0B3A73",
  successBg: "#E6F4EA",
  warning: "#7A4A00",
  warningBg: "#FFF4D6",
  /** Schedule items that already happened. */
  past: "#5B6470",
} as const;

export type ColorToken = keyof typeof colors;

/** Base spacing scale (points). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Corner radii. */
export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Large touch targets. Minimum 56px clears the common 48px a11y guidance with
 * headroom for older users; `comfortable` is used for the big primary actions.
 */
export const touchTargets = {
  min: 56,
  comfortable: 64,
  large: 72,
} as const;

/** Base (unscaled) font sizes, before `font_scale` is applied. */
export const baseFontSizes = {
  caption: 14,
  body: 18,
  button: 20,
  title: 26,
  heading: 32,
  display: 40,
} as const;

export type FontSizeToken = keyof typeof baseFontSizes;

/** Default patient font scale, matching the `patient.font_scale` schema default. */
export const DEFAULT_FONT_SCALE = 1.4;

/** Scale a single base size by the patient's font scale, rounded to a whole point. */
export function scaleFont(base: number, fontScale: number = DEFAULT_FONT_SCALE): number {
  return Math.round(base * fontScale);
}

export type FontSizes = Record<FontSizeToken, number>;

/** Build the full font-size map scaled by `font_scale` (default 1.4). */
export function fontSizes(fontScale: number = DEFAULT_FONT_SCALE): FontSizes {
  const out = {} as FontSizes;
  (Object.keys(baseFontSizes) as FontSizeToken[]).forEach((token) => {
    out[token] = scaleFont(baseFontSizes[token], fontScale);
  });
  return out;
}

export interface Theme {
  fontScale: number;
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  touchTargets: typeof touchTargets;
  fontSizes: FontSizes;
}

/**
 * Build a theme for a given font scale. Components read `theme.fontSizes`
 * (already scaled) so they never multiply by hand. Defaults to 1.4.
 */
export function makeTheme(fontScale: number = DEFAULT_FONT_SCALE): Theme {
  return {
    fontScale,
    colors,
    spacing,
    radii,
    touchTargets,
    fontSizes: fontSizes(fontScale),
  };
}

/** The default theme at the schema's 1.4 font scale. */
export const theme: Theme = makeTheme(DEFAULT_FONT_SCALE);
