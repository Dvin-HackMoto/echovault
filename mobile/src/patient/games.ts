// EchoVault mobile — the memory games the patient can choose (PAT-7).
// Names are friendly, never clinical. No React Native imports (tested in tests/logic.test.ts).

import type { GameType, RoundUnavailableReason } from "../api/games";
import type { ActivityOutcome } from "../types";

export type { GameType };

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

/** What the patient reads when the hub says a round can't be played. */
export function unavailableMessage(reason: RoundUnavailableReason | null | undefined): string {
  if (reason === "topic_not_selected") {
    return "This game is resting for now. Your caregiver can turn it on.";
  }
  return "There is not enough saved yet to play this game. Ask your caregiver to add more.";
}

/** The outcome logged when the patient reaches the end of a round. */
export function roundOutcome(answeredCount: number): ActivityOutcome {
  return answeredCount > 0 ? "completed" : "skipped";
}
