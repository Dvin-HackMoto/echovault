// EchoVault mobile — Kali design tokens (from the frontend/ design: Tailwind theme in
// frontend/src/index.css). Plain module, no React, so logic files can import it.

export const APP_NAME = "EchoVault";
/** The elephant companion and the assistant's name ("Ask Kali"). */
export const COMPANION = "Kali";
export const CARE_NAME = `${APP_NAME} Care`;
export const TAGLINE = "Bawat alaala, mahalaga.";

export const kc = {
  primary: "#729AC9",
  navy: "#243B60",
  sky: "#EAF3FC",
  skyDeep: "#CFE0F3",
  blush: "#F7D7D9",
  cream: "#FFF8EB",
  sun: "#F7C96B",
  ink: "#25324A",
  white: "#FFFFFF",
  bgTop: "#EEF4FB",
  bgBottom: "#F8FAFD",
  careBg: "#F5F9FE",
  green: "#25704A",
  greenBg: "#E3F1EA",
  greenMid: "#86BFA0",
  red: "#9B2C2C",
  redBg: "#FBE4E4",
  amber: "#8A5A00",
  slate: "#475569",
  slateBg: "#F1F5F9",
  lilac: "#4B3B7A",
  lilacBg: "#EEE8F7",
  demo: "#6B3FA0",
  demoBg: "#F1EAFB",
} as const;

/** ink at an opacity, like Tailwind's text-ink/60. Floors at .62 so body text stays readable. */
export function ink(alpha: number): string {
  return `rgba(37,50,74,${Math.max(alpha, 0.62)})`;
}

/** navy at an opacity (for borders, rings, faint icons). */
export function navy(alpha: number): string {
  return `rgba(36,59,96,${alpha})`;
}

export const radius = { sm: 12, md: 16, lg: 24, xl: 28, pill: 999 } as const;

export const fonts = {
  regular: "Nunito_400Regular",
  semi: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extra: "Nunito_800ExtraBold",
  black: "Nunito_900Black",
} as const;

export type Weight = keyof typeof fonts;

/** Soft card shadow (shadow-[0_4px_20px_-10px_rgba(36,59,96,.25)]). */
export const cardShadow = {
  shadowColor: kc.navy,
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/** Pastel gradient pairs used for avatars and memory tiles. */
export const PALETTES: [string, string][] = [
  ["#F7D7D9", "#E9A6AC"],
  ["#EAF3FC", "#729AC9"],
  ["#FFF8EB", "#F7C96B"],
  ["#E3F1EA", "#86BFA0"],
  ["#EEE8F7", "#A897CF"],
];

/** A stable palette for a record id, so a person keeps their colors. */
export function paletteFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/** Text sizes the patient can pick (design: A / A+ / A++). */
export type TextSize = "md" | "lg" | "xl";
export const TEXT_ZOOM: Record<TextSize, number> = { md: 1, lg: 1.12, xl: 1.24 };

/** The hub's patient.font_scale (default 1.4) as one of the three text sizes. */
export function textSizeFromScale(scale: number | null | undefined): TextSize {
  if (!scale || scale <= 1.2) return "md";
  if (scale <= 1.45) return "lg";
  return "xl";
}
