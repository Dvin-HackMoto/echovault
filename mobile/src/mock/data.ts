// EchoVault mobile — demo family and day for the demo hub (src/mock/hub.ts).
// Same people as the backend demo seed, so switching from demo to the real hub
// does not change who the patient sees. Not medical advice: the medicines are
// demo entries only.

import type { Category, Importance, Memory, Patient, Person, SettingsValues } from "../types";

const CREATED = "2026-10-01 08:00:00";

export const PROFILE: Patient = {
  id: 1,
  full_name: "Maria Elena Santos",
  preferred_name: "Lola Nena",
  language: "fil-en",
  font_scale: 1.2,
  voice_enabled: 1,
  managed_mode: 0,
  updated_at: CREATED,
};

export const SETTINGS: SettingsValues = {
  game_topics: ["family_names", "relationships", "routines"],
  game_difficulty: 1,
  trivia_frequency_min: 120,
  quiet_hours: { start: "21:00", end: "07:00" },
};

function person(
  id: string,
  name: string,
  nickname: string,
  relationship: string,
  notes: string,
  extra: Partial<Person> = {},
): Person {
  return {
    id, name, nickname, relationship, notes,
    photo_path: null, photo_url: null, is_caregiver: 0, trust: "verified",
    created_by: null, created_at: CREATED, updated_at: CREATED,
    ...extra,
  };
}

export const PEOPLE: Person[] = [
  person("demo-ana", "Ana Santos-Reyes", "Ana", "daughter",
    "Your eldest. She lives with you and helps you every day.", { is_caregiver: 1 }),
  person("demo-miguel", "Miguel Santos", "Migs", "son", "Your son. He visits every Saturday afternoon."),
  person("demo-paolo", "Paolo Reyes", "Pao", "grandson", "Ana's son. He is in college."),
  person("demo-bea", "Beatriz Reyes", "Bea", "granddaughter", "Ana's daughter. She loves to bake with you."),
  person("demo-rosa", "Rosa Dela Cruz", "Aling Rosa", "neighbor", "Your neighbor and friend for many years."),
  person("demo-cruz", "Dr. Ramon Cruz", "Dr. Cruz", "doctor", "Your doctor at the health center."),
  // not verified: the patient app must never show this one
  person("demo-carmen", "Carmen Villanueva", "Carmen", "cousin", "Cousin from Pampanga.", { trust: "unverified" }),
];

function memory(
  id: string,
  content: string,
  category: Category,
  personId: string | null,
  extra: Partial<Memory> & { importance?: Importance } = {},
): Memory {
  return {
    id, title: null, content, category, importance: "general", trust: "verified", validity: "persistent",
    event_date: null, person_id: personId, source: "caregiver", created_at: CREATED, updated_at: CREATED,
    ...extra,
  };
}

export const MEMORIES: Memory[] = [
  memory("demo-mem-ana", "Ana is your daughter. She is your eldest child and lives with you.", "identity", "demo-ana", { importance: "important" }),
  memory("demo-mem-ana-flower", "Ana loves sunflowers.", "preference", "demo-ana"),
  memory("demo-mem-miguel", "Miguel is your son. He works in Quezon City and visits every Saturday.", "identity", "demo-miguel", { importance: "important" }),
  memory("demo-mem-paolo", "Paolo is your grandson. He is Ana's son.", "identity", "demo-paolo"),
  memory("demo-mem-bea", "Bea loves to bake ensaymada with you on weekends.", "preference", "demo-bea"),
  memory("demo-mem-birthday", "You celebrated your 78th birthday at home with Ana, Miguel, Paolo and Bea. Bea baked the cake.", "history", null, { event_date: "2026-03-12" }),
  memory("demo-mem-teacher", "You taught Grade 3 at Malolos Central School for 32 years.", "history", null, { importance: "important" }),
  // not verified: never shown to the patient
  memory("demo-mem-carmen", "Carmen visits at Christmas.", "history", "demo-ana", { trust: "unverified" }),
];

// Times of day; the demo hub turns them into today's occurrences.
export const DAY = [
  { id: "demo-sched-breakfast", title: "Breakfast", kind: "meal", time: "07:00", duration: 30 },
  { id: "demo-sched-plants", title: "Water the plants", kind: "activity", time: "09:00", duration: 20 },
  { id: "demo-sched-lunch", title: "Lunch", kind: "meal", time: "12:00", duration: 45 },
  { id: "demo-sched-nap", title: "Afternoon rest", kind: "routine", time: "13:30", duration: 60, quiet: true },
  { id: "demo-sched-visit", title: "Miguel visits", kind: "visit", time: "15:00", duration: 120, person: "demo-miguel", place: "Home" },
  { id: "demo-sched-merienda", title: "Merienda", kind: "meal", time: "15:30", duration: 20 },
  { id: "demo-sched-dinner", title: "Dinner", kind: "meal", time: "18:30", duration: 45 },
  { id: "demo-sched-bedtime", title: "Bedtime", kind: "routine", time: "21:00", duration: null, quiet: true },
] as const;

export const MEDICINES = [
  { id: "demo-med-metformin", name: "Metformin", dose: "1 tablet", instructions: "after breakfast", time: "08:00" },
  { id: "demo-med-losartan", name: "Losartan", dose: "1 tablet", instructions: "after dinner", time: "20:00" },
] as const;

export const QUIZ = [
  { id: "demo-q-teacher", question: "What did you teach for 32 years?", answer: "Grade 3", choices: ["Grade 3", "High school math", "Music"], memory: "demo-mem-teacher" },
  { id: "demo-q-cake", question: "Who baked the cake for your 78th birthday?", answer: "Bea", choices: ["Bea", "Ana", "Aling Rosa"], memory: "demo-mem-birthday" },
  { id: "demo-q-flower", question: "What is Ana's favorite flower?", answer: "Sunflowers", choices: ["Sunflowers", "Roses", "Sampaguita"], memory: "demo-mem-ana-flower" },
] as const;

export const TRIVIA = [
  { id: "demo-t-flower", kind: "family", topic: "relationships", question: "Ana is your daughter. Do you remember her favorite flower?", answer: "Sunflowers", choices: ["Sunflowers", "Roses", "Sampaguita"], memory_id: "demo-mem-ana-flower", person: "demo-ana" },
  { id: "demo-t-plants", kind: "routine", topic: "routines", question: "What do you usually do every morning after breakfast?", answer: "Water the plants", choices: null, memory_id: null, person: null },
  { id: "demo-t-sky", kind: "general", topic: null, question: "What color is the sky on a clear day?", answer: "Blue", choices: ["Blue", "Green", "Red"], memory_id: null, person: null },
] as const;
