// EchoVault mobile — the Kali component kit (React Native port of frontend/src/ui.tsx
// and frontend/src/forms.tsx). Every screen builds from these so the look stays one
// system: Nunito type, soft pastel cards, large touch targets (48px+).

import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  Archive,
  ChevronLeft,
  type LucideIcon,
  ShieldCheck,
  ShieldQuestion,
  WifiOff,
  Wifi,
  X,
} from "lucide-react-native";
import React, { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { reachStore } from "../api/client";
import type { Trust } from "../types";
import { kali, type KaliPose } from "./kali";
import { trustLabel, t } from "./labels";
import { usePrefs } from "./prefs";
import { cardShadow, fonts, ink, kc, navy, radius, type Weight } from "./tokens";

// ─────────────────────────────────── text ───────────────────────────────────

export interface TxtProps extends TextProps {
  size?: number;
  weight?: Weight;
  color?: string;
  /** Secondary text: ink at reduced opacity (full strength in high contrast). */
  muted?: boolean;
  /** Skip the patient's text-size zoom (tight layouts like tab labels). */
  fixed?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Txt({ size = 17, weight = "semi", color, muted, fixed, center, style, ...rest }: TxtProps) {
  const { zoom, prefs } = usePrefs();
  const scaled = fixed ? size : Math.round(size * zoom);
  const tone = color ?? (muted ? (prefs.highContrast ? kc.ink : ink(0.68)) : kc.ink);
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: fonts[weight], fontSize: scaled, lineHeight: Math.round(scaled * 1.3), color: tone },
        center ? { textAlign: "center" } : null,
        style,
      ]}
    />
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt size={24} weight="black" color={kc.navy} accessibilityRole="header" style={style}>
      {children}
    </Txt>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt size={19} weight="black" color={kc.navy} accessibilityRole="header" style={[{ marginTop: 22, marginBottom: 10 }, style]}>
      {children}
    </Txt>
  );
}

/** Small uppercase heading (caregiver lists). */
export function Overline({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt size={13} weight="black" muted style={[{ textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 8 }, style]}>
      {children}
    </Txt>
  );
}

// ────────────────────────────────── layout ──────────────────────────────────

/** The soft sky gradient every screen sits on. */
export function Backdrop({ children, care }: { children: ReactNode; care?: boolean }) {
  return (
    <LinearGradient colors={care ? [kc.careBg, kc.bgBottom] : [kc.bgTop, kc.bgBottom]} style={{ flex: 1 }}>
      {children}
    </LinearGradient>
  );
}

export interface ScreenProps {
  children: ReactNode;
  /** Pull to refresh. */
  onRefresh?: () => Promise<unknown> | void;
  /** Header shown above the scrolling area (TopBar). */
  header?: ReactNode;
  /** Extra space under the content, for the tab bar. Default leaves room for it. */
  bottomSpace?: number;
  care?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, onRefresh, header, bottomSpace = 130, care, contentStyle }: ScreenProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return (
    <Backdrop care={care}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {header}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: bottomSpace }, contentStyle]}
          refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={kc.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </Backdrop>
  );
}

export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  const { prefs } = usePrefs();
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ChevronLeft size={26} color={kc.navy} />
          <Txt size={16} weight="extra" color={kc.navy} fixed>
            {t(prefs.lang, "Back", "Bumalik")}
          </Txt>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={23} weight="black" color={kc.navy} numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {sub ? (
          <Txt size={14} muted numberOfLines={2}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Row({ children, gap = 12, style, ...rest }: ViewProps & { gap?: number }) {
  return (
    <View {...rest} style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>
      {children}
    </View>
  );
}

// ────────────────────────────────── buttons ─────────────────────────────────

export type BtnVariant = "primary" | "navy" | "soft" | "ghost" | "warm" | "danger" | "success";

const BTN: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: kc.primary, fg: kc.white },
  navy: { bg: kc.navy, fg: kc.white },
  soft: { bg: kc.sky, fg: kc.navy },
  ghost: { bg: kc.white, fg: kc.navy, border: navy(0.12) },
  warm: { bg: kc.sun, fg: kc.navy },
  danger: { bg: kc.redBg, fg: kc.red },
  success: { bg: kc.green, fg: kc.white },
};

export interface BtnProps {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: BtnVariant;
  size?: "lg" | "md";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  hint?: string;
}

export function Btn({ label, onPress, icon: Icon, variant = "primary", size = "lg", disabled, loading, style, hint }: BtnProps) {
  const look = BTN[variant];
  const lg = size === "lg";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.btn,
        {
          minHeight: lg ? 58 : 48,
          paddingHorizontal: lg ? 22 : 16,
          backgroundColor: look.bg,
          borderWidth: look.border ? 1 : 0,
          borderColor: look.border,
          opacity: disabled ? 0.45 : 1,
        },
        variant === "primary" || variant === "navy" ? styles.btnShadow : null,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={look.fg} /> : Icon ? <Icon size={lg ? 22 : 19} color={look.fg} strokeWidth={2.4} /> : null}
      <Txt size={lg ? 18 : 16} weight="extra" color={look.fg} center>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Square icon button (edit, archive, close...). */
export function IconBtn({ icon: Icon, label, onPress, tone = "soft", size = 46 }: { icon: LucideIcon; label: string; onPress: () => void; tone?: "soft" | "white" | "danger"; size?: number }) {
  const bg = tone === "white" ? kc.white : tone === "danger" ? kc.redBg : kc.sky;
  const fg = tone === "danger" ? kc.red : kc.navy;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center" },
        tone === "white" ? [cardShadow, { borderWidth: 1, borderColor: navy(0.05) }] : null,
        pressed && styles.pressed,
      ]}
    >
      <Icon size={Math.round(size * 0.46)} color={fg} />
    </Pressable>
  );
}

// ─────────────────────────────────── cards ──────────────────────────────────

export function Card({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, style, pressed && styles.pressedSoft]}
    >
      {children}
    </Pressable>
  );
}

/** Rounded square holding an icon (tile chips, list leading icons). */
export function IconBox({ icon: Icon, bg = kc.sky, fg = kc.navy, size = 48, iconSize }: { icon: LucideIcon; bg?: string; fg?: string; size?: number; iconSize?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={iconSize ?? Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

/** Gradient square with an icon (memory tiles). */
export function GradientBox({ colors, icon: Icon, size = 80, iconSize, rounded = 18, style }: { colors: [string, string]; icon: LucideIcon; size?: number | "100%"; iconSize?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ width: size, height: size === "100%" ? undefined : size, borderRadius: rounded, alignItems: "center", justifyContent: "center" }, style]}
    >
      <Icon size={iconSize ?? (typeof size === "number" ? Math.round(size * 0.36) : 64)} color={kc.navy} />
    </LinearGradient>
  );
}

// ─────────────────────────────────── badges ─────────────────────────────────

const TRUST: Record<Trust, { bg: string; fg: string; icon: LucideIcon }> = {
  verified: { bg: kc.greenBg, fg: kc.green, icon: ShieldCheck },
  unverified: { bg: kc.cream, fg: kc.amber, icon: ShieldQuestion },
  conflicting: { bg: kc.redBg, fg: kc.red, icon: AlertTriangle },
  outdated: { bg: kc.slateBg, fg: kc.slate, icon: Archive },
};

export function TrustBadge({ trust, short }: { trust: Trust; short?: boolean }) {
  const look = TRUST[trust];
  const { prefs } = usePrefs();
  const label = short ? trustLabel[trust].short : t(prefs.lang, trustLabel[trust].long, trustLabel[trust].fil);
  return <Pill bg={look.bg} fg={look.fg} icon={look.icon} label={label} />;
}

export function Pill({ label, bg = kc.sky, fg = kc.navy, icon: Icon }: { label: string; bg?: string; fg?: string; icon?: LucideIcon }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {Icon ? <Icon size={15} color={fg} /> : null}
      <Txt size={13} weight="bold" color={fg} fixed>
        {label}
      </Txt>
    </View>
  );
}

// ─────────────────────────────────── people ─────────────────────────────────

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** A person's photo, or their initials on a pastel gradient. */
export function Avatar({ name, colors, uri, size = 64, rounded, fill }: { name: string; colors: [string, string]; uri?: string | null; size?: number; rounded?: number; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const r = rounded ?? size * 0.28;
  // fill: take the parent's whole box (photo grids); size then only sets the initials
  const box = fill ? { width: "100%" as const, height: "100%" as const } : { width: size, height: size };
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityLabel={`Photo of ${name}`}
        style={{ ...box, borderRadius: r, backgroundColor: kc.sky, borderWidth: fill ? 0 : 3, borderColor: kc.white }}
      />
    );
  }
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ ...box, borderRadius: r, alignItems: "center", justifyContent: "center", borderWidth: fill ? 0 : 3, borderColor: kc.white }}
    >
      <Txt size={Math.round(size * 0.34)} weight="black" color={navy(0.8)} fixed>
        {initials(name)}
      </Txt>
    </LinearGradient>
  );
}

// ─────────────────────────────────── Kali ───────────────────────────────────

const TIP_BG = { cream: kc.cream, sky: kc.sky, blush: "rgba(247,215,217,.6)" } as const;

export function KaliTip({ pose = "idea", children, tone = "cream" }: { pose?: KaliPose; children: ReactNode; tone?: keyof typeof TIP_BG }) {
  return (
    <View style={[styles.tip, { backgroundColor: TIP_BG[tone] }]}>
      <Image source={kali[pose]} style={{ width: 62, height: 62 }} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={{ flex: 1 }}>
        {typeof children === "string" ? (
          <Txt size={16} weight="semi">
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function KaliImage({ pose, size = 160, style }: { pose: KaliPose | ImageSourcePropType; size?: number; style?: StyleProp<ViewStyle> }) {
  const source = typeof pose === "string" ? kali[pose] : pose;
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** Centered Kali with a message, for loading failures and empty lists. */
export function EmptyState({ pose = "peek", title, body, action }: { pose?: KaliPose; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 24, gap: 6 }}>
      <KaliImage pose={pose} size={140} />
      <Txt size={21} weight="black" color={kc.navy} center>
        {title}
      </Txt>
      {body ? (
        <Txt size={16} muted center>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: 12, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
      <ActivityIndicator size="large" color={kc.primary} />
      {label ? <Txt muted>{label}</Txt> : null}
    </View>
  );
}

// ──────────────────────────────── notices ───────────────────────────────────

export type BannerTone = "info" | "warning" | "demo" | "error" | "success";
const BANNER: Record<BannerTone, { bg: string; fg: string }> = {
  info: { bg: kc.sky, fg: kc.navy },
  warning: { bg: kc.cream, fg: kc.amber },
  demo: { bg: kc.demoBg, fg: kc.demo },
  error: { bg: kc.redBg, fg: kc.red },
  success: { bg: kc.greenBg, fg: kc.green },
};

export function Banner({ text, tone = "info", style }: { text: string; tone?: BannerTone; style?: StyleProp<ViewStyle> }) {
  const look = BANNER[tone];
  return (
    <View accessibilityRole="text" style={[{ backgroundColor: look.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }, style]}>
      <Txt size={15} weight="bold" color={look.fg}>
        {text}
      </Txt>
    </View>
  );
}

/** Connection chip: whether the hub answered the last request. */
export function HubChip() {
  const reachable = useSyncExternalStore(reachStore.subscribe, reachStore.getSnapshot, reachStore.getSnapshot);
  const { prefs } = usePrefs();
  if (reachable === false) return <Pill icon={WifiOff} bg={kc.cream} fg={kc.amber} label={t(prefs.lang, "Offline", "Offline")} />;
  return <Pill icon={Wifi} bg={kc.greenBg} fg={kc.green} label={t(prefs.lang, "Connected", "Konektado")} />;
}

// ───────────────────────────────── controls ─────────────────────────────────

export function Toggle({ on, onChange, label, desc, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      style={[{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 8 }, disabled && { opacity: 0.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Txt size={17} weight="bold">
          {label}
        </Txt>
        {desc ? (
          <Txt size={14} muted>
            {desc}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: on ? kc.primary : "#CBD5E1" }]}>
        <View style={[styles.knob, { left: on ? 28 : 4 }]} />
      </View>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            <Txt size={15} weight="extra" color={on ? kc.navy : navy(0.65)} center fixed>
              {o.l}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A wrapping row of choice chips (enum pickers in forms). */
export function Chips<T extends string>({ value, options, onChange, scroll }: { value: T; options: { v: T; l: string; icon?: LucideIcon }[]; onChange: (v: T) => void; scroll?: boolean }) {
  const items = options.map((o) => {
    const on = o.v === value;
    return (
      <Pressable
        key={o.v}
        onPress={() => onChange(o.v)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={[styles.chip, { backgroundColor: on ? kc.navy : scroll ? kc.white : kc.sky }]}
      >
        {o.icon ? <o.icon size={17} color={on ? kc.white : kc.navy} /> : null}
        <Txt size={15} weight="bold" color={on ? kc.white : kc.navy} fixed>
          {o.l}
        </Txt>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {items}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items}</View>;
}

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt size={14} weight="bold" muted>
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt size={14} weight="bold" color={kc.red}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps & { big?: boolean }) {
  const { zoom } = usePrefs();
  const { big, style, multiline, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={ink(0.45)}
      multiline={multiline}
      {...rest}
      style={[
        styles.input,
        { fontSize: Math.round((big ? 18 : 16) * zoom), minHeight: multiline ? 104 : big ? 56 : 50 },
        multiline && { paddingTop: 12, textAlignVertical: "top" },
        style,
      ]}
    />
  );
}

// ─────────────────────────────── overlays ───────────────────────────────────

/** Bottom sheet with a title and close button (design: Sheet). */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grip} />
          <Row style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <Txt size={21} weight="black" color={kc.navy} style={{ flex: 1 }} accessibilityRole="header">
              {title}
            </Txt>
            <IconBtn icon={X} label="Close" onPress={onClose} size={44} />
          </Row>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Centered confirmation dialog (design: Confirm). */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.scrim, { justifyContent: "center", padding: 24 }]} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Txt size={19} weight="black" color={kc.navy}>
            {title}
          </Txt>
          <Txt size={15} muted style={{ marginTop: 4 }}>
            {body}
          </Txt>
          <Row gap={8} style={{ marginTop: 16 }}>
            <Btn size="md" variant={danger ? "danger" : "navy"} label={confirmLabel} onPress={onConfirm} loading={busy} style={{ flex: 1 }} />
            <Btn size="md" variant="ghost" label="Cancel" onPress={onCancel} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { transform: [{ scale: 0.97 }] },
  pressedSoft: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: radius.md,
    backgroundColor: kc.white,
    borderWidth: 1,
    borderColor: navy(0.05),
    ...cardShadow,
  },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.md, paddingVertical: 8 },
  btnShadow: { shadowColor: kc.navy, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  card: { backgroundColor: kc.white, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: navy(0.05), ...cardShadow },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tip: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.lg, padding: 12, paddingRight: 16 },
  track: { width: 56, height: 32, borderRadius: 16 },
  knob: { position: "absolute", top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: kc.white, elevation: 2, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 2 },
  segment: { flexDirection: "row", backgroundColor: kc.sky, borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segmentOn: { backgroundColor: kc.white, ...cardShadow },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 46, borderRadius: radius.pill, paddingHorizontal: 16 },
  input: {
    backgroundColor: "rgba(234,243,252,.85)",
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontFamily: fonts.semi,
    color: kc.ink,
  },
  scrim: { flex: 1, backgroundColor: "rgba(36,59,96,.45)" },
  sheet: {
    maxHeight: "88%",
    backgroundColor: kc.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grip: { alignSelf: "center", width: 48, height: 6, borderRadius: 3, backgroundColor: navy(0.15), marginBottom: 12 },
  dialog: { backgroundColor: kc.white, borderRadius: radius.lg, padding: 20 },
});
