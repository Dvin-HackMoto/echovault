// EchoVault mobile — icons for the hub's categories and schedule kinds (lucide, as in the design).

import {
  Footprints,
  Heart,
  type LucideIcon,
  Moon,
  Pill,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  Sun,
  Users,
  Utensils,
  Puzzle,
} from "lucide-react-native";

import type { Category, ScheduleKind } from "../types";

export const categoryIcon: Record<Category, LucideIcon> = {
  identity: Users,
  routine: Sun,
  history: Sparkles,
  preference: Heart,
  care_safety: ShieldPlus,
  engagement: Puzzle,
};

export const kindIcon: Record<ScheduleKind, LucideIcon> = {
  appointment: Stethoscope,
  meal: Utensils,
  routine: Moon,
  visit: Users,
  activity: Footprints,
};

export const MedIcon = Pill;
