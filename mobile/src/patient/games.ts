// EchoVault mobile — the memory games the patient can choose (PAT-7).
// Names are friendly, never clinical. `pose` is the Kali picture on the card.

import type { GameType, RoundUnavailableReason } from "../api/games";
import type { ActivityOutcome } from "../types";
import type { KaliPose } from "../ui/kali";

export type { GameType };

export const GAMES: { type: GameType; pose: KaliPose; title: string; titleFil: string; about: string; aboutFil: string }[] = [
  { type: "family_matching", pose: "photo", title: "Family Matching", titleFil: "Pagtugma sa Pamilya", about: "Find the right person in your family.", aboutFil: "Hanapin ang tamang tao sa pamilya." },
  { type: "name_recall", pose: "hug", title: "Who Is This?", titleFil: "Sino Ito?", about: "Look at a face and choose who it is.", aboutFil: "Tingnan ang mukha at piliin kung sino." },
  { type: "routine_recall", pose: "walk", title: "My Day", titleFil: "Aking Araw", about: "What usually comes next in your day?", aboutFil: "Ano ang susunod sa iyong araw?" },
  { type: "event_recall", pose: "cheer", title: "Special Days", titleFil: "Espesyal na Araw", about: "Remember moments you shared with family.", aboutFil: "Alalahanin ang masasayang sandali." },
  { type: "memory_quiz", pose: "reading", title: "About Me", titleFil: "Tungkol sa Akin", about: "Gentle questions about your life.", aboutFil: "Magaang tanong tungkol sa buhay mo." },
  { type: "picture_matching", pose: "happy", title: "Picture Matching", titleFil: "Pagtugma ng Larawan", about: "Find the pictures that go together.", aboutFil: "Hanapin ang magkatugmang larawan." },
];

export function isGameType(value: string | undefined): value is GameType {
  return GAMES.some((g) => g.type === value);
}

/**
 * Why the hub could not build a round, in the patient's words. The hub returns
 * the reason on GET /games/{type}/round; it never blames the patient.
 */
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
