/**
 * AthleX — Niveaux multi-dimensionnels (SPEC §6ter)
 * =================================================
 * Le « niveau » n'est pas une seule étiquette : c'est FORCE + GYM (+ moteur plus tard).
 *   - Force : DÉDUITE des PR barre (page de records).
 *   - Gym   : DÉCLARÉE par l'utilisateur (les PR ne disent rien du gymnastique).
 * Le niveau appliqué est CONTEXTUEL au mouvement : un snatch utilise le niveau Force,
 * un muscle-up le niveau Gym. Dans un même WOD : barre lourde + gym scalée au réel.
 *
 * Pur TypeScript, aucune dépendance. Suggestions seulement : l'utilisateur peut override.
 */

export type Level = 'Scaled' | 'Inter' | 'RX' | 'RX+' | 'Elite' | 'Pro';
export const ORDER: Level[] = ['Scaled', 'Inter', 'RX', 'RX+', 'Elite', 'Pro'];
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : 2);

// ============================ FORCE — depuis les PR barre ============================

/** Seuils ABSOLUS indicatifs (Homme, kg). `bodyweight` (optionnel) → passage en relatif. */
const STRENGTH_ABS: Record<string, number[]> = {
  //            <Inter <RX  <RX+ <Elite <Pro
  snatch:     [40, 60, 80, 95, 110],
  clean:      [60, 85, 105, 120, 140],
  deadlift:   [100, 140, 180, 210, 240],
  back_squat: [80, 120, 150, 180, 210],
  front_squat:[70, 100, 130, 155, 180],
};
/** Ratios ×poids de corps si le PC est connu (plus juste que l'absolu). */
const STRENGTH_REL: Record<string, number[]> = {
  snatch:     [0.6, 0.85, 1.05, 1.25, 1.45],
  clean:      [0.8, 1.1, 1.35, 1.55, 1.8],
  deadlift:   [1.4, 1.9, 2.3, 2.7, 3.0],
  back_squat: [1.2, 1.6, 2.0, 2.3, 2.6],
  front_squat:[1.0, 1.35, 1.7, 2.0, 2.3],
};

function levelForLift(lift: string, kg: number, bodyweight?: number): Level | null {
  const table = bodyweight && STRENGTH_REL[lift] ? STRENGTH_REL[lift].map((r) => r * bodyweight) : STRENGTH_ABS[lift];
  if (!table) return null;
  let i = 0;
  while (i < table.length && kg >= table[i]) i++;
  return ORDER[i];
}

export function strengthLevel(prs: Record<string, number>, bodyweight?: number): {
  perLift: Record<string, Level>; suggested: Level;
} {
  const perLift: Record<string, Level> = {};
  const ranks: number[] = [];
  for (const [lift, kg] of Object.entries(prs)) {
    const lv = levelForLift(lift, kg, bodyweight);
    if (lv) { perLift[lift] = lv; ranks.push(ORDER.indexOf(lv)); }
  }
  return { perLift, suggested: ORDER[median(ranks)] };
}

// ============================ GYM — déclaré par l'utilisateur ============================
// Échelles miroir de GYM_TIERS (engineCrossFit) : l'index atteint = le niveau de la famille.
// L'utilisateur déclare le PLUS HAUT palier qu'il maîtrise pour chaque famille.

export const GYM_LADDERS: Record<string, string[]> = {
  pullup:      ['Aucun', 'Banded/Jumping', 'Pull-ups stricts', 'Chest-to-Bar', 'Bar Muscle-up', 'Ring Muscle-up'],
  hspu:        ['Aucun', 'Push-ups', 'HSPU kipping', 'HSPU strict', 'Deficit HSPU', 'Deficit HSPU'],
  toesToBar:   ['Aucun', 'Knee raises', 'Toes-to-Bar', 'Toes-to-Bar', 'Toes-to-Bar', 'Toes-to-Bar'],
  doubleUnder: ['Aucun', 'Single-unders', 'Double-unders', 'Double-unders', 'DU enchaînés', 'Triple-unders'],
  pistol:      ['Aucun', 'Assisté', 'Pistols', 'Pistols', 'Pistols', 'Pistols'],
  ropeClimb:   ['Aucun', 'Depuis assis', 'Rope Climb', 'Legless', 'Legless', 'Legless'],
  handstandWalk:['Aucun', 'Kick-up', 'HS Walk', 'HS Walk', 'HS Walk', 'HS Walk'],
};

/** Déclaration : famille -> index du palier maîtrisé (0 = aucun ... 5 = max). */
export type GymDeclaration = Record<string, number>;

export function gymLevel(decl: GymDeclaration): { perFamily: Record<string, Level>; suggested: Level } {
  const perFamily: Record<string, Level> = {};
  const ranks: number[] = [];
  for (const [fam, idx] of Object.entries(decl)) {
    const clamped = Math.max(0, Math.min(ORDER.length - 1, idx));
    perFamily[fam] = ORDER[clamped];
    ranks.push(clamped);
  }
  return { perFamily, suggested: ORDER[median(ranks)] };
}

// ============================ NIVEAU CONTEXTUEL PAR MOUVEMENT ============================

type Domain = 'barbell' | 'gym' | 'other';

/** Domaine grossier d'un mouvement (nom affiché) pour choisir quel niveau appliquer. */
export function movementDomain(name: string): Domain {
  const n = name.toLowerCase();
  if (/muscle-up|pull-up|chest-to-bar|hspu|handstand|toes-to-bar|knees-to-elbow|pistol|rope climb|ring dip|double-under|burpee|push-up|sit-up|air squat/.test(n)) return 'gym';
  if (/thruster|clean|snatch|deadlift|squat|press|jerk|sdhp|cluster|wall ball|swing|goblet|devil/.test(n)) return 'barbell';
  return 'other';
}

/**
 * Niveau EFFECTIF pour un mouvement donné, selon la dimension concernée.
 * @param forceLevel niveau Force (barre) — suggéré depuis PR, override possible
 * @param gymLevelVal niveau Gym global (ou par famille si fourni)
 */
export function effectiveLevel(name: string, forceLevel: Level, gymLevelVal: Level): Level {
  const d = movementDomain(name);
  if (d === 'gym') return gymLevelVal;
  if (d === 'barbell') return forceLevel;
  return forceLevel; // cardio/divers : neutre, on suit la force par défaut
}

// ============================ COUPLAGE CHARGE / REPS — OPT-IN UNIQUEMENT ============================
// ⚠️ PAR DÉFAUT : les reps ne sont PAS scalées. Elles font partie de l'identité PARTAGÉE
// du WOD (sa signature) → deux amis de niveaux différents font le MÊME 21-15-9 et se
// comparent (whiteboard / ELO). La personnalisation ne porte que sur charge + variante.
// scaleReps() n'est utilisé QUE si l'utilisateur active un « mode solo intensité » explicite,
// jamais quand le WOD peut être comparé. Comme la charge est déjà ajustée par PR, le WOD
// reste faisable sans toucher aux reps.

export const REP_FACTOR: Record<Level, number> = {
  Scaled: 1.15, Inter: 1.05, RX: 1.0, 'RX+': 0.9, Elite: 0.82, Pro: 0.75,
};

/** Ajuste une échelle de reps (ex. [21,15,9]) au niveau effectif d'un mouvement. */
export function scaleReps(ladder: number[], level: Level): number[] {
  return ladder.map((r) => Math.max(1, Math.round(r * REP_FACTOR[level])));
}
