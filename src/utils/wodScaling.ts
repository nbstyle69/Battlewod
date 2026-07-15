// Scaled variants of the official "WOD du Jour" pool + a generic fallback,
// so every WOD can be read in both RX and Scaled without a server round-trip.

// Curated Scaled prescriptions keyed by the exact official WOD name
// (see supabase/migrations/20260617_daily_wod_official.sql pool).
const SCALED_WODS: Record<string, string> = {
  'Cindy':
    'AMRAP 20 min\n5 Ring rows\n10 Push-ups (genoux)\n15 Air squats',
  'Fran':
    '21-15-9\nThrusters (30/20 kg)\nRing rows',
  'Helen':
    '3 rounds\n400 m Run\n21 Kettlebell swings (16/12 kg)\n12 Ring rows',
  'EMOM 12 — Force':
    'EMOM 12 min\nMin 1 : 8 Deadlifts (55/35 kg)\nMin 2 : 10 Step-ups (40/30 cm)\nMin 3 : 12 Wall balls (6/4 kg)',
  'Chelsea':
    'EMOM 30 min\n5 Ring rows\n10 Push-ups (genoux)\n15 Air squats',
  'Grace':
    'For Time\n30 Clean & Jerk (40/30 kg)',
  'Annie':
    '50-40-30-20-10\nSingle-unders\nSit-ups',
  'AMRAP 15 — Engine':
    'AMRAP 15 min\n10 Cal Row\n9 Burpees\n6 Knee raises',
  'Karen':
    'For Time\n150 Wall balls (6/4 kg)',
  'AMRAP 12 — Gymnastique':
    'AMRAP 12 min\n7 Pike push-ups\n14 Fentes alternées\n21 Single-unders',
  'EMOM 16 — Mixte':
    'EMOM 16 min\nMin 1 : 15 Cal Bike\nMin 2 : 12 Dumbbell snatch (12/8 kg)\nMin 3 : 10 Burpees\nMin 4 : Repos',
  'Jackie':
    'For Time\n1000 m Row\n50 Thrusters (15/10 kg)\n30 Ring rows',
  'AMRAP 18 — Hero-lite':
    'AMRAP 18 min\n10 Deadlifts (40/30 kg)\n10 Hang power cleans (barre légère)\n10 Front squats\n10 Push press',
  'Barbara-lite':
    '3 rounds\n20 Ring rows\n30 Push-ups (genoux)\n40 Sit-ups\n50 Air squats',
};

// Movement substitutions for the generic fallback (harder → scaled).
const MOVEMENT_SUBS: Array<[RegExp, string]> = [
  [/handstand push-?ups?/gi, 'Pike push-ups'],
  [/toes-?to-?bar/gi, 'Knee raises'],
  [/muscle-?ups?/gi, 'Pull-ups'],
  [/double-?unders?/gi, 'Single-unders'],
  [/pull-?ups?/gi, 'Ring rows'],
  [/push-?ups?/gi, 'Push-ups (genoux)'],
];

// Reduce barbell/dumbbell loads by ~35% (rounded to nearest 5 kg) for "(M/F kg)".
function scaleLoads(line: string): string {
  return line.replace(/\((\d+)\/(\d+)\s*kg\)/gi, (_m, a: string, b: string) => {
    const round5 = (n: number) => Math.max(5, Math.round((n * 0.65) / 5) * 5);
    return `(${round5(parseInt(a, 10))}/${round5(parseInt(b, 10))} kg)`;
  });
}

function deriveScaledMovements(movements: string): string {
  return movements
    .split('\n')
    .map((line) => {
      let out = scaleLoads(line);
      for (const [re, sub] of MOVEMENT_SUBS) out = out.replace(re, sub);
      return out;
    })
    .join('\n');
}

/**
 * Returns the Scaled prescription for a WOD.
 * Prefers a curated variant (official pool), otherwise derives one by lowering
 * loads and substituting the hardest gymnastics movements.
 */
export function getScaledMovements(wodName: string | null | undefined, movements: string): string {
  if (wodName && SCALED_WODS[wodName]) return SCALED_WODS[wodName];
  return deriveScaledMovements(movements);
}
