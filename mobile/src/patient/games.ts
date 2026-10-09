// EchoVault mobile — the memory games the patient can choose (PAT-7).
// Names are friendly, never clinical.

import type { ActivityKind } from "../types";

export type GameType = Exclude<ActivityKind, "trivia_prompt">;

export const GAMES: { type: GameType; icon: string; title: string; about: string }[] = [
  { type: "family_matching", icon: "👪", title: "Family matching", about: "Find the right person in your family." },
  { type: "name_recall", icon: "🙂", title: "Who is this?", about: "Remember who someone is to you." },
  { type: "routine_recall", icon: "☀️", title: "My day", about: "What usually comes next in your day?" },
  { type: "event_recall", icon: "🎉", title: "Special days", about: "Remember moments you shared with family." },
  { type: "memory_quiz", icon: "💭", title: "About me", about: "Simple questions about your life." },
  { type: "picture_matching", icon: "🖼️", title: "Picture matching", about: "Match photos that go together." },
];

export function isGameType(value: string | undefined): value is GameType {
  return GAMES.some((g) => g.type === value);
}
