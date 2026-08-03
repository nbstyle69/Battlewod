/**
 * BattleWOD — Moteur de génération WOD DÉTERMINISTE (mode Hybrid / Hyrox)
 * ======================================================================
 * Pur TypeScript, AUCUNE dépendance, AUCUN appel API au runtime.
 * La variété vient de la combinatoire + d'un générateur aléatoire à graine (seed).
 *
 * Étend librement MOVES / TITLE_* / les templates : c'est là que vit la richesse.
 */

import { RNG, randomSeed } from './rng';

// ============================ Types ============================

export type Category = 'Women' | 'Women Pro' | 'Men' | 'Men Pro';
export type SessionType = 'Interval' | 'Engine' | 'Aerobic' | 'Run Split' | 'Force';
export type HyroxFormat = 'Solo' | 'Doubles' | 'Relais' | 'Mixed Relais';
export type TrainingType = 'Race Simulation' | 'Station Training' | 'Cardio Force' | 'Named WOD';

export interface HyroxParams {
  category: Category;
  duration_min: 20 | 30 | 45 | 60;
  session_type: SessionType;
  format: HyroxFormat;
  training_type: TrainingType;
  equipment: string[]; // chips de l'UI
  vest: 'off' | 'on' | 'optional';
}

export interface Movement {
  name: string; prescription: string; load: string | null;
  equipment: string | null; substitution: string | null;
}
export interface Block {
  label: string | null; structure: string; scheme: string;
  movements: Movement[]; rest: string | null;
}
export interface HyroxWod {
  title: string; category: Category; format: HyroxFormat; duration_min: number;
  session_type: SessionType; rpe: string; training_type: TrainingType;
  structure: string; time_cap_min: number; score_type: string;
  modifiers: string[]; warmup: string[]; blocks: Block[]; cooldown: string[];
  coach_notes: string[]; stimulus: string; seed: number;
}

// ============================ Données de référence ============================

const WEIGHTS: Record<Category, Record<string, string>> = {
  'Women':     { sledPush: '102 kg', sledPull: '78 kg',  farmers: '2×16 kg', sandbag: '10 kg', wallBall: '6 kg / 9ft',  kb: '16 kg', sandbagLoad: '15 kg' },
  'Men':       { sledPush: '152 kg', sledPull: '103 kg', farmers: '2×24 kg', sandbag: '20 kg', wallBall: '9 kg / 10ft', kb: '24 kg', sandbagLoad: '25 kg' },
  'Women Pro': { sledPush: '152 kg', sledPull: '103 kg', farmers: '2×24 kg', sandbag: '20 kg', wallBall: '6 kg / 9ft',  kb: '24 kg', sandbagLoad: '25 kg' },
  'Men Pro':   { sledPush: '202 kg', sledPull: '153 kg', farmers: '2×32 kg', sandbag: '30 kg', wallBall: '9 kg / 10ft', kb: '32 kg', sandbagLoad: '35 kg' },
};

type MoveType = 'station' | 'cardio' | 'sandbag' | 'kb' | 'bodyweight' | 'barbell';
interface MoveDef {
  name: string;
  type: MoveType;
  equipment: string | null;       // chip requise (null = toujours dispo)
  rpe: [number, number];          // bande RPE où le mouvement a du sens
  loadKey: keyof typeof WEIGHTS['Men'] | null;
  force?: boolean;                // mouvement orienté force (session Force)
  substitution: string | null;
  scheme: (rng: RNG, dur: number) => string;
}

// Reps PAR TOUR : ne scale PLUS avec la durée. L'ancien `base20 × dur/20` gonflait
// les reps par tour ALORS QUE le nombre de tours grandit déjà avec la durée →
// volume quadratique (« 68 Alt DB Snatch × 5 RFT » à 45 min). Dans la programmation
// Hyrox réelle, les reps par tour restent courtes et rondes (10/15/20/25) et c'est
// la durée qui pilote le nombre de tours / le cap.
const repScale = (_dur: number, base20: number) => base20;

// Banque de mouvements (extensible)
const MOVES: MoveDef[] = [
  // --- Stations officielles ---
  { name: 'Sled Push', type: 'station', equipment: 'Sled Push', rpe: [5, 9], loadKey: 'sledPush', force: true, substitution: 'Wall Sprint / poussée de plaque',
    scheme: (r) => `${r.pick([25, 50])}m` },
  { name: 'Sled Pull', type: 'station', equipment: 'Sled Pull', rpe: [5, 9], loadKey: 'sledPull', force: true, substitution: "Corde fixe / traction d'objet",
    scheme: (r) => `${r.pick([25, 50])}m` },
  { name: 'Farmers Carry', type: 'station', equipment: 'Farmers Carry', rpe: [5, 8], loadKey: 'farmers', force: true, substitution: 'Tout objet lesté porté',
    scheme: (r) => `${r.pick([100, 200])}m` },
  { name: 'Sandbag Lunge', type: 'station', equipment: 'Sandbag Lunge', rpe: [5, 8], loadKey: 'sandbag', substitution: 'KB/DB lunge ou gilet',
    scheme: (r) => `${r.pick([50, 100])}m` },
  { name: 'Wall Balls', type: 'station', equipment: 'Wall Balls', rpe: [6, 9], loadKey: 'wallBall', substitution: 'Thrusters KB/DB',
    scheme: (r, d) => `${repScale(d, r.pick([15, 20, 25]))} reps` },
  { name: 'Burpee Broad Jump', type: 'bodyweight', equipment: null, rpe: [5, 9], loadKey: null, substitution: null,
    scheme: (r) => `${r.pick([20, 40, 80])}m` },
  // --- Cardio / machines ---
  { name: 'Run', type: 'cardio', equipment: null, rpe: [5, 9], loadKey: null, substitution: 'Row / Bike / Ski (temps équivalent)',
    scheme: (r) => `${r.pick([200, 400, 800, 1000])}m` },
  { name: 'Row', type: 'cardio', equipment: 'RowErg', rpe: [5, 9], loadKey: null, substitution: 'Ski / Bike',
    scheme: (r) => `${r.pick([250, 500, 1000])}m` },
  { name: 'SkiErg', type: 'cardio', equipment: 'SkiErg', rpe: [5, 9], loadKey: null, substitution: 'Row / Bike',
    scheme: (r) => `${r.pick([250, 500, 1000])}m` },
  { name: 'BikeErg', type: 'cardio', equipment: 'BikeErg', rpe: [5, 9], loadKey: null, substitution: 'Row / Ski',
    scheme: (r) => `${r.pick([10, 15, 20, 30])} cal` },
  { name: 'Shuttle Run', type: 'cardio', equipment: null, rpe: [5, 9], loadKey: null, substitution: 'Navette 10m / sprints courts',
    scheme: (r) => `${r.pick([8, 10, 12])}×10m` },
  // --- Sandbag (banque étendue) ---
  { name: 'Sandbag Thruster', type: 'sandbag', equipment: 'Sandbag', rpe: [6, 9], loadKey: 'sandbagLoad', substitution: 'DB/KB thruster',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Sandbag Front Rack Squat', type: 'sandbag', equipment: 'Sandbag', rpe: [6, 8], loadKey: 'sandbagLoad', substitution: 'Goblet squat',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15, 20]))} reps` },
  { name: 'Sandbag S2OH', type: 'sandbag', equipment: 'Sandbag', rpe: [6, 9], loadKey: 'sandbagLoad', substitution: 'DB push press',
    scheme: (r, d) => `${repScale(d, r.pick([8, 12, 15]))} reps` },
  { name: 'Sandbag Bent Over Row', type: 'sandbag', equipment: 'Sandbag', rpe: [6, 8], loadKey: 'sandbagLoad', substitution: 'DB row',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Sandbag Over-the-Shoulder', type: 'sandbag', equipment: 'Sandbag', rpe: [7, 9], loadKey: 'sandbagLoad', substitution: 'DB clean',
    scheme: (r, d) => `${repScale(d, r.pick([8, 12]))} reps` },
  // --- Kettlebell / Haltères ---
  { name: 'KB Swing', type: 'kb', equipment: 'Kettlebell', rpe: [6, 9], loadKey: 'kb', substitution: 'DB swing',
    scheme: (r, d) => `${repScale(d, r.pick([15, 20, 25]))} reps` },
  { name: 'Goblet Squat', type: 'kb', equipment: 'Kettlebell', rpe: [5, 8], loadKey: 'kb', force: true, substitution: 'Air squat lesté',
    scheme: (r, d) => `${repScale(d, r.pick([15, 20]))} reps` },
  { name: 'KB Deadlift', type: 'kb', equipment: 'Kettlebell', rpe: [5, 8], loadKey: 'kb', force: true, substitution: 'DB deadlift',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15, 20]))} reps` },
  { name: 'DB Push Press', type: 'kb', equipment: 'Haltères', rpe: [6, 9], loadKey: 'kb', force: true, substitution: 'KB push press',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Alt DB Snatch', type: 'kb', equipment: 'Haltères', rpe: [7, 9], loadKey: 'kb', substitution: 'KB snatch',
    scheme: (r, d) => `${repScale(d, r.pick([10, 20, 30]))} reps` },
  // --- Poids de corps (aérobie / cardio sans matériel) ---
  { name: 'Burpee', type: 'bodyweight', equipment: null, rpe: [5, 9], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 15, 20]))} reps` },
  { name: 'Burpee over Target', type: 'bodyweight', equipment: null, rpe: [6, 9], loadKey: null, substitution: 'Burpee simple',
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Walking Lunge', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: 'Fentes alternées sur place',
    scheme: (r) => `${r.pick([50, 100, 200])}m` },
  { name: 'Mountain Climbers', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([20, 30]))} reps` },
  { name: 'Bear Crawl', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r) => `${r.pick([15, 20, 30])}m` },
  { name: 'Broad Jump', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Jumping Jacks', type: 'bodyweight', equipment: null, rpe: [5, 7], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([25, 30]))} reps` },
  { name: 'Push-up (HR)', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 15, 20]))} reps` },
  { name: 'Air Squat', type: 'bodyweight', equipment: null, rpe: [5, 7], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([20, 25, 30]))} reps` },
  { name: 'Sit-up', type: 'bodyweight', equipment: null, rpe: [5, 7], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([15, 20]))} reps` },
  // --- Force : poids de corps (aucun matériel) ---
  { name: 'Pistol Squat', type: 'bodyweight', equipment: null, rpe: [6, 8], loadKey: null, force: true, substitution: 'Squat sur boîte / assisté',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10]))} reps (alt.)` },
  { name: 'Bulgarian Split Squat', type: 'bodyweight', equipment: null, rpe: [6, 8], loadKey: null, force: true, substitution: 'Fentes arrière',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10]))} reps/jambe` },
  { name: 'Strict HSPU', type: 'bodyweight', equipment: null, rpe: [6, 9], loadKey: null, force: true, substitution: 'Pike push-up / DB strict press',
    scheme: (r, d) => `${repScale(d, r.pick([5, 8, 10]))} reps` },
  { name: 'Pike Push-up', type: 'bodyweight', equipment: null, rpe: [6, 8], loadKey: null, force: true, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'Diamond Push-up', type: 'bodyweight', equipment: null, rpe: [6, 8], loadKey: null, force: true, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'Single-Leg Glute Bridge', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, force: true, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 12]))} reps/jambe` },
  { name: 'Tempo Air Squat', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, force: true, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps (tempo 3s)` },
  { name: 'Nordic Curl', type: 'bodyweight', equipment: null, rpe: [6, 8], loadKey: null, force: true, substitution: 'Good morning / leg curl',
    scheme: (r, d) => `${repScale(d, r.pick([5, 8]))} reps` },
  { name: 'Strict Pull-up', type: 'bodyweight', equipment: null, rpe: [6, 9], loadKey: null, force: true, substitution: 'Ring rows / tractions assistées',
    scheme: (r, d) => `${repScale(d, r.pick([5, 8, 10]))} reps` },
  // --- Barre (séance FORCE uniquement : aucun builder de metcon ne tire le type 'barbell') ---
  // Les lifts de référence de la préparation Hyrox (back/front squat, deadlift, fentes, row).
  // Pas de poids de catégorie : la charge se prescrit en % du 1RM (posé par buildForceBlocks).
  { name: 'Back Squat', type: 'barbell', equipment: 'Barbell', rpe: [6, 8], loadKey: null, force: true, substitution: 'Goblet squat lourd',
    scheme: (r) => `${r.pick([3, 5])} reps` },
  { name: 'Front Squat', type: 'barbell', equipment: 'Barbell', rpe: [6, 8], loadKey: null, force: true, substitution: 'KB front rack squat',
    scheme: (r) => `${r.pick([3, 5])} reps` },
  { name: 'Deadlift', type: 'barbell', equipment: 'Barbell', rpe: [6, 8], loadKey: null, force: true, substitution: 'KB deadlift lourd',
    scheme: (r) => `${r.pick([3, 5])} reps` },
  { name: 'Barbell Lunge', type: 'barbell', equipment: 'Barbell', rpe: [6, 8], loadKey: null, force: true, substitution: 'DB walking lunge',
    scheme: (r) => `${r.pick([6, 8])} reps/jambe` },
  { name: 'Barbell Bent Over Row', type: 'barbell', equipment: 'Barbell', rpe: [6, 8], loadKey: null, force: true, substitution: 'DB row',
    scheme: (r) => `${r.pick([6, 8])} reps` },
  // --- Grip & gainage (spécifiques Hyrox : farmers, sled, wall balls exigent les deux) ---
  { name: 'Dead Hang', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, force: true, substitution: 'Farmers hold lourd',
    scheme: (r) => `${r.pick([30, 45, 60])}s de suspension` },
  { name: 'Plank Hold', type: 'bodyweight', equipment: null, rpe: [5, 7], loadKey: null, force: true, substitution: null,
    scheme: (r) => `${r.pick([45, 60])}s` },
  // --- Force : Kettlebell ---
  { name: 'KB Romanian Deadlift', type: 'kb', equipment: 'Kettlebell', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'DB RDL',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'KB Front Rack Squat', type: 'kb', equipment: 'Kettlebell', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'Goblet squat',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10]))} reps` },
  { name: 'Single-Arm KB Press', type: 'kb', equipment: 'Kettlebell', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'DB strict press',
    scheme: (r, d) => `${repScale(d, r.pick([6, 8, 10]))} reps/bras` },
  { name: 'KB Bent Over Row', type: 'kb', equipment: 'Kettlebell', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'DB row',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps/bras` },
  { name: 'KB Clean & Press', type: 'kb', equipment: 'Kettlebell', rpe: [6, 9], loadKey: 'kb', force: true, substitution: 'DB clean & press',
    scheme: (r, d) => `${repScale(d, r.pick([6, 8, 10]))} reps/bras` },
  // --- Force : Haltères ---
  { name: 'DB Strict Shoulder Press', type: 'kb', equipment: 'Haltères', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'KB strict press',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'DB Floor Press', type: 'kb', equipment: 'Haltères', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'Push-up lesté',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'DB Romanian Deadlift', type: 'kb', equipment: 'Haltères', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'KB RDL',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
  { name: 'DB Bent Over Row', type: 'kb', equipment: 'Haltères', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'KB row',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps/bras` },
  { name: 'Renegade Row', type: 'kb', equipment: 'Haltères', rpe: [6, 9], loadKey: 'kb', force: true, substitution: 'DB row à genoux',
    scheme: (r, d) => `${repScale(d, r.pick([6, 8, 10]))} reps/bras` },
  { name: 'DB Walking Lunge (lourd)', type: 'kb', equipment: 'Haltères', rpe: [6, 8], loadKey: 'kb', force: true, substitution: 'Goblet lunge',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10]))} reps/jambe` },
  { name: 'DB Thruster', type: 'kb', equipment: 'Haltères', rpe: [6, 9], loadKey: 'kb', force: true, substitution: 'KB thruster',
    scheme: (r, d) => `${repScale(d, r.pick([8, 10, 12]))} reps` },
];

const SESSION: Record<SessionType, { rpe: string; methods: string[]; stimulus: string }> = {
  'Interval':  { rpe: '8-9', methods: ['INTERVAL', 'EMOM', 'AMRAP'], stimulus: "Puissance aérobie / tolérance lactique, efforts courts et intenses." },
  'Engine':    { rpe: '7',   methods: ['AMRAP', 'CHIPPER', 'FOR TIME'], stimulus: "Capacité aérobie soutenue, gestion d'allure sur la durée." },
  'Aerobic':   { rpe: '5-6', methods: ['FOR TIME', 'EMOM'], stimulus: "Base aérobie, allure conversationnelle." },
  'Run Split': { rpe: '8-9', methods: ['INTERVAL'], stimulus: 'Vitesse et seuil de course.' },
  'Force':     { rpe: '6-7', methods: ['STRENGTH'], stimulus: 'Force spécifique, qualité de mouvement sous charge.' },
};

const DURATION: Record<number, { runRange: [number, number]; capPct: number }> = {
  20: { runRange: [200, 400],  capPct: 0.9 },
  30: { runRange: [400, 800],  capPct: 0.9 },
  45: { runRange: [600, 1000], capPct: 0.92 },
  60: { runRange: [800, 1000], capPct: 0.9 },
};

const TITLE_ADJ = ['Iron', 'Savage', 'Phantom', 'Tidal', 'Molten', 'Frost', 'Hollow', 'Vault', 'Ember', 'Granite', 'Apex', 'Crimson', 'Static', 'Nomad', 'Brass'];
const TITLE_NOUN = ['Engine', 'Crucible', 'Redline', 'Gauntlet', 'Forge', 'Ascent', 'Reckoning', 'Circuit', 'Threshold', 'Vortex', 'Anvil', 'Relay', 'Drift', 'Surge', 'Roxzone'];

// ============================ Helpers ============================

const rpeMid = (s: SessionType) => {
  const [a, b] = SESSION[s].rpe.split('-').map(Number);
  return b ? (a + b) / 2 : a;
};

function loadFor(cat: Category, m: MoveDef): string | null {
  return m.loadKey ? WEIGHTS[cat][m.loadKey] ?? null : null;
}

// Salle Hyrox standard : si l'utilisateur ne coche AUCUNE chip, on suppose une salle
// équipée plutôt que de restreindre au poids de corps (même logique que STANDARD_BOX
// côté CF) — sinon les pools s'effondrent et on sort des cartes à 1 seul mouvement.
// La Barre reste OPT-IN (chip explicite) : elle n'entre pas dans le standard.
const HY_STANDARD_EQUIP = [
  'SkiErg', 'RowErg', 'BikeErg', 'Sled Push', 'Sled Pull', 'Farmers Carry',
  'Sandbag Lunge', 'Wall Balls', 'Sandbag', 'Kettlebell', 'Haltères',
];
function effectiveEquipment(params: HyroxParams): string[] {
  return params.equipment.length > 0 ? params.equipment : HY_STANDARD_EQUIP;
}

function isAvailable(m: MoveDef, equipment: string[]): boolean {
  if (m.equipment === null) return true;
  return equipment.includes(m.equipment);
}

// ── Familles de patterns (cohérence : pas deux mouvements « jumeaux » par WOD) ──
// Goblet Squat + Sandbag Front Rack Squat, DB Push Press + Sandbag S2OH, deux rows…
// = même stimulus. Non listé = famille propre.
const PATTERN: Record<string, string[]> = {
  'Goblet Squat': ['squat'], 'KB Front Rack Squat': ['squat'], 'Sandbag Front Rack Squat': ['squat'],
  'Air Squat': ['squat'], 'Tempo Air Squat': ['squat'], 'Pistol Squat': ['squat'],
  'Sandbag Thruster': ['squat', 'press'], 'DB Thruster': ['squat', 'press'], 'Wall Balls': ['squat', 'press'],
  'KB Deadlift': ['hinge'], 'KB Romanian Deadlift': ['hinge'], 'DB Romanian Deadlift': ['hinge'],
  'KB Swing': ['hinge'], 'Nordic Curl': ['hinge'], 'Single-Leg Glute Bridge': ['hinge'],
  'Sandbag Over-the-Shoulder': ['hinge', 'clean'],
  'DB Push Press': ['press'], 'Sandbag S2OH': ['press'], 'DB Strict Shoulder Press': ['press'],
  'Single-Arm KB Press': ['press'], 'KB Clean & Press': ['press', 'clean'],
  'Strict HSPU': ['press', 'push-h'], 'Pike Push-up': ['press', 'push-h'],
  'Diamond Push-up': ['push-h'], 'Push-up (HR)': ['push-h'], 'DB Floor Press': ['push-h'],
  'Sandbag Bent Over Row': ['row'], 'KB Bent Over Row': ['row'], 'DB Bent Over Row': ['row'], 'Renegade Row': ['row', 'push-h'],
  'Strict Pull-up': ['pull'], 'Dead Hang': ['grip'],
  'Alt DB Snatch': ['snatch'],
  'Burpee': ['burpee'], 'Burpee over Target': ['burpee'], 'Burpee Broad Jump': ['burpee'],
  'Walking Lunge': ['lunge'], 'DB Walking Lunge (lourd)': ['lunge'], 'Sandbag Lunge': ['lunge'], 'Bulgarian Split Squat': ['lunge', 'squat'],
  'Farmers Carry': ['carry', 'grip'],
  'Back Squat': ['squat'], 'Front Squat': ['squat'], 'Deadlift': ['hinge'],
  'Barbell Lunge': ['lunge', 'squat'], 'Barbell Bent Over Row': ['row'],
  'Sled Push': ['sled-push'], 'Sled Pull': ['sled-pull'],
  'Run': ['run'], 'Shuttle Run': ['run'], 'Row': ['erg-row'], 'SkiErg': ['erg-ski'], 'BikeErg': ['erg-bike'],
  'Sit-up': ['core'], 'Plank Hold': ['core'], 'Mountain Climbers': ['core'],
  'Broad Jump': ['jump'], 'Jumping Jacks': ['jump'], 'Bear Crawl': ['crawl'],
};
const patternsOf = (m: MoveDef): string[] => PATTERN[m.name] ?? [m.name];

/** Échantillonne en garantissant au plus UN mouvement par famille (déterministe). */
function samplePatternSafe(rng: RNG, pool: MoveDef[], n: number, used?: Set<string>): MoveDef[] {
  const taken = used ?? new Set<string>();
  const out: MoveDef[] = [];
  for (const m of rng.shuffle([...pool])) {
    if (out.length === n) break;
    const ps = patternsOf(m);
    if (ps.some((p) => taken.has(p))) continue;
    ps.forEach((p) => taken.add(p));
    out.push(m);
  }
  return out;
}

function selectMoves(rng: RNG, params: HyroxParams, types: MoveType[], n: number, used?: Set<string>): MoveDef[] {
  const rpe = rpeMid(params.session_type);
  const pool = MOVES.filter(
    (m) => types.includes(m.type) && isAvailable(m, effectiveEquipment(params)) &&
           rpe >= m.rpe[0] && rpe <= m.rpe[1]
  );
  if (pool.length === 0) return [];
  return samplePatternSafe(rng, pool, Math.min(n, pool.length), used);
}

function toMovement(rng: RNG, params: HyroxParams, m: MoveDef): Movement {
  const available = isAvailable(m, effectiveEquipment(params));
  return {
    name: m.name,
    prescription: m.scheme(rng, params.duration_min),
    load: loadFor(params.category, m),
    equipment: m.equipment,
    substitution: available ? null : m.substitution,
  };
}

function makeTitle(rng: RNG): string {
  return `${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUN)}`;
}

function scoreType(method: string): string {
  switch (method) {
    case 'AMRAP': return 'tours complets + reps du tour en cours';
    case 'FOR TIME':
    case 'CHIPPER': return 'temps total';
    case 'EMOM': return 'régularité des reps par minute';
    case 'INTERVAL': return 'reps/distance par intervalle + splits';
    case 'STRENGTH': return 'qualité (ressenti de charge, pas le chrono)';
    default: return 'temps total';
  }
}

function coachNotes(params: HyroxParams, blocks: Block[], method: string): string[] {
  const notes: string[] = [];
  const names = blocks.flatMap((b) => b.movements.map((m) => m.name));
  const has = (s: string) => names.some((n) => n.toLowerCase().includes(s));

  if (params.session_type === 'Force') notes.push('Les charges affichées sont les poids de COURSE : en force, monte au-dessus (RPE 8, ~2 reps en réserve). Qualité avant vitesse.');
  else if (params.session_type === 'Aerobic') notes.push('Allure conversationnelle : tu dois pouvoir parler en bougeant.');
  else if (params.session_type === 'Run Split') notes.push('Cours vite, attaque les reps dès l\'arrivée sans poser la charge, puis repars sur la distance.');
  else notes.push(`Cible ${SESSION[params.session_type].rpe}/10 — pousse mais reste régulier.`);

  if (has('wall ball')) notes.push("Wall balls : découpe en séries (ex. 3×25) dès le départ pour éviter l'échec.");
  if (has('sled')) notes.push('Sled : départ explosif, pousse/tire avec les jambes, pas de pause.');
  if (has('run')) notes.push("Note tes splits de course — c'est souvent là que le chrono se joue.");
  if (params.format === 'Doubles') notes.push('Doubles : un seul travaille à la fois (you go / I go), partage les reps ~50/50.');
  if (params.format.includes('Relais')) notes.push('Relais : chaque athlète enchaîne run + station à son tour.');
  if (params.vest === 'optional') notes.push('Gilet lesté optionnel selon le ressenti.');

  notes.push(`Score : ${scoreType(method)}.`);
  return notes.slice(0, 5);
}

// ============================ Builders ============================

function buildRaceSimulation(rng: RNG, params: HyroxParams): Block {
  const officialOrder = ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunge', 'Wall Balls'];
  // La durée peut être « variée » (42, 38…) : on prend la clé de référence la plus proche.
  const durKeys = Object.keys(DURATION).map(Number);
  const nearest = durKeys.reduce((a, b) => (Math.abs(b - params.duration_min) < Math.abs(a - params.duration_min) ? b : a));
  const [rMin, rMax] = DURATION[nearest].runRange;
  const nStations = params.duration_min <= 20 ? 3 : params.duration_min <= 30 ? 4 : params.duration_min <= 45 ? 6 : 8;
  const chosen = officialOrder.slice(0, nStations);
  // Distance de run FIXE pour toute la sim (une vraie simulation travaille le pacing :
  // en course c'est 8 × 1 km ; en version raccourcie on scale la distance, pas sa variance).
  const runDist = rng.pick([rMin, Math.round((rMin + rMax) / 200) * 100, rMax].filter((v, i, a) => a.indexOf(v) === i));
  const movements: Movement[] = [];
  for (const st of chosen) {
    movements.push({ name: 'Run', prescription: `${runDist}m`, load: null, equipment: null, substitution: 'Row/Bike/Ski' });
    const def = MOVES.find((m) => m.name === st);
    if (def) movements.push(toMovement(rng, params, def));
  }
  return {
    label: null, structure: 'FOR TIME',
    scheme: `Séquence course — ${nStations} × (${runDist}m run + station), ordre officiel`,
    movements, rest: null,
  };
}

// Nombre d'efforts d'une séance d'intervalles selon la durée (formats réels :
// « 5 × 20 wall balls / 60s », « 6 × 25m sled push / 90s », « 5 × 250m SkiErg / 90s »).
const intervalCount = (d: number) => (d <= 20 ? 5 : d <= 30 ? 6 : d <= 45 ? 8 : 10);

/** Bloc INTERVAL réel : n × (un effort court / repos fixe). 1 mouvement principal
 *  (station de préférence), éventuellement alterné avec un second. */
function buildIntervalBlock(rng: RNG, params: HyroxParams): Block {
  const used = new Set<string>();
  const primary = selectMoves(rng, params, ['station', 'sandbag', 'kb', 'cardio'], 1, used);
  const withSecond = rng.float() < 0.5;
  const second = withSecond ? selectMoves(rng, params, ['cardio', 'bodyweight'], 1, used) : [];
  const moves = [...primary, ...second].map((m) => toMovement(rng, params, m));
  const n = intervalCount(params.duration_min);
  const rest = rng.pick([60, 90]);
  const scheme = moves.length === 2
    ? `${n} × (effort / ${rest}s repos) — alterner les 2 mouvements`
    : `${n} × (effort / ${rest}s repos)`;
  return { label: null, structure: 'INTERVAL', scheme, movements: moves, rest: `${rest}s entre les efforts` };
}

/** Bloc EMOM réel : minutes alternées, reps courtes tenables dans la minute. */
function buildEmomBlock(rng: RNG, params: HyroxParams): Block {
  const used = new Set<string>();
  const moves = [
    ...selectMoves(rng, params, ['station', 'sandbag', 'kb'], rng.int(1, 2), used),
    ...selectMoves(rng, params, ['cardio', 'bodyweight'], 1, used),
  ];
  const minutes = Math.round(params.duration_min * 0.8);
  const movements = moves.map((m, i) => {
    const mv = toMovement(rng, params, m);
    // Un effort d'EMOM doit tenir dans la minute : cardio borné (≤250m / ≤15 cal).
    const dist = mv.prescription.match(/^(\d+)m$/);
    if (dist && Number(dist[1]) > 250) mv.prescription = '250m';
    const cal = mv.prescription.match(/^(\d+) cal$/);
    if (cal && Number(cal[1]) > 15) mv.prescription = '12 cal';
    mv.prescription = `Min ${i + 1}: ${mv.prescription}`;
    return mv;
  });
  return { label: null, structure: 'EMOM', scheme: `EMOM ${minutes} (alterné)`, movements, rest: 'reste de chaque minute' };
}

/** Bloc CHIPPER réel : une seule passe, volumes doublés mais ronds. */
function buildChipperBlock(rng: RNG, params: HyroxParams): Block {
  const used = new Set<string>();
  const moves = [
    ...selectMoves(rng, params, ['cardio'], 1, used),
    ...selectMoves(rng, params, ['station', 'sandbag', 'kb'], rng.int(2, 3), used),
    ...selectMoves(rng, params, ['bodyweight'], 1, used),
  ];
  const movements = moves.map((m) => {
    const mv = toMovement(rng, params, m);
    const r = mv.prescription.match(/^(\d+) reps/);
    // une passe = ×2, plafonné à 50 (le standard « Filthy Fifty »), reste rond
    if (r) mv.prescription = mv.prescription.replace(/^\d+/, String(Math.min(Number(r[1]) * 2, 50)));
    return mv;
  });
  return { label: null, structure: 'CHIPPER', scheme: 'Chipper — une seule passe, dans l’ordre', movements, rest: null };
}

function buildStationTraining(rng: RNG, params: HyroxParams): Block {
  // Méthode pilotée par la session (+ AMRAP pour le mode WOD), jamais STRENGTH ici.
  const sessionMethods = SESSION[params.session_type].methods.filter((m) => m !== 'STRENGTH');
  const method = rng.pick([...sessionMethods, 'AMRAP']);
  if (method === 'INTERVAL') return buildIntervalBlock(rng, params);
  if (method === 'EMOM') return buildEmomBlock(rng, params);
  if (method === 'CHIPPER') return buildChipperBlock(rng, params);

  // AMRAP / FOR TIME : reps par tour courtes (fixes), la durée pilote tours et cap.
  const used = new Set<string>();
  let focus = selectMoves(rng, params, ['station', 'sandbag', 'kb'], rng.int(1, 2), used);
  if (focus.length === 0) {
    focus = selectMoves(rng, params, ['bodyweight'], rng.int(2, 3), used);
  } else {
    focus = [...focus, ...selectMoves(rng, params, ['bodyweight'], 1, used)];
  }
  const movements = focus.map((m) => toMovement(rng, params, m));
  const cardio = selectMoves(rng, params, ['cardio'], 1, used)[0];
  if (cardio) movements.unshift(toMovement(rng, params, cardio));
  // Garde-fou anti-carte-vide : jamais moins de 2 mouvements dans un metcon.
  if (movements.length < 2) {
    movements.push(...selectMoves(rng, params, ['bodyweight'], 2 - movements.length + 1, used)
      .map((m) => toMovement(rng, params, m)));
  }
  const rounds = params.duration_min <= 20 ? 4 : params.duration_min <= 30 ? 5 : params.duration_min <= 45 ? 6 : 8;
  const scheme = method === 'AMRAP'
    ? `AMRAP ${Math.round(params.duration_min * 0.8)} min`
    : `${rounds} rounds for time`;
  return { label: null, structure: method, scheme, movements, rest: null };
}

function buildCardioForce(rng: RNG, params: HyroxParams): Block {
  const method = rng.pick(SESSION[params.session_type].methods.filter((m) => m !== 'STRENGTH').concat('AMRAP'));
  if (method === 'INTERVAL') return buildIntervalBlock(rng, params);
  if (method === 'EMOM') return buildEmomBlock(rng, params);
  if (method === 'CHIPPER') return buildChipperBlock(rng, params);
  const used = new Set<string>();
  const cardio = selectMoves(rng, params, ['cardio'], 1, used).map((m) => toMovement(rng, params, m));
  const loaded = selectMoves(rng, params, ['station', 'sandbag', 'kb'], 2, used).map((m) => toMovement(rng, params, m));
  const movements = [...cardio, ...loaded];
  // Garde-fou : un metcon à 1 seul mouvement n'est pas une séance — on complète
  // en poids de corps (toujours disponible) si le pool équipé était trop maigre.
  if (movements.length < 3) {
    movements.push(...selectMoves(rng, params, ['bodyweight'], 3 - movements.length, used)
      .map((m) => toMovement(rng, params, m)));
  }
  const rounds = params.duration_min <= 30 ? 4 : 5;
  const scheme = method === 'AMRAP' ? `${Math.round(params.duration_min * 0.8)} min AMRAP` : `${rounds} rounds for time`;
  return { label: null, structure: method, scheme, movements, rest: null };
}

function buildNamedWod(rng: RNG, params: HyroxParams): Block {
  const method = rng.pick(SESSION[params.session_type].methods);
  const types: MoveType[] = ['cardio', 'bodyweight', 'station', 'sandbag', 'kb'];
  const movements = selectMoves(rng, params, types, rng.int(3, 4)).map((m) => toMovement(rng, params, m));
  const scheme = method === 'AMRAP' ? `${Math.round(params.duration_min * 0.8)} min AMRAP`
    : method === 'STRENGTH' ? '5 rounds for quality'
    : method === 'EMOM' ? `EMOM ${Math.round(params.duration_min * 0.7)}`
    : `${rng.pick([3, 4, 5])} RFT`;
  return { label: null, structure: method, scheme, movements, rest: method === 'STRENGTH' ? '60-90s entre rounds' : null };
}

function buildRunSplit(rng: RNG, params: HyroxParams): Block {
  // Petite distance de cardio, puis 2-4 exercices courts (reps ≤ 10) entre chaque run.
  const probe = new RNG(1);
  // type 'barbell' exclu : les lifts barre sont réservés à la séance Force.
  const repPool = MOVES.filter((m) => m.type !== 'barbell' && isAvailable(m, effectiveEquipment(params)) && m.scheme(probe, 20).includes('reps'));
  const exos = rng
    .sample(repPool, Math.min(rng.int(2, 4), repPool.length))
    .map((m) => {
      const mv = toMovement(rng, params, m);
      mv.prescription = `${rng.pick([5, 8, 10])} reps`;
      return mv;
    });
  const run: Movement = { name: 'Run', prescription: `${rng.pick([200, 300, 400])}m`, load: null, equipment: null, substitution: 'Row / Ski / Bike (distance équivalente)' };
  const rounds = params.duration_min <= 20 ? 4 : params.duration_min <= 30 ? 5 : params.duration_min <= 45 ? 6 : 8;
  return { label: null, structure: 'FOR TIME', scheme: `${rounds} rounds for time — run + reps courtes`, movements: [run, ...exos], rest: null };
}

const isLoadable = (m: MoveDef) => m.loadKey != null;
const schemeIsReps = (m: MoveDef) => m.scheme(new RNG(1), 20).includes('reps');

/** Séance Force — alignée sur la programmation Hyrox réelle :
 *  A. lift principal en séries courtes lourdes (5×5 / 3×3 / 4×6), repos long (2-3 min),
 *     consigne explicite « charge > poids de course, RPE 8 » (les charges affichées sont
 *     les poids de COURSE : en force on monte au-dessus) ;
 *  B. 2 accessoires en 3×8-12, repos 60-90s (pas de volume conditioning) ;
 *  C. finisher grip & gainage (dead hang / farmers / planche) — spécifique Hyrox. */
function buildForceBlocks(rng: RNG, params: HyroxParams): Block[] {
  const rpe = rpeMid(params.session_type);
  const forcePool = MOVES.filter(
    (m) => m.force && isAvailable(m, effectiveEquipment(params)) && rpe >= m.rpe[0] && rpe <= m.rpe[1]
  );
  const used = new Set<string>();

  // ---- Bloc A : lift principal lourd. Priorité BARRE (back/front squat, deadlift…)
  // quand la chip Barbell est cochée — ce sont les lifts de référence de la prépa
  // Hyrox (3-5 reps à 80-90 % du 1RM). Sinon : sled/carry lourd > sandbag/KB > PDC.
  const barbell = forcePool.filter((m) => m.type === 'barbell');
  const heavyDist = forcePool.filter((m) => m.type !== 'barbell' && isLoadable(m) && !schemeIsReps(m)); // Sled, Farmers
  const heavyReps = forcePool.filter((m) => m.type !== 'barbell' && isLoadable(m) && schemeIsReps(m));  // KB/DB/Sandbag
  // Lift principal PDC : uniquement des mouvements à REPS (un « 5 × 8 — Dead Hang »
  // n'a pas de sens : les efforts en secondes restent au bloc C grip & gainage).
  const bodyweight = forcePool.filter((m) => !isLoadable(m) && m.type !== 'barbell' && schemeIsReps(m));

  const sets = rng.pick([[5, 5], [3, 3], [4, 6]]); // [séries, reps] — 5×5 / 3×3 / 4×6
  let a: Movement[] = [];
  let aScheme = '';
  const pickA = (pool: MoveDef[]) => samplePatternSafe(rng, pool, 1, used)[0];

  const aBarbell = barbell.length && rng.float() < 0.7 ? pickA(barbell) : undefined;
  const aHeavyDist = !aBarbell && heavyDist.length && rng.float() < 0.35 ? pickA(heavyDist) : undefined;
  const aHeavyReps = !aBarbell && !aHeavyDist && heavyReps.length ? pickA(heavyReps) : undefined;
  if (aBarbell) {
    const mv = toMovement(rng, params, aBarbell);
    const perLeg = /jambe/.test(mv.prescription) ? '/jambe' : '';
    mv.prescription = `${sets[0]} × ${sets[1]} reps${perLeg}`;
    mv.load = '80-85 % du 1RM';
    a = [mv];
    aScheme = `${sets[0]} × ${sets[1]} — lourd (80-85 % du 1RM, 2 reps en réserve)`;
  } else if (aHeavyDist) {
    // Sled/carry lourd : la « série » est une distance courte, charge montée au-dessus du poids de course.
    const mv = toMovement(rng, params, aHeavyDist);
    mv.prescription = `${sets[0]} × ${rng.pick([15, 20, 25])}m LOURD`;
    a = [mv];
    aScheme = `${sets[0]} séries lourdes — charge > poids de course (RPE 8)`;
  } else if (aHeavyReps) {
    const mv = toMovement(rng, params, aHeavyReps);
    mv.prescription = `${sets[0]} × ${sets[1]} reps`;
    a = [mv];
    aScheme = `${sets[0]} × ${sets[1]} — charge > poids de course (RPE 8, 2 reps en réserve)`;
  } else if (bodyweight.length) {
    const m = pickA(bodyweight)!;
    const mv = toMovement(rng, params, m);
    mv.prescription = `${sets[0]} × ${rng.pick([5, 6, 8])} reps — tempo 3s excentrique`;
    a = [mv];
    aScheme = `${sets[0]} séries — tempo contrôlé (RPE 8)`;
  }

  // ---- Bloc B : 2 accessoires en 3×8-12, familles différentes du lift A
  const bPool = forcePool.filter((m) => schemeIsReps(m));
  const b = samplePatternSafe(rng, bPool, 2, used).map((m) => {
    const mv = toMovement(rng, params, m);
    const per = /\/(bras|jambe)/.test(mv.prescription) ? mv.prescription.match(/\/(bras|jambe)/)![0] : '';
    mv.prescription = `3 × ${rng.pick([8, 10, 12])} reps${per}`;
    if (m.type === 'barbell') mv.load = '65-75 % du 1RM'; // accessoire barre : plus léger que le lift A
    return mv;
  });

  // ---- Bloc C : grip & gainage (2 tours) — dead hang / farmers / planche.
  // Exclusion par NOM des mouvements déjà en A/B (pas par famille : A = Farmers et
  // C = Dead Hang est une programmation valide, mais Dead Hang deux fois non).
  const abNames = new Set([...a, ...b].map((mv) => mv.name));
  const gripPool = forcePool.filter(
    (m) => !abNames.has(m.name) && patternsOf(m).some((p) => p === 'grip' || p === 'core'),
  );
  const c = samplePatternSafe(rng, gripPool, 2, new Set()).map((m) => toMovement(rng, params, m));

  const blocks: Block[] = [
    { label: 'A', structure: 'STRENGTH', scheme: aScheme, movements: a, rest: '2-3 min entre séries' },
    { label: 'B', structure: 'STRENGTH', scheme: '3 tours — accessoires 8-12 reps propres', movements: b, rest: '60-90s entre tours' },
  ];
  if (c.length > 0) {
    blocks.push({ label: 'C', structure: 'STRENGTH', scheme: '2 tours — grip & gainage', movements: c, rest: '45s entre efforts' });
  }
  return blocks;
}

// ============================ Génération principale ============================

// Comme côté CF : la durée choisie est une CIBLE — chaque séance tire sa durée
// naturelle (nombre rond) autour d'elle. « 45 min » peut donner 40, 45 ou 50.
const HY_MINUTES_WINDOW: Record<number, number[]> = {
  20: [16, 18, 20, 22], 30: [25, 28, 30, 34], 45: [38, 42, 45, 50], 60: [50, 55, 60, 65],
};

export function generateHyroxWod(params: HyroxParams, seed: number): HyroxWod {
  const rng = new RNG(seed);
  const minutes = rng.pick(HY_MINUTES_WINDOW[params.duration_min] ?? [params.duration_min]);
  // Les builders raisonnent sur la durée réelle (tours, intervalles, minutes d'EMOM).
  // Le cast est sûr : les seuils internes (<=20, <=30…) fonctionnent sur tout entier.
  const eff: HyroxParams = { ...params, duration_min: minutes as HyroxParams['duration_min'] };
  const cap = minutes;

  let blocks: Block[];
  if (eff.session_type === 'Force') {
    blocks = buildForceBlocks(rng, eff);
  } else if (eff.session_type === 'Run Split') {
    blocks = [buildRunSplit(rng, eff)];
  } else {
    switch (eff.training_type) {
      case 'Race Simulation': blocks = [buildRaceSimulation(rng, eff)]; break;
      case 'Station Training': blocks = [buildStationTraining(rng, eff)]; break;
      case 'Cardio Force':     blocks = [buildCardioForce(rng, eff)]; break;
      default:                 blocks = [buildNamedWod(rng, eff)];
    }
  }

  const method = blocks[0].structure;
  const modifiers: string[] = [];
  if (params.vest === 'on') modifiers.push('w/ Weighted Vest');
  if (params.vest === 'optional') modifiers.push('Vest optional');

  return {
    title: makeTitle(rng),
    category: params.category,
    format: params.format,
    duration_min: minutes, // durée réelle de la séance (la cible utilisateur reste dans les params)
    session_type: params.session_type,
    rpe: SESSION[params.session_type].rpe,
    training_type: params.training_type,
    structure: method,
    time_cap_min: cap,
    score_type: scoreType(method),
    modifiers,
    warmup: [
      `${rng.pick([300, 500])}m Row/Run easy`,
      '2-3 tours: 10 air squats / 5 push-ups / 10 sit-ups / 5 burpees',
    ],
    blocks,
    cooldown: ['5 min marche', 'mobilité hanches + épaules'],
    coach_notes: coachNotes(params, blocks, method),
    stimulus: SESSION[params.session_type].stimulus,
    seed,
  };
}

// ============================ Anti-répétition (local) ============================

const GENERIC = new Set(['run', 'row', 'skierg', 'bikeerg']);

export function hyroxSignature(wod: HyroxWod): string {
  const moves = wod.blocks
    .flatMap((b) => b.movements.map((m) => m.name.toLowerCase()))
    .filter((n) => !GENERIC.has(n));
  // Comme côté CF : la forme du schéma fait partie de l'identité (deux race sims aux
  // runs différents, ou un chipper vs des rounds, sont des séances distinctes).
  const scheme = (wod.blocks[0]?.scheme ?? '').toLowerCase();
  return `${wod.structure.toLowerCase()}::${scheme}::${[...new Set(moves)].sort().join('|')}`;
}

export function generateFreshHyrox(params: HyroxParams, recentSignatures: string[], maxTries = 5): HyroxWod {
  const seen = new Set(recentSignatures);
  let wod = generateHyroxWod(params, randomSeed());
  for (let i = 0; i < maxTries && seen.has(hyroxSignature(wod)); i++) {
    wod = generateHyroxWod(params, randomSeed());
  }
  return wod;
}
