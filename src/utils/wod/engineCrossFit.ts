/**
 * BattleWOD — Moteur de génération WOD DÉTERMINISTE (mode Functional Fitness / CrossFit)
 * =====================================================================================
 * Pur TypeScript, AUCUNE dépendance, AUCUN appel API au runtime.
 * Jumeau du moteur Hyrox mais adapté à la logique CrossFit.
 *   - intent  -> DOMAINE des mouvements (Cardio / Force / Gym / Mixed)
 *   - level   -> CHARGE (poids RX × facteur) + COMPLEXITÉ (échelle de scaling gym)
 *   - method  -> STRUCTURE (For Time / AMRAP / EMOM / Tabata / Max Reps / Benchmark)
 *
 * Étends librement MOVES / GYM_TIERS / RX_LOADS : c'est là que vit la richesse.
 */

import { RNG, randomSeed } from './rng';

// ============================ Types ============================

export type Level = 'Scaled' | 'Inter' | 'RX' | 'RX+' | 'Elite' | 'Pro';
export type Intent = 'Mixed' | 'Cardio' | 'Force' | 'Gym';
export type Method = 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps';
export type CFFormat = 'Solo' | 'Équipe 2' | 'Équipe 3' | 'Équipe 4';

export interface CFParams {
  level: Level;
  duration_min: number;          // 5 | 10 | 15 | 20 | 30 ...
  intent: Intent;
  method: Method;
  format: CFFormat;
  equipment: string[];           // chips de l'UI
  benchmark?: boolean;           // chip "Benchmark" -> WOD au format benchmark
}

export interface Movement {
  name: string; prescription: string; load: string | null;
  equipment: string | null; scaling_note: string | null;
}
export interface Block {
  label: string | null; structure: string; scheme: string;
  movements: Movement[]; rest: string | null;
}
export interface CFWod {
  title: string; level: Level; format: CFFormat; duration_min: number;
  intent: Intent; method: string; time_cap_min: number; score_type: string;
  modifiers: string[]; warmup: string[]; strength: Block | null;
  blocks: Block[]; cooldown: string[]; coach_notes: string[];
  stimulus: string; seed: number;
}

// ============================ Données de référence ============================

// Charges RX de référence en kg [Homme, Femme]. Échelonnées ensuite par le niveau.
const RX_LOADS: Record<string, [number, number]> = {
  thruster:   [43, 30],
  clean:      [61, 43],
  snatch:     [43, 30],
  cleanJerk:  [61, 43],
  deadlift:   [102, 70],
  frontSquat: [43, 30],
  backSquat:  [61, 43],
  ohSquat:    [43, 30],
  pushPress:  [43, 30],
  pushJerk:   [52, 35],
  sdhp:       [43, 30],
  db:         [22.5, 15],   // par haltère
  kb:         [24, 16],
  wallBall:   [9, 6],
};

const LEVEL_FACTOR: Record<Level, number> = {
  'Scaled': 0.65, 'Inter': 0.82, 'RX': 1.0, 'RX+': 1.1, 'Elite': 1.18, 'Pro': 1.25,
};
const LEVEL_RANK: Record<Level, number> = {
  'Scaled': 0, 'Inter': 1, 'RX': 2, 'RX+': 3, 'Elite': 4, 'Pro': 5,
};

const GYM_TIERS: Record<string, string[]> = {
  pullup:      ['Ring Rows', 'Banded Pull-ups', 'Pull-ups', 'Chest-to-Bar Pull-ups', 'Bar Muscle-ups', 'Bar Muscle-ups'],
  hspu:        ['Box Pike Push-ups', 'Push-ups', 'Handstand Push-ups', 'Strict HSPU', 'Deficit HSPU', 'Deficit HSPU'],
  t2b:         ['Hanging Knee Raises', 'Knees-to-Elbow', 'Toes-to-Bar', 'Toes-to-Bar', 'Toes-to-Bar', 'Toes-to-Bar'],
  ringDip:     ['Bench Dips', 'Banded Ring Dips', 'Ring Dips', 'Strict Ring Dips', 'Ring Muscle-ups', 'Ring Muscle-ups'],
  doubleUnder: ['Single-unders', 'Single-unders', 'Double-unders', 'Double-unders', 'Double-unders', 'Triple-unders'],
  pistol:      ['Air Squats', 'Assisted Pistols', 'Pistols', 'Pistols', 'Pistols', 'Pistols'],
  ropeClimb:   ['Floor-to-Stand Rope Pulls', 'Seated Rope Climbs', 'Rope Climbs', 'Legless Rope Climbs', 'Legless Rope Climbs', 'Legless Rope Climbs'],
  hsWalk:      ['Bear Crawl', 'Bear Crawl', 'Handstand Walk', 'Handstand Walk', 'Handstand Walk', 'Handstand Walk'],
  c2b:         ['Jumping Pull-ups', 'Pull-ups', 'Chest-to-Bar Pull-ups', 'Chest-to-Bar Pull-ups', 'Chest-to-Bar Pull-ups', 'Chest-to-Bar Pull-ups'],
  barMuscleUp: ['Jumping Pull-ups', 'Chest-to-Bar Pull-ups', 'Chest-to-Bar Pull-ups', 'Bar Muscle-ups', 'Bar Muscle-ups', 'Bar Muscle-ups'],
  ringMuscleUp:['Ring Rows', 'Ring Dips', 'Ring Dips', 'Ring Muscle-ups', 'Ring Muscle-ups', 'Ring Muscle-ups'],
};

type Domain = 'cardio' | 'weightlifting' | 'gymnastics';
type Unit = 'reps' | 'cardio';

interface MoveDef {
  key: string;
  name: string;
  domain: Domain;
  unit: Unit;
  equipment: string | null;
  loadKey?: keyof typeof RX_LOADS;
  tierKey?: keyof typeof GYM_TIERS;
  base: number;
  cardio?: (rng: RNG) => string;
}

const MOVES: MoveDef[] = [
  // --- Haltérophilie / barre ---
  { key: 'thruster', name: 'Thruster', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'thruster', base: 12 },
  { key: 'clean', name: 'Power Clean', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'clean', base: 8 },
  { key: 'snatch', name: 'Power Snatch', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'snatch', base: 8 },
  { key: 'cleanJerk', name: 'Clean & Jerk', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'cleanJerk', base: 6 },
  { key: 'deadlift', name: 'Deadlift', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'deadlift', base: 10 },
  { key: 'frontSquat', name: 'Front Squat', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'frontSquat', base: 10 },
  { key: 'backSquat', name: 'Back Squat', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'backSquat', base: 8 },
  { key: 'ohSquat', name: 'Overhead Squat', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'ohSquat', base: 8 },
  { key: 'pushPress', name: 'Push Press', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'pushPress', base: 10 },
  { key: 'pushJerk', name: 'Push Jerk', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'pushJerk', base: 8 },
  { key: 'sdhp', name: 'Sumo Deadlift High Pull', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'sdhp', base: 12 },
  { key: 'squatSnatch', name: 'Squat Snatch', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'snatch', base: 6 },
  { key: 'squatClean', name: 'Squat Clean', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'clean', base: 6 },
  { key: 'squatCleanJerk', name: 'Squat Clean & Jerk', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'cleanJerk', base: 5 },
  { key: 'cluster', name: 'Cluster', domain: 'weightlifting', unit: 'reps', equipment: 'Barbell', loadKey: 'cleanJerk', base: 6 },
  // --- Haltères / kettlebell ---
  { key: 'dbSnatch', name: 'Alt DB Snatch', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 16 },
  { key: 'dbThruster', name: 'DB Thruster', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 12 },
  { key: 'devilsPress', name: 'Devils Press', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 8 },
  { key: 'dbDeadlift', name: 'DB Deadlift', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 14 },
  { key: 'dbCleanJerk', name: 'DB Clean & Jerk', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 8 },
  { key: 'dbPushPress', name: 'DB Push Press', domain: 'weightlifting', unit: 'reps', equipment: 'Haltères', loadKey: 'db', base: 12 },
  { key: 'kbSwing', name: 'KB Swing', domain: 'weightlifting', unit: 'reps', equipment: 'Kettlebell', loadKey: 'kb', base: 20 },
  { key: 'gobletSquat', name: 'Goblet Squat', domain: 'weightlifting', unit: 'reps', equipment: 'Kettlebell', loadKey: 'kb', base: 15 },
  { key: 'kbClean', name: 'KB Clean', domain: 'weightlifting', unit: 'reps', equipment: 'Kettlebell', loadKey: 'kb', base: 12 },
  // --- Med Ball ---
  { key: 'wallBall', name: 'Wall Balls', domain: 'weightlifting', unit: 'reps', equipment: 'Med Ball', loadKey: 'wallBall', base: 15 },
  // --- Gymnastique ---
  { key: 'pullup', name: 'Pull-ups', domain: 'gymnastics', unit: 'reps', equipment: 'Barre traction', tierKey: 'pullup', base: 12 },
  { key: 't2b', name: 'Toes-to-Bar', domain: 'gymnastics', unit: 'reps', equipment: 'Barre traction', tierKey: 't2b', base: 12 },
  { key: 'c2b', name: 'Chest-to-Bar', domain: 'gymnastics', unit: 'reps', equipment: 'Barre traction', tierKey: 'c2b', base: 9 },
  { key: 'barMuscleUp', name: 'Bar Muscle-ups', domain: 'gymnastics', unit: 'reps', equipment: 'Barre traction', tierKey: 'barMuscleUp', base: 6 },
  { key: 'hspu', name: 'Handstand Push-ups', domain: 'gymnastics', unit: 'reps', equipment: null, tierKey: 'hspu', base: 10 },
  { key: 'ringDip', name: 'Ring Dips', domain: 'gymnastics', unit: 'reps', equipment: 'Anneaux', tierKey: 'ringDip', base: 10 },
  { key: 'ringMuscleUp', name: 'Ring Muscle-ups', domain: 'gymnastics', unit: 'reps', equipment: 'Anneaux', tierKey: 'ringMuscleUp', base: 5 },
  { key: 'ropeClimb', name: 'Rope Climbs', domain: 'gymnastics', unit: 'reps', equipment: 'Corde', tierKey: 'ropeClimb', base: 3 },
  { key: 'pistol', name: 'Pistols', domain: 'gymnastics', unit: 'reps', equipment: null, tierKey: 'pistol', base: 16 },
  { key: 'hsWalk', name: 'Handstand Walk', domain: 'gymnastics', unit: 'cardio', equipment: null, tierKey: 'hsWalk', base: 0, cardio: (r) => { const l = r.pick([1, 2, 3]); return `${l} traversée${l > 1 ? 's' : ''} (${(l * 7.62).toFixed(2)}m)`; } },
  { key: 'boxJump', name: 'Box Jump-overs', domain: 'gymnastics', unit: 'reps', equipment: 'Box', base: 15 },
  { key: 'boxJumpUp', name: 'Box Jumps', domain: 'gymnastics', unit: 'reps', equipment: 'Box', base: 15 },
  { key: 'boxStepUp', name: 'Box Step-ups', domain: 'gymnastics', unit: 'reps', equipment: 'Box', base: 20 },
  { key: 'burpeeOverBar', name: 'Burpees Over the Bar', domain: 'gymnastics', unit: 'reps', equipment: 'Barbell', base: 12 },
  { key: 'burpeeOverBarFacing', name: 'Facing Burpees Over the Bar', domain: 'gymnastics', unit: 'reps', equipment: 'Barbell', base: 10 },
  { key: 'burpee', name: 'Burpees', domain: 'gymnastics', unit: 'reps', equipment: null, base: 12 },
  { key: 'pushup', name: 'Push-ups', domain: 'gymnastics', unit: 'reps', equipment: null, base: 15 },
  { key: 'situp', name: 'Sit-ups', domain: 'gymnastics', unit: 'reps', equipment: null, base: 25 },
  { key: 'airSquat', name: 'Air Squats', domain: 'gymnastics', unit: 'reps', equipment: null, base: 20 },
  // --- Cardio / monostructurel ---
  { key: 'row', name: 'Row', domain: 'cardio', unit: 'cardio', equipment: 'Erg', base: 0, cardio: (r) => `${r.pick([200, 250, 500])}m` },
  { key: 'bike', name: 'Bike Erg', domain: 'cardio', unit: 'cardio', equipment: 'Erg', base: 0, cardio: (r) => `${r.pick([10, 12, 15])} cal` },
  { key: 'echoBike', name: 'Echo Bike', domain: 'cardio', unit: 'cardio', equipment: 'Erg', base: 0, cardio: (r) => `${r.pick([10, 12, 15])} cal` },
  { key: 'ski', name: 'SkiErg', domain: 'cardio', unit: 'cardio', equipment: 'Erg', base: 0, cardio: (r) => `${r.pick([200, 250, 500])}m` },
  { key: 'run', name: 'Run', domain: 'cardio', unit: 'cardio', equipment: null, base: 0, cardio: (r) => `${r.pick([200, 400])}m` },
  { key: 'doubleUnder', name: 'Double-unders', domain: 'cardio', unit: 'reps', equipment: 'Corde', tierKey: 'doubleUnder', base: 40 },
];

const INTENT_DOMAINS: Record<Intent, Domain[]> = {
  'Mixed':  ['cardio', 'weightlifting', 'gymnastics'],
  'Cardio': ['cardio', 'gymnastics'],
  'Force':  ['weightlifting'],
  'Gym':    ['gymnastics'],
};

const INTENT_STIMULUS: Record<Intent, string> = {
  'Mixed':  'Travail mixte des 3 filières — la signature CrossFit.',
  'Cardio': 'Capacité cardio-respiratoire, rythme soutenu.',
  'Force':  'Force et puissance, charges plus lourdes, reps maîtrisées.',
  'Gym':    'Contrôle du corps et endurance gymnastique.',
};

const TITLE_ADJ = ['Iron', 'Savage', 'Phantom', 'Molten', 'Granite', 'Crimson', 'Static', 'Brutal', 'Wired', 'Feral', 'Apex', 'Hollow', 'Rogue', 'Electric'];
const TITLE_NOUN = ['Engine', 'Crucible', 'Gauntlet', 'Forge', 'Reckoning', 'Circuit', 'Threshold', 'Vortex', 'Anvil', 'Surge', 'Riot', 'Furnace', 'Tempest', 'Grind'];

// ============================ Helpers ============================

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

function fmtLoad(level: Level, loadKey: keyof typeof RX_LOADS): string {
  const [m, f] = RX_LOADS[loadKey];
  const k = LEVEL_FACTOR[level];
  const step = loadKey === 'db' ? 0.5 : (loadKey === 'kb' || loadKey === 'wallBall' ? 1 : 2.5);
  return `${roundTo(m * k, step)}/${roundTo(f * k, step)} kg`;
}

function displayName(level: Level, m: MoveDef): { name: string; scaling: string | null } {
  if (!m.tierKey) return { name: m.name, scaling: null };
  const tiers = GYM_TIERS[m.tierKey];
  const idx = Math.min(LEVEL_RANK[level], tiers.length - 1);
  const name = tiers[idx];
  const scaling = idx < 2 ? `Standard ${m.name} au niveau RX` : null;
  return { name, scaling };
}

function isAvailable(m: MoveDef, equipment: string[]): boolean {
  if (m.equipment === null) return true;
  return equipment.includes(m.equipment);
}

// Matériel d'une box standard : si l'utilisateur ne sélectionne aucun équipement
// (et pas explicitement "Sans matériel"), on suppose une box complète plutôt que de
// restreindre au poids de corps — sinon seuls Run + gym au sol seraient tirés.
const STANDARD_BOX = ['Barbell', 'Haltères', 'Kettlebell', 'Med Ball', 'Barre traction', 'Anneaux', 'Corde', 'Box', 'Erg'];

function selectMoves(rng: RNG, params: CFParams, n: number, exclude?: (m: MoveDef) => boolean): MoveDef[] {
  const domains = INTENT_DOMAINS[params.intent];
  const bodyweightOnly = params.equipment.includes('Sans matériel');
  const hasRealEquip = params.equipment.some((e) => STANDARD_BOX.includes(e));
  const effEquip = bodyweightOnly ? [] : (hasRealEquip ? params.equipment : STANDARD_BOX);
  let pool = MOVES.filter((m) => domains.includes(m.domain) && (m.equipment === null || effEquip.includes(m.equipment)));
  if (bodyweightOnly) pool = pool.filter((m) => m.equipment === null);
  if (exclude) pool = pool.filter((m) => !exclude(m));
  if (pool.length === 0) pool = MOVES.filter((m) => m.equipment === null);
  if (params.intent === 'Mixed' && n >= 2) {
    const byDomain = rng.shuffle([...domains])
      .map((d) => rng.pick(pool.filter((m) => m.domain === d)))
      .filter(Boolean) as MoveDef[];
    const extra = rng.sample(pool.filter((m) => !byDomain.includes(m)), Math.max(0, n - byDomain.length));
    return [...byDomain, ...extra].slice(0, n);
  }
  return rng.sample(pool, Math.min(n, pool.length));
}

function toMovement(level: Level, m: MoveDef, prescription: string, loadOverride?: string): Movement {
  const { name, scaling } = displayName(level, m);
  const baseLoad = m.loadKey ? (loadOverride ?? fmtLoad(level, m.loadKey)) : null;
  return {
    name,
    prescription,
    load: baseLoad ? baseLoad + (m.key === 'wallBall' ? ' (cible 10/9 ft)' : '') : null,
    equipment: m.equipment,
    scaling_note: scaling,
  };
}

// Pour un même WOD on ne recharge pas plusieurs barres : tous les mouvements d'un même type de
// matériel chargé (barre / haltères / kettlebell) partagent la charge du mouvement le plus limitant
// (la plus légère en RX). Renvoie une map key -> charge à appliquer (matériel présent ≥2 fois).
function sharedLoads(level: Level, moves: MoveDef[]): Record<string, string> {
  const groups: Record<string, MoveDef[]> = {};
  for (const m of moves) {
    if (!m.loadKey) continue;
    const g = m.equipment ?? '_';
    (groups[g] ||= []).push(m);
  }
  const out: Record<string, string> = {};
  for (const ms of Object.values(groups)) {
    if (ms.length < 2) continue;
    const governing = ms.reduce((a, b) => (RX_LOADS[a.loadKey!][0] <= RX_LOADS[b.loadKey!][0] ? a : b));
    const load = fmtLoad(level, governing.loadKey!);
    for (const m of ms) out[m.key] = load;
  }
  return out;
}

const makeTitle = (rng: RNG) => `${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUN)}`;

// ============================ Builders ============================

function repPrescription(rng: RNG, m: MoveDef, mult = 1): string {
  if (m.unit === 'cardio' && m.cardio) return m.cardio(rng);
  return `${Math.max(1, Math.round(m.base * mult))} reps`;
}

// En For Time on exclut les mouvements à 1 rep (ex. Handstand Hold/Walk) : difficile d'en juger « la rep ».
const FORTIME_EXCLUDE = (m: MoveDef) => m.unit === 'reps' && m.base <= 1;

function buildForTime(rng: RNG, params: CFParams): Block {
  const moves = selectMoves(rng, params, params.intent === 'Force' ? 2 : rng.int(2, 3), FORTIME_EXCLUDE);
  const loads = sharedLoads(params.level, moves);
  const repBased = moves.every((m) => m.unit === 'reps');
  if (repBased && moves.length <= 3) {
    const ladder = rng.pick([[21, 15, 9], [21, 18, 15, 12, 9], [15, 12, 9], [27, 21, 15, 9]]);
    const movements = moves.map((m) => toMovement(params.level, m, `${ladder.join('-')} reps`, loads[m.key]));
    return { label: null, structure: 'FOR TIME', scheme: `${ladder.join('-')} reps`, movements, rest: null };
  }
  const rounds = params.duration_min <= 10 ? 3 : params.duration_min <= 20 ? 5 : rng.int(5, 7);
  const movements = moves.map((m) => toMovement(params.level, m, repPrescription(rng, m), loads[m.key]));
  return { label: null, structure: 'FOR TIME', scheme: `${rounds} rounds for time`, movements, rest: null };
}

function buildAmrap(rng: RNG, params: CFParams): Block {
  const d = params.duration_min;
  // 10 min -> 2 à 4 exos ; 15 min et + -> 3 à 5 exos.
  const minN = d <= 10 ? 2 : 3;
  const maxN = d <= 10 ? 4 : 5;
  const moves = selectMoves(rng, params, rng.int(minN, maxN));
  const loads = sharedLoads(params.level, moves);
  // Plus il y a d'exos, plus on baisse les reps/exo pour garder un round réalisable.
  const mult = moves.length >= 4 ? 0.6 : 0.8;
  const movements = moves.map((m) => toMovement(params.level, m, repPrescription(rng, m, mult), loads[m.key]));
  return { label: null, structure: 'AMRAP', scheme: `${d} min AMRAP`, movements, rest: null };
}

function buildEmom(rng: RNG, params: CFParams): Block {
  const moves = selectMoves(rng, params, rng.int(2, 3));
  const loads = sharedLoads(params.level, moves);
  const movements = moves.map((m, i) =>
    toMovement(params.level, m, `Min ${i + 1}: ${repPrescription(rng, m, 0.7)}`, loads[m.key]));
  return { label: null, structure: 'EMOM', scheme: `EMOM ${params.duration_min} (alterné)`, movements, rest: 'reste de chaque minute' };
}

function buildTabata(rng: RNG, params: CFParams): Block {
  const moves = selectMoves(rng, params, rng.int(1, 2));
  const loads = sharedLoads(params.level, moves);
  const movements = moves.map((m) => toMovement(params.level, m, 'max reps / 20s', loads[m.key]));
  return { label: null, structure: 'TABATA', scheme: '8 rounds — 20s on / 10s off', movements, rest: '10s entre intervalles' };
}

function buildMaxReps(rng: RNG, params: CFParams): Block {
  const m = selectMoves(rng, params, 1)[0];
  const movements = [toMovement(params.level, m, `Max reps en ${params.duration_min} min`)];
  return { label: null, structure: 'MAX REPS', scheme: `${params.duration_min} min — Max Reps`, movements, rest: null };
}

function buildBenchmark(rng: RNG, params: CFParams): Block {
  const moves = selectMoves(rng, params, 2).filter((m) => m.unit === 'reps').slice(0, 2);
  const safeMoves = moves.length === 2 ? moves : selectMoves(rng, params, 2);
  const loads = sharedLoads(params.level, safeMoves);
  const ladder = rng.pick([[21, 15, 9], [15, 12, 9]]);
  const movements = safeMoves.map((m) => toMovement(params.level, m, `${ladder.join('-')} reps`, loads[m.key]));
  return { label: null, structure: 'FOR TIME (Benchmark)', scheme: `${ladder.join('-')} reps`, movements, rest: null };
}

function buildStrength(rng: RNG, params: CFParams): Block | null {
  if (params.intent !== 'Force') return null;
  const lifts = MOVES.filter((m) => m.domain === 'weightlifting' && m.loadKey && isAvailable(m, params.equipment));
  if (lifts.length === 0) return null;
  const lift = rng.pick(lifts);
  const scheme = rng.pick(['5-5-5-5-5 @ 75%', '5-3-1 @ 80/85/90%', '3-3-3 @ 80%', 'build to a heavy 3']);
  return {
    label: 'A — Force',
    structure: 'STRENGTH',
    scheme,
    movements: [{ name: lift.name, prescription: scheme, load: '% du 1RM', equipment: lift.equipment, scaling_note: 'Charge selon ton 1RM, technique avant tout.' }],
    rest: '2-3 min entre séries',
  };
}

const scoreType = (method: string): string => {
  if (method.startsWith('FOR TIME')) return 'temps total';
  if (method === 'AMRAP') return 'tours complets + reps';
  if (method === 'EMOM') return 'régularité des reps par minute';
  if (method === 'TABATA') return 'total de reps (ou la pire série)';
  if (method === 'MAX REPS') return 'nombre total de reps';
  return 'temps total';
};

function coachNotes(params: CFParams, blocks: Block[], method: string): string[] {
  const notes: string[] = [];
  const names = blocks.flatMap((b) => b.movements.map((m) => m.name.toLowerCase()));
  const has = (s: string) => names.some((n) => n.includes(s));

  if (params.intent === 'Force') notes.push('Charges lourdes : privilégie la technique, repose-toi entre les séries.');
  else if (params.intent === 'Cardio') notes.push('Trouve une allure que tu peux tenir — pars un cran sous ton max.');
  else if (params.intent === 'Gym') notes.push("Découpe les séries de gym tôt pour éviter l'échec musculaire.");
  else notes.push('Enchaîne les filières : gère la transition entre charge et cardio.');

  if (has('muscle-up') || has('chest-to-bar')) notes.push('Mouvement avancé : casse les séries en petits blocs dès le début.');
  if (has('thruster') || has('clean') || has('snatch')) notes.push('Sur la barre : cycles fluides, respire en haut du mouvement.');
  if (has('row') || has('bike') || has('ski') || has('run')) notes.push('Le cardio est ton temps de récup actif — ne pars pas trop fort.');
  if (params.format !== 'Solo') notes.push(`${params.format} : partagez le travail (you go / I go) et gardez le rythme.`);

  notes.push(`Score : ${scoreType(method)}.`);
  return notes.slice(0, 5);
}

// ============================ Benchmark WODs (Girls + Open) ============================
// Catalogue de vrais WODs nommés. Charges = RX officiel fixe (Homme/Femme), PAS de scaling.
// WODs multi-parties (15.1+15.1a, 21.3+21.4, 23.2a+23.2b...) = plusieurs blocks.

interface NamedMove { name: string; reps?: string; load?: string; }
interface NamedBlock { label?: string; structure: string; scheme: string; rest?: string; moves: NamedMove[]; }
interface NamedWodDef { name: string; cat: 'Girl' | 'Open'; cap: number; score: string; tip: string; blocks: NamedBlock[]; }

const SC_TIME = 'temps total';
const SC_AMRAP = 'tours + reps';

const GIRL_WODS: NamedWodDef[] = [
  { name: 'Fran', cat: 'Girl', cap: 8, score: SC_TIME, tip: 'Fractionne : 12+9 / 8+7 / 5+4.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9', moves: [{ name: 'Thrusters', load: '43/30 kg' }, { name: 'Pull-ups' }] }] },
  { name: 'Grace', cat: 'Girl', cap: 8, score: SC_TIME, tip: 'Singles rapides ou touch-and-go, trouve ton rythme.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'Clean & Jerk', reps: '30', load: '61/43 kg' }] }] },
  { name: 'Isabel', cat: 'Girl', cap: 8, score: SC_TIME, tip: 'Snatch en singles propres, pas de repos long.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'Snatches', reps: '30', load: '61/43 kg' }] }] },
  { name: 'Helen', cat: 'Girl', cap: 12, score: SC_TIME, tip: 'La course prépare, les KB fatiguent, les pull-ups finissent.', blocks: [{ structure: 'FOR TIME', scheme: '3 tours', moves: [{ name: 'Run', reps: '400m' }, { name: 'KB Swings', reps: '21', load: '24/16 kg' }, { name: 'Pull-ups', reps: '12' }] }] },
  { name: 'Diane', cat: 'Girl', cap: 8, score: SC_TIME, tip: 'Les HSPU sont le bottleneck, gère ta fatigue d\u2019épaule.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9', moves: [{ name: 'Deadlifts', load: '102/70 kg' }, { name: 'Handstand Push-ups' }] }] },
  { name: 'Elizabeth', cat: 'Girl', cap: 10, score: SC_TIME, tip: 'Les cleans lourds fatiguent les bras pour les dips.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9', moves: [{ name: 'Cleans', load: '61/43 kg' }, { name: 'Ring Dips' }] }] },
  { name: 'Amanda', cat: 'Girl', cap: 10, score: SC_TIME, tip: 'Chaque rep compte, qualité avant vitesse.', blocks: [{ structure: 'FOR TIME', scheme: '9-7-5', moves: [{ name: 'Ring Muscle-ups' }, { name: 'Squat Snatches', load: '61/43 kg' }] }] },
  { name: 'Angie', cat: 'Girl', cap: 20, score: SC_TIME, tip: 'Dans l\u2019ordre : finis chaque mouvement avant le suivant.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time (dans l\u2019ordre)', moves: [{ name: 'Pull-ups', reps: '100' }, { name: 'Push-ups', reps: '100' }, { name: 'Sit-ups', reps: '100' }, { name: 'Air Squats', reps: '100' }] }] },
  { name: 'Barbara', cat: 'Girl', cap: 35, score: SC_TIME, tip: 'Chaque round doit être constant, gère le repos de 3 min.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours', rest: '3 min entre les tours', moves: [{ name: 'Pull-ups', reps: '20' }, { name: 'Push-ups', reps: '30' }, { name: 'Sit-ups', reps: '40' }, { name: 'Air Squats', reps: '50' }] }] },
  { name: 'Chelsea', cat: 'Girl', cap: 30, score: 'régularité par minute', tip: 'Tiens le rythme chaque minute le plus longtemps possible.', blocks: [{ structure: 'EMOM', scheme: 'EMOM 30 min', moves: [{ name: 'Pull-ups', reps: '5' }, { name: 'Push-ups', reps: '10' }, { name: 'Air Squats', reps: '15' }] }] },
  { name: 'Cindy', cat: 'Girl', cap: 20, score: SC_AMRAP, tip: 'Rythme constant. Objectif 20+ tours en RX.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Pull-ups', reps: '5' }, { name: 'Push-ups', reps: '10' }, { name: 'Air Squats', reps: '15' }] }] },
  { name: 'Mary', cat: 'Girl', cap: 20, score: SC_AMRAP, tip: 'La technique prime sur la vitesse.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Handstand Push-ups', reps: '5' }, { name: 'Pistols', reps: '10' }, { name: 'Pull-ups', reps: '15' }] }] },
  { name: 'Nicole', cat: 'Girl', cap: 20, score: SC_AMRAP, tip: 'Note tes pull-ups à chaque tour, la course est ta récup.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Run', reps: '400m' }, { name: 'Pull-ups', reps: 'max' }] }] },
  { name: 'Annie', cat: 'Girl', cap: 10, score: SC_TIME, tip: 'Les DU sont la clé. Si tu casses, calme-toi et repars.', blocks: [{ structure: 'FOR TIME', scheme: '50-40-30-20-10', moves: [{ name: 'Double-unders' }, { name: 'Sit-ups' }] }] },
  { name: 'Nancy', cat: 'Girl', cap: 20, score: SC_TIME, tip: 'Les OHS après la course sont brutaux, garde le buste gainé.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours', moves: [{ name: 'Run', reps: '400m' }, { name: 'Overhead Squats', reps: '15', load: '43/30 kg' }] }] },
  { name: 'Karen', cat: 'Girl', cap: 12, score: SC_TIME, tip: 'Séries de 25 minimum, ne pose pas le ballon plus de 3s.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'Wall Balls', reps: '150', load: '9/6 kg (cible 10/9 ft)' }] }] },
  { name: 'Kelly', cat: 'Girl', cap: 30, score: SC_TIME, tip: 'Long WOD, gère ton allure dès le départ.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours', moves: [{ name: 'Run', reps: '400m' }, { name: 'Box Jumps', reps: '30', load: '60/50 cm' }, { name: 'Wall Balls', reps: '30', load: '9/6 kg' }] }] },
  { name: 'Jackie', cat: 'Girl', cap: 12, score: SC_TIME, tip: 'Le row est ta mise en route, explose sur les thrusters.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'Row', reps: '1000m' }, { name: 'Thrusters', reps: '50', load: '20 kg' }, { name: 'Pull-ups', reps: '30' }] }] },
  { name: 'Eva', cat: 'Girl', cap: 40, score: SC_TIME, tip: 'Très long et lourd, fractionne tôt les KB et pull-ups.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours', moves: [{ name: 'Run', reps: '800m' }, { name: 'KB Swings', reps: '30', load: '32/24 kg' }, { name: 'Pull-ups', reps: '30' }] }] },
  { name: 'Linda', cat: 'Girl', cap: 30, score: SC_TIME, tip: '\u00ab 3 bars of death \u00bb : charges en % de ton poids de corps.', blocks: [{ structure: 'FOR TIME', scheme: '10-9-8-7-6-5-4-3-2-1', moves: [{ name: 'Deadlift', load: '1.5\u00d7PC' }, { name: 'Bench Press', load: '1\u00d7PC' }, { name: 'Clean', load: '0.75\u00d7PC' }] }] },
  { name: 'Candy', cat: 'Girl', cap: 20, score: SC_TIME, tip: 'Bodyweight pur, garde un rythme régulier.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours', moves: [{ name: 'Pull-ups', reps: '20' }, { name: 'Push-ups', reps: '40' }, { name: 'Air Squats', reps: '60' }] }] },
];

// CrossFit Open 2011 -> 2026. Charges RX officielles converties en kg.
// Les échelles (ladders) et paliers sont résumés en texte. Multi-parties = plusieurs blocks.
const OPEN_WODS: NamedWodDef[] = [
  // ---- 2011 ----
  { name: 'Open 11.1', cat: 'Open', cap: 10, score: SC_AMRAP, tip: 'Snatch léger, transitions courtes sur les DU.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 10 min', moves: [{ name: 'Double-unders', reps: '30' }, { name: 'Power Snatches', reps: '15', load: '34/25 kg' }] }] },
  { name: 'Open 11.2', cat: 'Open', cap: 15, score: SC_AMRAP, tip: 'Gère le grip entre deadlifts et push-ups.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 15 min', moves: [{ name: 'Deadlifts', reps: '9', load: '70/45 kg' }, { name: 'Push-ups (hand-release)', reps: '12' }, { name: 'Box Jumps', reps: '15', load: '60/50 cm' }] }] },
  { name: 'Open 11.3', cat: 'Open', cap: 5, score: 'reps', tip: 'Sprint de 5 min, enchaîne les singles.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 5 min', moves: [{ name: 'Squat Clean & Jerk', reps: 'max', load: '75/50 kg' }] }] },
  { name: 'Open 11.4', cat: 'Open', cap: 10, score: SC_AMRAP, tip: 'Les OHS et muscle-ups sont le mur.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 10 min', moves: [{ name: 'Bar-facing Burpees', reps: '60' }, { name: 'Overhead Squats', reps: '30', load: '54/40 kg' }, { name: 'Muscle-ups', reps: '10' }] }] },
  { name: 'Open 11.5', cat: 'Open', cap: 20, score: SC_AMRAP, tip: 'Rythme régulier, le wall ball est la récup active.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Power Cleans', reps: '5', load: '65/45 kg' }, { name: 'Toes-to-Bar', reps: '10' }, { name: 'Wall Balls', reps: '15', load: '9/6 kg' }] }] },
  { name: 'Open 11.6', cat: 'Open', cap: 7, score: SC_AMRAP, tip: 'Échelle montante, casse les C2B tôt.', blocks: [{ structure: 'AMRAP', scheme: '3-6-9-12… (montée par 3)', moves: [{ name: 'Thrusters', load: '45/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  // ---- 2012 ----
  { name: 'Open 12.1', cat: 'Open', cap: 7, score: 'reps', tip: 'Max burpees, garde une cadence soutenable.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 7 min', moves: [{ name: 'Burpees', reps: 'max', load: 'cible +15 cm' }] }] },
  { name: 'Open 12.2', cat: 'Open', cap: 10, score: 'reps', tip: 'Le poids monte : avance vite sur le léger.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 10 min (poids croissant)', moves: [{ name: 'Snatches', reps: '30', load: '34/20 kg' }, { name: 'Snatches', reps: '30', load: '61/34 kg' }, { name: 'Snatches', reps: '30', load: '75/45 kg' }, { name: 'Snatches', reps: 'max', load: '95/52 kg' }] }] },
  { name: 'Open 12.3', cat: 'Open', cap: 18, score: SC_AMRAP, tip: 'AMRAP long, transitions propres.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 18 min', moves: [{ name: 'Box Jumps', reps: '15', load: '60/50 cm' }, { name: 'Push Press', reps: '12', load: '52/34 kg' }, { name: 'Toes-to-Bar', reps: '9' }] }] },
  { name: 'Open 12.4', cat: 'Open', cap: 12, score: 'reps', tip: 'Karen + DU + muscle-ups : pace le wall ball.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 12 min', moves: [{ name: 'Wall Balls', reps: '150', load: '9/6 kg' }, { name: 'Double-unders', reps: '90' }, { name: 'Muscle-ups', reps: '30' }] }] },
  { name: 'Open 12.5', cat: 'Open', cap: 7, score: SC_AMRAP, tip: 'Échelle montante thruster + C2B.', blocks: [{ structure: 'AMRAP', scheme: '3-6-9… (montée par 3)', moves: [{ name: 'Thrusters', load: '45/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  // ---- 2013 ----
  { name: 'Open 13.1', cat: 'Open', cap: 17, score: 'reps', tip: 'Échelle burpees + snatch de plus en plus lourd.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 17 min (échelle)', moves: [{ name: 'Burpees', reps: '40' }, { name: 'Snatches', reps: '30', load: '34/20 kg' }, { name: 'Burpees', reps: '30' }, { name: 'Snatches', reps: '30', load: '61/34 kg' }, { name: 'Burpees', reps: '20' }, { name: 'Snatches', reps: '30', load: '75/45 kg' }, { name: 'Burpees', reps: '10' }, { name: 'Snatches', reps: 'max', load: '95/52 kg' }] }] },
  { name: 'Open 13.2', cat: 'Open', cap: 10, score: SC_AMRAP, tip: 'Rythme constant sur les 3 mouvements.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 10 min', moves: [{ name: 'Shoulder-to-Overhead', reps: '5', load: '52/34 kg' }, { name: 'Deadlifts', reps: '10', load: '52/34 kg' }, { name: 'Box Jumps', reps: '15', load: '60/50 cm' }] }] },
  { name: 'Open 13.3', cat: 'Open', cap: 12, score: 'reps', tip: 'Reprise du 12.4.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 12 min', moves: [{ name: 'Wall Balls', reps: '150', load: '9/6 kg' }, { name: 'Double-unders', reps: '90' }, { name: 'Muscle-ups', reps: '30' }] }] },
  { name: 'Open 13.4', cat: 'Open', cap: 7, score: SC_AMRAP, tip: 'Échelle C&J + T2B.', blocks: [{ structure: 'AMRAP', scheme: '3-6-9… (montée par 3)', moves: [{ name: 'Clean & Jerk', load: '61/43 kg' }, { name: 'Toes-to-Bar' }] }] },
  { name: 'Open 13.5', cat: 'Open', cap: 4, score: 'reps', tip: '+4 min à chaque palier de 90 reps atteint.', blocks: [{ structure: 'AMRAP', scheme: '4 min (+4 min / 90 reps)', moves: [{ name: 'Thrusters', reps: '15', load: '45/29 kg' }, { name: 'Chest-to-Bar', reps: '15' }] }] },
  // ---- 2014 ----
  { name: 'Open 14.1', cat: 'Open', cap: 10, score: SC_AMRAP, tip: 'Reprise du 11.1.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 10 min', moves: [{ name: 'Double-unders', reps: '30' }, { name: 'Power Snatches', reps: '15', load: '34/25 kg' }] }] },
  { name: 'Open 14.2', cat: 'Open', cap: 20, score: 'reps', tip: 'Tant que tu finis dans les 3 min, tu continues (10-10, 12-12…).', blocks: [{ structure: 'FOR TIME', scheme: 'Toutes les 3 min (montée)', moves: [{ name: 'Overhead Squats', load: '43/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  { name: 'Open 14.3', cat: 'Open', cap: 8, score: 'reps', tip: 'Deadlifts de plus en plus lourds, 15 box jumps entre chaque.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 8 min (poids croissant)', moves: [{ name: 'Deadlifts (10-15-20-25-…)', load: '61→84→102→125 kg' }, { name: 'Box Jumps', reps: '15 entre chaque', load: '60/50 cm' }] }] },
  { name: 'Open 14.4', cat: 'Open', cap: 14, score: 'reps', tip: 'Chipper : pars fort sur le row, les MU sont le bonus.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 14 min', moves: [{ name: 'Row', reps: '60 cal' }, { name: 'Toes-to-Bar', reps: '50' }, { name: 'Wall Balls', reps: '40', load: '9/6 kg' }, { name: 'Cleans', reps: '30', load: '61/43 kg' }, { name: 'Muscle-ups', reps: '20' }] }] },
  { name: 'Open 14.5', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Pas de time cap réel : fractionne les thrusters.', blocks: [{ structure: 'FOR TIME', scheme: '21-18-15-12-9-6-3', moves: [{ name: 'Thrusters', load: '43/29 kg' }, { name: 'Bar-facing Burpees' }] }] },
  // ---- 2015 ----
  { name: 'Open 15.1', cat: 'Open', cap: 15, score: 'tours + reps / charge max', tip: '15.1 (AMRAP 9 min) enchaîné avec 15.1a (1-RM Clean & Jerk en 6 min).', blocks: [
    { label: 'Partie A — 15.1', structure: 'AMRAP', scheme: 'AMRAP 9 min', moves: [{ name: 'Toes-to-Bar', reps: '15' }, { name: 'Deadlifts', reps: '10', load: '52/34 kg' }, { name: 'Snatches', reps: '5', load: '52/34 kg' }] },
    { label: 'Partie B — 15.1a', structure: '1-RM', scheme: '6 min', moves: [{ name: 'Clean & Jerk', reps: '1-RM' }] },
  ] },
  { name: 'Open 15.2', cat: 'Open', cap: 20, score: 'reps', tip: 'Reprise du 14.2 (montée toutes les 3 min).', blocks: [{ structure: 'FOR TIME', scheme: 'Toutes les 3 min (montée)', moves: [{ name: 'Overhead Squats', load: '43/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  { name: 'Open 15.3', cat: 'Open', cap: 14, score: SC_AMRAP, tip: 'Les muscle-ups dictent ton rythme.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 14 min', moves: [{ name: 'Muscle-ups', reps: '7' }, { name: 'Wall Balls', reps: '50', load: '9/6 kg' }, { name: 'Double-unders', reps: '100' }] }] },
  { name: 'Open 15.4', cat: 'Open', cap: 8, score: 'reps', tip: 'Échelle HSPU (3-6-9-12…) avec cleans lourds intercalés.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 8 min (échelle)', moves: [{ name: 'Handstand Push-ups', reps: '3-6-9-12…' }, { name: 'Cleans', reps: '3 (puis 6…)', load: '84/56 kg' }] }] },
  { name: 'Open 15.5', cat: 'Open', cap: 12, score: SC_TIME, tip: 'Le rameur monte vite en calories.', blocks: [{ structure: 'FOR TIME', scheme: '27-21-15-9', moves: [{ name: 'Row', reps: '(calories)' }, { name: 'Thrusters', load: '43/29 kg' }] }] },
  // ---- 2016 ----
  { name: 'Open 16.1', cat: 'Open', cap: 20, score: SC_AMRAP, tip: 'Lunge overhead = gainage. Reste droit.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Overhead Walking Lunge', reps: '7,62m', load: '43/29 kg' }, { name: 'Bar-facing Burpees', reps: '8' }, { name: 'Overhead Walking Lunge', reps: '7,62m', load: '43/29 kg' }, { name: 'Chest-to-Bar', reps: '8' }] }] },
  { name: 'Open 16.2', cat: 'Open', cap: 20, score: 'reps', tip: 'Squat cleans de plus en plus lourds toutes les 4 min.', blocks: [{ structure: 'FOR TIME', scheme: 'Toutes les 4 min (poids croissant)', moves: [{ name: 'Toes-to-Bar', reps: '25' }, { name: 'Double-unders', reps: '50' }, { name: 'Squat Cleans', reps: '15', load: '61→143 kg' }] }] },
  { name: 'Open 16.3', cat: 'Open', cap: 7, score: SC_AMRAP, tip: 'Bar muscle-ups limitants, snatch en singles.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 7 min', moves: [{ name: 'Power Snatches', reps: '10', load: '34/25 kg' }, { name: 'Bar Muscle-ups', reps: '3' }] }] },
  { name: 'Open 16.4', cat: 'Open', cap: 13, score: 'reps', tip: 'Chipper costaud : pace le deadlift.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 13 min', moves: [{ name: 'Deadlifts', reps: '55', load: '102/70 kg' }, { name: 'Wall Balls', reps: '55', load: '9/6 kg' }, { name: 'Row', reps: '55 cal' }, { name: 'Handstand Push-ups', reps: '55' }] }] },
  { name: 'Open 16.5', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Reprise du 14.5.', blocks: [{ structure: 'FOR TIME', scheme: '21-18-15-12-9-6-3', moves: [{ name: 'Thrusters', load: '43/29 kg' }, { name: 'Bar-facing Burpees' }] }] },
  // ---- 2017 ----
  { name: 'Open 17.1', cat: 'Open', cap: 20, score: SC_TIME, tip: 'DB snatch alternés, 15 burpee box jump-overs entre chaque set.', blocks: [{ structure: 'FOR TIME', scheme: '10-20-30-40-50', moves: [{ name: 'DB Snatches', load: '22.5/15 kg' }, { name: 'Burpee Box Jump-Overs', reps: '15 entre chaque', load: '60/50 cm' }] }] },
  { name: 'Open 17.2', cat: 'Open', cap: 12, score: SC_AMRAP, tip: '2 tours en T2B puis 2 tours en bar muscle-ups.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 12 min', moves: [{ name: 'DB Walking Lunge', reps: '15,24m', load: '2×22.5/15 kg' }, { name: 'Toes-to-Bar (puis Bar Muscle-ups)', reps: '16' }, { name: 'DB Power Cleans', reps: '8', load: '2×22.5/15 kg' }] }] },
  { name: 'Open 17.3', cat: 'Open', cap: 24, score: 'reps', tip: 'Échelle à caps progressifs : C2B + squat snatch de plus en plus lourd.', blocks: [{ structure: 'FOR TIME', scheme: 'Échelle (caps progressifs)', moves: [{ name: 'Chest-to-Bar', reps: 'croissant' }, { name: 'Squat Snatch', load: '43→111 kg' }] }] },
  { name: 'Open 17.4', cat: 'Open', cap: 13, score: 'reps', tip: 'Reprise du 16.4.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 13 min', moves: [{ name: 'Deadlifts', reps: '55', load: '102/70 kg' }, { name: 'Wall Balls', reps: '55', load: '9/6 kg' }, { name: 'Row', reps: '55 cal' }, { name: 'Handstand Push-ups', reps: '55' }] }] },
  { name: 'Open 17.5', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Thrusters unbroken ou 5+4, DU réguliers.', blocks: [{ structure: 'FOR TIME', scheme: '10 tours', moves: [{ name: 'Thrusters', reps: '9', load: '43/29 kg' }, { name: 'Double-unders', reps: '35' }] }] },
  // ---- 2018 ----
  { name: 'Open 18.1', cat: 'Open', cap: 20, score: SC_AMRAP, tip: 'Long AMRAP : transitions et rythme.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Toes-to-Bar', reps: '8' }, { name: 'DB Hang Clean & Jerks', reps: '10 (5/bras)', load: '22.5/15 kg' }, { name: 'Row', reps: '14/12 cal' }] }] },
  { name: 'Open 18.2', cat: 'Open', cap: 12, score: 'temps total / charge max', tip: '18.2 (1-2-…-10 for time) enchaîné avec 18.2a (1-RM Clean), cap commun 12 min.', blocks: [
    { label: 'Partie A — 18.2', structure: 'FOR TIME', scheme: '1-2-3-…-10', moves: [{ name: 'DB Front Squats', load: '2×22.5/15 kg' }, { name: 'Bar-facing Burpees' }] },
    { label: 'Partie B — 18.2a', structure: '1-RM', scheme: '1-RM Clean (dans le cap)', moves: [{ name: 'Clean', reps: '1-RM' }] },
  ] },
  { name: 'Open 18.3', cat: 'Open', cap: 14, score: SC_AMRAP, tip: '2 tours, les DU rythment tout.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 14 min (2 tours)', moves: [{ name: 'Double-unders', reps: '100' }, { name: 'Overhead Squats', reps: '20', load: '52/36 kg' }, { name: 'Double-unders', reps: '100' }, { name: 'Ring Muscle-ups', reps: '12' }, { name: 'Double-unders', reps: '100' }, { name: 'DB Snatches', reps: '20', load: '22.5/15 kg' }, { name: 'Double-unders', reps: '100' }, { name: 'Bar Muscle-ups', reps: '12' }] }] },
  { name: 'Open 18.4', cat: 'Open', cap: 9, score: SC_TIME, tip: 'Diane lourde + handstand walk si tu avances vite.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9 (x2)', moves: [{ name: 'Deadlifts', reps: '21-15-9', load: '102/70 kg' }, { name: 'Handstand Push-ups', reps: '21-15-9' }, { name: 'Deadlifts', reps: '21-15-9', load: '143/93 kg' }, { name: 'Handstand Walk', reps: '15,24m après chaque set' }] }] },
  { name: 'Open 18.5', cat: 'Open', cap: 7, score: SC_AMRAP, tip: 'Reprise du 11.6 / 12.5.', blocks: [{ structure: 'AMRAP', scheme: '3-6-9… (montée par 3)', moves: [{ name: 'Thrusters', load: '45/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  // ---- 2019 ----
  { name: 'Open 19.1', cat: 'Open', cap: 15, score: SC_AMRAP, tip: 'Simple mais brutal : pace le wall ball.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 15 min', moves: [{ name: 'Wall Balls', reps: '19', load: '9/6 kg' }, { name: 'Row', reps: '19 cal' }] }] },
  { name: 'Open 19.2', cat: 'Open', cap: 20, score: 'reps', tip: 'Reprise du 16.2 (squat cleans croissants toutes les 4 min).', blocks: [{ structure: 'FOR TIME', scheme: 'Toutes les 4 min (poids croissant)', moves: [{ name: 'Toes-to-Bar', reps: '25' }, { name: 'Double-unders', reps: '50' }, { name: 'Squat Cleans', reps: '15', load: '61→143 kg' }] }] },
  { name: 'Open 19.3', cat: 'Open', cap: 10, score: SC_TIME, tip: 'Tout sur les épaules : gère les HSPU et le handstand walk.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'DB Overhead Lunge', reps: '60m', load: '22.5/15 kg' }, { name: 'DB Box Step-Ups', reps: '50', load: '60/50 cm' }, { name: 'Strict HSPU', reps: '50' }, { name: 'Handstand Walk', reps: '60m' }] }] },
  { name: 'Open 19.4', cat: 'Open', cap: 12, score: SC_TIME, tip: '3 tours snatch/burpees, repos, 3 tours muscle-ups/burpees.', blocks: [{ structure: 'FOR TIME', scheme: '3 tours + 3 tours', moves: [{ name: 'Snatches', reps: '10', load: '43/29 kg' }, { name: 'Bar-facing Burpees', reps: '12' }, { name: 'Bar Muscle-ups (2e partie)', reps: '10' }, { name: 'Bar-facing Burpees', reps: '12' }] }] },
  { name: 'Open 19.5', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Gros volume : fractionne tôt.', blocks: [{ structure: 'FOR TIME', scheme: '33-27-21-15-9', moves: [{ name: 'Thrusters', load: '43/29 kg' }, { name: 'Chest-to-Bar' }] }] },
  // ---- 2020 ----
  { name: 'Open 20.1', cat: 'Open', cap: 15, score: SC_TIME, tip: 'G2O en singles propres, burpees réguliers.', blocks: [{ structure: 'FOR TIME', scheme: '10 tours', moves: [{ name: 'Ground-to-Overhead', reps: '8', load: '43/29 kg' }, { name: 'Bar-facing Burpees', reps: '10' }] }] },
  { name: 'Open 20.2', cat: 'Open', cap: 20, score: SC_AMRAP, tip: 'AMRAP fluide, ne casse pas le rythme.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'DB Thrusters', reps: '4', load: '2×22.5/15 kg' }, { name: 'Toes-to-Bar', reps: '6' }, { name: 'Double-unders', reps: '24' }] }] },
  { name: 'Open 20.3', cat: 'Open', cap: 9, score: SC_TIME, tip: 'Reprise du 18.4.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9 (x2)', moves: [{ name: 'Deadlifts', reps: '21-15-9', load: '102/70 kg' }, { name: 'Handstand Push-ups', reps: '21-15-9' }, { name: 'Deadlifts', reps: '21-15-9', load: '143/93 kg' }, { name: 'Handstand Walk', reps: '15,24m après chaque set' }] }] },
  { name: 'Open 20.4', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Cleans de plus en plus lourds, pistols entre les paliers.', blocks: [{ structure: 'FOR TIME', scheme: 'Échelle (poids croissant)', moves: [{ name: 'Box Jumps', reps: '30', load: '60/50 cm' }, { name: 'Cleans (15→10→5)', load: '43→125 kg' }, { name: 'Pistols', reps: '30' }] }] },
  { name: 'Open 20.5', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Partition libre : découpe wall balls et MU intelligemment.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time (partition libre)', moves: [{ name: 'Ring Muscle-ups', reps: '40' }, { name: 'Row', reps: '80 cal' }, { name: 'Wall Balls', reps: '120', load: '9/6 kg' }] }] },
  // ---- 2021 ----
  { name: 'Open 21.1', cat: 'Open', cap: 15, score: SC_TIME, tip: 'Wall walks = technique, DU réguliers.', blocks: [{ structure: 'FOR TIME', scheme: 'Échelle', moves: [{ name: 'Wall Walks', reps: '1-3-6-9-15' }, { name: 'Double-unders', reps: '10-30-60-90-150' }] }] },
  { name: 'Open 21.2', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Reprise du 17.1.', blocks: [{ structure: 'FOR TIME', scheme: '10-20-30-40-50', moves: [{ name: 'DB Snatches', load: '22.5/15 kg' }, { name: 'Burpee Box Jump-Overs', reps: '15 entre chaque', load: '60/50 cm' }] }] },
  { name: 'Open 21.3', cat: 'Open', cap: 22, score: 'temps (21.3) / charge max (21.4)', tip: '21.3 (15 min cap) enchaîné directement avec 21.4 (complexe charge max, 7 min). Barre 43/29 kg.', blocks: [
    { label: 'Partie A — 21.3', structure: 'FOR TIME', scheme: '15 min cap — barre 43/29 kg', moves: [
      { name: 'Front Squats', reps: '15', load: '43/29 kg' }, { name: 'Toes-to-Bar', reps: '30' }, { name: 'Thrusters', reps: '15', load: '43/29 kg' },
      { name: 'Repos 1 min' },
      { name: 'Front Squats', reps: '15', load: '43/29 kg' }, { name: 'Chest-to-Bar Pull-ups', reps: '30' }, { name: 'Thrusters', reps: '15', load: '43/29 kg' },
      { name: 'Repos 1 min' },
      { name: 'Front Squats', reps: '15', load: '43/29 kg' }, { name: 'Bar Muscle-ups', reps: '30' }, { name: 'Thrusters', reps: '15', load: '43/29 kg' },
    ] },
    { label: 'Partie B — 21.4', structure: 'CHARGE MAX', scheme: '7 min — complexe pour charge max', moves: [
      { name: '1 Deadlift + 1 Clean + 1 Hang Clean + 1 Jerk', reps: 'Charge max' },
    ] },
  ] },
  // ---- 2022 ----
  { name: 'Open 22.1', cat: 'Open', cap: 15, score: SC_AMRAP, tip: 'Wall walks lents et contrôlés, DB snatch alternés.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 15 min', moves: [{ name: 'Wall Walks', reps: '3' }, { name: 'DB Snatches', reps: '12', load: '22.5/15 kg' }, { name: 'DB Box Step-Ups', reps: '15', load: '60/50 cm' }] }] },
  { name: 'Open 22.2', cat: 'Open', cap: 10, score: SC_TIME, tip: 'Montée puis descente (1→10→1), grip = clé.', blocks: [{ structure: 'FOR TIME', scheme: '1-2-…-10-9-…-1', moves: [{ name: 'Deadlifts', load: '102/70 kg' }, { name: 'Bar-facing Burpees' }] }] },
  { name: 'Open 22.3', cat: 'Open', cap: 12, score: SC_TIME, tip: 'Thrusters de plus en plus lourds, gym de plus en plus dure.', blocks: [{ structure: 'FOR TIME', scheme: 'Chipper', moves: [{ name: 'Pull-ups', reps: '21' }, { name: 'Double-unders', reps: '42' }, { name: 'Thrusters', reps: '21', load: '43/29 kg' }, { name: 'Chest-to-Bar', reps: '18' }, { name: 'Double-unders', reps: '36' }, { name: 'Thrusters', reps: '18', load: '52/38 kg' }, { name: 'Bar Muscle-ups', reps: '15' }, { name: 'Double-unders', reps: '30' }, { name: 'Thrusters', reps: '15', load: '61/43 kg' }] }] },
  // ---- 2023 ----
  { name: 'Open 23.1', cat: 'Open', cap: 14, score: 'reps', tip: 'Reprise du 14.4.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 14 min', moves: [{ name: 'Row', reps: '60 cal' }, { name: 'Toes-to-Bar', reps: '50' }, { name: 'Wall Balls', reps: '40', load: '9/6 kg' }, { name: 'Cleans', reps: '30', load: '61/43 kg' }, { name: 'Muscle-ups', reps: '20' }] }] },
  { name: 'Open 23.2', cat: 'Open', cap: 20, score: 'tours + reps / charge max', tip: '23.2a (AMRAP 15 min, +5 burpee pull-ups/tour) enchaîné avec 23.2b (1-RM Thruster, 5 min).', blocks: [
    { label: 'Partie A — 23.2a', structure: 'AMRAP', scheme: 'AMRAP 15 min (+5 burpee pull-ups/tour)', moves: [{ name: 'Burpee Pull-ups', reps: '5, 10, 15…' }, { name: 'Shuttle Runs', reps: '10', load: '7,62m' }] },
    { label: 'Partie B — 23.2b', structure: '1-RM', scheme: '5 min — depuis le sol', moves: [{ name: 'Thruster', reps: '1-RM' }] },
  ] },
  { name: 'Open 23.3', cat: 'Open', cap: 12, score: SC_AMRAP, tip: 'Paliers à débloquer (6→9→12 min). Snatch de plus en plus lourd : économise le grip sur les DU.', blocks: [
    { label: 'Partie 1 — cap 6 min', structure: 'AMRAP', scheme: 'AMRAP — cap 6 min', moves: [
      { name: 'Wall Walks', reps: '5' }, { name: 'Double-unders', reps: '50' }, { name: 'Snatches', reps: '15', load: '43/29 kg' },
      { name: 'Wall Walks', reps: '5' }, { name: 'Double-unders', reps: '50' }, { name: 'Snatches', reps: '12', load: '61/43 kg' },
    ] },
    { label: 'Partie 2 — +3 min (si fini)', structure: 'AMRAP', scheme: 'cap 9 min', moves: [
      { name: 'Strict Handstand Push-ups', reps: '20' }, { name: 'Double-unders', reps: '50' }, { name: 'Snatches', reps: '9', load: '84/56 kg' },
    ] },
    { label: 'Partie 3 — +3 min (si fini)', structure: 'AMRAP', scheme: 'cap 12 min', moves: [
      { name: 'Strict Handstand Push-ups', reps: '20' }, { name: 'Double-unders', reps: '50' }, { name: 'Snatches', reps: '6', load: '102/70 kg' },
    ] },
  ] },
  // ---- 2024 ----
  { name: 'Open 24.1', cat: 'Open', cap: 15, score: SC_TIME, tip: 'DB snatch par bras, lateral burpees over DB entre les sets.', blocks: [{ structure: 'FOR TIME', scheme: '21-15-9 (par bras)', moves: [{ name: 'DB Snatches bras droit', load: '22.5/15 kg' }, { name: 'Lateral Burpees over DB' }, { name: 'DB Snatches bras gauche', load: '22.5/15 kg' }, { name: 'Lateral Burpees over DB' }] }] },
  { name: 'Open 24.2', cat: 'Open', cap: 20, score: SC_AMRAP, tip: 'Moteur aérobie : pace le row et le deadlift.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 20 min', moves: [{ name: 'Row', reps: '300m' }, { name: 'Deadlifts', reps: '10', load: '84/56 kg' }, { name: 'Double-unders', reps: '50' }] }] },
  { name: 'Open 24.3', cat: 'Open', cap: 15, score: SC_TIME, tip: '5 tours légers en C2B puis 5 tours lourds en bar muscle-ups.', blocks: [{ structure: 'FOR TIME', scheme: '5 tours + 5 tours', moves: [{ name: 'Thrusters', reps: '10', load: '43/29 kg' }, { name: 'Chest-to-Bar', reps: '10' }, { name: 'Thrusters', reps: '7', load: '61/43 kg' }, { name: 'Bar Muscle-ups', reps: '7' }] }] },
  // ---- 2025 ----
  { name: 'Open 25.1', cat: 'Open', cap: 15, score: SC_AMRAP, tip: '+3 reps aux burpees et hang clean-to-overhead à chaque tour.', blocks: [{ structure: 'AMRAP', scheme: 'AMRAP 15 min (+3 reps/tour)', moves: [{ name: 'Lateral Burpees over DB', reps: '3…', load: '22.5/15 kg' }, { name: 'DB Hang Clean-to-Overhead', reps: '3…', load: '22.5/15 kg' }, { name: 'Walking Lunge', reps: '9,14m' }] }] },
  { name: 'Open 25.2', cat: 'Open', cap: 12, score: SC_TIME, tip: 'Variante du 22.3, thrusters croissants.', blocks: [{ structure: 'FOR TIME', scheme: 'Chipper', moves: [{ name: 'Pull-ups', reps: '21' }, { name: 'Double-unders', reps: '42' }, { name: 'Thrusters', reps: '21', load: '43/29 kg' }, { name: 'Chest-to-Bar', reps: '18' }, { name: 'Double-unders', reps: '36' }, { name: 'Thrusters', reps: '18', load: '52/34 kg' }, { name: 'Bar Muscle-ups', reps: '15' }, { name: 'Double-unders', reps: '30' }, { name: 'Thrusters', reps: '15', load: '61/38 kg' }] }] },
  { name: 'Open 25.3', cat: 'Open', cap: 20, score: SC_TIME, tip: 'Chipper avec wall walks entre chaque mouvement.', blocks: [{ structure: 'FOR TIME', scheme: 'For Time', moves: [{ name: 'Wall Walks', reps: '5' }, { name: 'Row', reps: '50 cal' }, { name: 'Wall Walks', reps: '5' }, { name: 'Deadlifts', reps: '25', load: '102/70 kg' }, { name: 'Wall Walks', reps: '5' }, { name: 'Cleans', reps: '25', load: '61/38 kg' }, { name: 'Wall Walks', reps: '5' }, { name: 'Snatches', reps: '25', load: '43/29 kg' }, { name: 'Wall Walks', reps: '5' }, { name: 'Row', reps: '50 cal' }] }] },
  // ---- 2026 ----
  { name: 'Open 26.1', cat: 'Open', cap: 12, score: SC_TIME, tip: 'Pyramide de wall balls, box jump-overs aux extrémités, step-overs au centre.', blocks: [{ structure: 'FOR TIME', scheme: 'Pyramide', moves: [{ name: 'Wall Balls (20-30-40-66-40-30-20)', load: '9/6 kg' }, { name: 'Box Jump-Overs', reps: '18 (extérieurs)', load: '60/50 cm' }, { name: 'MB Box Step-Overs', reps: '18 (centre)', load: '9/6 kg' }] }] },
  { name: 'Open 26.2', cat: 'Open', cap: 15, score: SC_TIME, tip: '3 blocs, la gym monte : pull-ups → C2B → ring muscle-ups.', blocks: [{ structure: 'FOR TIME', scheme: '3 blocs', moves: [{ name: 'DB Overhead Walking Lunge', reps: '24,38m', load: '22.5/15 kg' }, { name: 'Alt DB Snatches', reps: '20', load: '22.5/15 kg' }, { name: 'Pull-ups → C2B → Ring Muscle-ups', reps: '20' }] }] },
  { name: 'Open 26.3', cat: 'Open', cap: 16, score: SC_TIME, tip: '2+2+2 tours, charge croissante sur cleans et thrusters.', blocks: [{ structure: 'FOR TIME', scheme: '2+2+2 tours (poids croissant)', moves: [{ name: 'Burpees Over the Bar', reps: '12' }, { name: 'Cleans', reps: '12', load: '43→52→61 kg' }, { name: 'Burpees Over the Bar', reps: '12' }, { name: 'Thrusters', reps: '12', load: '43→52→61 kg' }] }] },
];

const NAMED_WODS: NamedWodDef[] = [...GIRL_WODS, ...OPEN_WODS];

function namedToBlock(b: NamedBlock): Block {
  return {
    label: b.label ?? null,
    structure: b.structure,
    scheme: b.scheme,
    movements: b.moves.map((m) => ({ name: m.name, prescription: m.reps ?? '', load: m.load ?? null, equipment: null, scaling_note: null })),
    rest: b.rest ?? null,
  };
}

function buildNamedCFWod(rng: RNG, params: CFParams, seed: number): CFWod {
  const def = rng.pick(NAMED_WODS);
  const blocks = def.blocks.map(namedToBlock);
  const catLabel = def.cat === 'Girl' ? 'Girl WOD' : 'CrossFit Open';
  return {
    title: def.name,
    level: params.level,
    format: 'Solo',
    duration_min: def.cap,
    intent: params.intent,
    method: blocks[0].structure,
    time_cap_min: def.cap,
    score_type: def.score,
    modifiers: ['Format Benchmark', catLabel],
    warmup: [
      '5 min cardio progressif (rameur/corde/course)',
      '2 tours: 10 air squats / 10 push-ups / 10 hollow rocks + mobilité spécifique',
    ],
    strength: null,
    blocks,
    cooldown: ['3-5 min retour au calme', 'étirements + mobilité des zones sollicitées'],
    coach_notes: [def.tip, 'Charges RX officielles (Homme/Femme).'],
    stimulus: `Benchmark ${catLabel} — ${def.name}.`,
    seed,
  };
}

// ============================ Génération principale ============================

export function generateCFWod(params: CFParams, seed: number): CFWod {
  const rng = new RNG(seed);
  const cap = Math.max(3, Math.round(params.duration_min * (params.method === 'AMRAP' ? 1 : 0.95)));

  if (params.benchmark) return buildNamedCFWod(rng, params, seed);

  let block: Block;
  switch (params.method) {
    case 'For Time': block = buildForTime(rng, params); break;
    case 'AMRAP':    block = buildAmrap(rng, params); break;
    case 'EMOM':     block = buildEmom(rng, params); break;
    case 'Tabata':   block = buildTabata(rng, params); break;
    case 'Max Reps': block = buildMaxReps(rng, params); break;
    default:         block = buildForTime(rng, params);
  }

  const strength = buildStrength(rng, params);
  const method = block.structure;

  return {
    title: makeTitle(rng),
    level: params.level,
    format: params.format,
    duration_min: params.duration_min,
    intent: params.intent,
    method,
    time_cap_min: cap,
    score_type: scoreType(method),
    modifiers: params.benchmark ? ['Format Benchmark'] : [],
    warmup: [
      `${rng.pick([3, 5])} min cardio progressif (rameur/corde/course)`,
      '2 tours: 10 air squats / 10 push-ups / 10 hollow rocks + mobilité spécifique',
    ],
    strength,
    blocks: [block],
    cooldown: ['3-5 min retour au calme', 'étirements + mobilité des zones sollicitées'],
    coach_notes: coachNotes(params, strength ? [strength, block] : [block], method),
    stimulus: INTENT_STIMULUS[params.intent],
    seed,
  };
}

// ============================ Anti-répétition (local) ============================

const GENERIC = new Set(['run', 'row', 'bike erg', 'skierg', 'air squats']);

export function cfSignature(wod: CFWod): string {
  const moves = [...(wod.strength ? wod.strength.movements : []), ...wod.blocks.flatMap((b) => b.movements)]
    .map((m) => m.name.toLowerCase())
    .filter((n) => !GENERIC.has(n));
  return `${wod.method.toLowerCase()}::${[...new Set(moves)].sort().join('|')}`;
}

export function generateFreshCF(params: CFParams, recentSignatures: string[], maxTries = 5): CFWod {
  const seen = new Set(recentSignatures);
  let wod = generateCFWod(params, randomSeed());
  for (let i = 0; i < maxTries && seen.has(cfSignature(wod)); i++) {
    wod = generateCFWod(params, randomSeed());
  }
  return wod;
}
