// Canonical movement catalog + serialize/parse helpers for the structured
// movement editor (box WOD back-office). Mirrors TheHub's `lib/movements.ts`
// so the serialized lines are identical and reliably parsed for badge credit.

export interface CatalogMovement { name: string; weighted: boolean; cardio?: boolean; }

export const MOVEMENT_CATALOG: CatalogMovement[] = [
  { name: 'Thruster', weighted: true },
  { name: 'Power Clean', weighted: true },
  { name: 'Power Snatch', weighted: true },
  { name: 'Clean & Jerk', weighted: true },
  { name: 'Deadlift', weighted: true },
  { name: 'Front Squat', weighted: true },
  { name: 'Back Squat', weighted: true },
  { name: 'Overhead Squat', weighted: true },
  { name: 'Push Press', weighted: true },
  { name: 'Push Jerk', weighted: true },
  { name: 'Sumo Deadlift High Pull', weighted: true },
  { name: 'Squat Snatch', weighted: true },
  { name: 'Squat Clean', weighted: true },
  { name: 'Squat Clean & Jerk', weighted: true },
  { name: 'Cluster', weighted: true },
  { name: 'Alt DB Snatch', weighted: true },
  { name: 'DB Thruster', weighted: true },
  { name: 'Devils Press', weighted: true },
  { name: 'DB Deadlift', weighted: true },
  { name: 'DB Clean & Jerk', weighted: true },
  { name: 'DB Push Press', weighted: true },
  { name: 'KB Swing', weighted: true },
  { name: 'Goblet Squat', weighted: true },
  { name: 'KB Clean', weighted: true },
  { name: 'Wall Balls', weighted: true },
  { name: 'Pull-ups', weighted: false },
  { name: 'Toes-to-Bar', weighted: false },
  { name: 'Chest-to-Bar', weighted: false },
  { name: 'Bar Muscle-ups', weighted: false },
  { name: 'Handstand Push-ups', weighted: false },
  { name: 'Ring Dips', weighted: false },
  { name: 'Ring Muscle-ups', weighted: false },
  { name: 'Rope Climbs', weighted: false },
  { name: 'Pistols', weighted: false },
  { name: 'Handstand Walk', weighted: false },
  { name: 'Box Jump-overs', weighted: false },
  { name: 'Box Jumps', weighted: false },
  { name: 'Box Step-ups', weighted: false },
  { name: 'Burpees Over the Bar', weighted: false },
  { name: 'Burpees', weighted: false },
  { name: 'Push-ups', weighted: false },
  { name: 'Sit-ups', weighted: false },
  { name: 'Air Squats', weighted: false },
  { name: 'Row', weighted: false, cardio: true },
  { name: 'Bike Erg', weighted: false, cardio: true },
  { name: 'Echo Bike', weighted: false, cardio: true },
  { name: 'SkiErg', weighted: false, cardio: true },
  { name: 'Run', weighted: false, cardio: true },
  { name: 'Double-unders', weighted: false },
  { name: 'Lunges', weighted: false },
  { name: 'V-ups', weighted: false },
  { name: 'Hollow Rocks', weighted: false },
];

export function isWeightedMovement(name: string): boolean {
  const found = MOVEMENT_CATALOG.find(m => m.name.toLowerCase() === name.toLowerCase().trim());
  return found ? found.weighted : false;
}

// Serialize a structured movement row into a parseable line.
//   (21, 'Thruster', 43)       -> "21 Thruster (43 kg)"
//   (21, 'Thruster', 43, 30)   -> "21 Thruster (43/30 kg)"
//   (12, 'Pull-ups')           -> "12 Pull-ups"
export function serializeMovement(
  reps: number,
  name: string,
  weightKg?: number | null,
  weightKgWomen?: number | null,
): string {
  const base = `${reps} ${name.trim()}`.trim();
  const men = weightKg != null && weightKg > 0 ? weightKg : null;
  const women = weightKgWomen != null && weightKgWomen > 0 ? weightKgWomen : null;
  if (men != null && women != null) return `${base} (${men}/${women} kg)`;
  if (men != null) return `${base} (${men} kg)`;
  if (women != null) return `${base} (${women} kg)`;
  return base;
}

// Parse a stored movement line back into structured parts (best-effort).
// A "men/women" pair ("43/30 kg") splits into weightKg (men) + weightKgWomen (women).
export function parseMovementRow(line: string): {
  reps: number | null;
  name: string;
  weightKg: number | null;
  weightKgWomen: number | null;
} {
  let s = (line ?? '').trim();
  let weightKg: number | null = null;
  let weightKgWomen: number | null = null;
  const num = String.raw`\d+(?:\.\d+)?`;
  const wParen = s.match(new RegExp(String.raw`\((${num})(?:\s*\/\s*(${num}))?\s*kg\)`, 'i'));
  const wAt = s.match(new RegExp(String.raw`@\s*(${num})(?:\s*\/\s*(${num}))?`, 'i'));
  const w = wParen ?? wAt;
  if (w) {
    weightKg = parseFloat(w[1]);
    if (w[2] != null) weightKgWomen = parseFloat(w[2]);
  }
  s = s.replace(/\((?:[^)]*)\)/g, '').replace(/@.*$/, '').trim();
  const m = s.match(/^(\d+)\s*(?:reps?|x)?\s*[—\-:]?\s*(.+)$/i);
  if (m) return { reps: parseInt(m[1], 10), name: m[2].trim(), weightKg, weightKgWomen };
  return { reps: null, name: s, weightKg, weightKgWomen };
}
