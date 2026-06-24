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

type MoveType = 'station' | 'cardio' | 'sandbag' | 'kb' | 'bodyweight';
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

const repScale = (dur: number, base20: number) => Math.round(base20 * (dur / 20));

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
    scheme: (r, d) => `${repScale(d, r.pick([30, 40, 50]))} reps` },
  { name: 'Bear Crawl', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r) => `${r.pick([15, 20, 30])}m` },
  { name: 'Broad Jump', type: 'bodyweight', equipment: null, rpe: [5, 8], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([10, 15]))} reps` },
  { name: 'Jumping Jacks', type: 'bodyweight', equipment: null, rpe: [5, 7], loadKey: null, substitution: null,
    scheme: (r, d) => `${repScale(d, r.pick([40, 50]))} reps` },
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

function isAvailable(m: MoveDef, equipment: string[]): boolean {
  if (m.equipment === null) return true;
  return equipment.includes(m.equipment);
}

function selectMoves(rng: RNG, params: HyroxParams, types: MoveType[], n: number): MoveDef[] {
  const rpe = rpeMid(params.session_type);
  const pool = MOVES.filter(
    (m) => types.includes(m.type) && isAvailable(m, params.equipment) &&
           rpe >= m.rpe[0] && rpe <= m.rpe[1]
  );
  if (pool.length === 0) return [];
  return rng.sample(pool, Math.min(n, pool.length));
}

function toMovement(rng: RNG, params: HyroxParams, m: MoveDef): Movement {
  const available = isAvailable(m, params.equipment);
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

  if (params.session_type === 'Force') notes.push('Qualité avant vitesse : les 3 dernières reps doivent être exigeantes.');
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
  const [rMin, rMax] = DURATION[params.duration_min].runRange;
  const nStations = params.duration_min <= 20 ? 3 : params.duration_min <= 30 ? 4 : params.duration_min <= 45 ? 6 : 8;
  const chosen = officialOrder.slice(0, nStations);
  const movements: Movement[] = [];
  for (const st of chosen) {
    movements.push({ name: 'Run', prescription: `${rng.int(rMin / 100, rMax / 100) * 100}m`, load: null, equipment: null, substitution: 'Row/Bike/Ski' });
    const def = MOVES.find((m) => m.name === st);
    if (def) movements.push(toMovement(rng, params, def));
  }
  return { label: null, structure: 'FOR TIME', scheme: 'Séquence course (ordre officiel)', movements, rest: null };
}

function buildStationTraining(rng: RNG, params: HyroxParams): Block {
  // Méthode pilotée par la session (+ AMRAP pour le mode WOD), jamais STRENGTH ici.
  const sessionMethods = SESSION[params.session_type].methods.filter((m) => m !== 'STRENGTH');
  const method = rng.pick([...sessionMethods, 'AMRAP']);
  // Focus = stations/charges si équipement dispo, sinon repli sur l'aérobie poids-de-corps.
  let focus = selectMoves(rng, params, ['station', 'sandbag', 'kb'], rng.int(1, 2));
  if (focus.length === 0) {
    focus = selectMoves(rng, params, ['bodyweight'], rng.int(2, 3));
  } else {
    focus = [...focus, ...selectMoves(rng, params, ['bodyweight'], 1)];
  }
  const movements = focus.map((m) => toMovement(rng, params, m));
  const cardio = selectMoves(rng, params, ['cardio'], 1)[0];
  if (cardio) movements.unshift(toMovement(rng, params, cardio));
  const rounds = params.duration_min <= 30 ? 5 : 8;
  const scheme = method === 'AMRAP'
    ? `AMRAP ${Math.round(params.duration_min * 0.8)} min`
    : method === 'FOR TIME'
    ? `${rounds} rounds for time`
    : `${rounds} rounds — focus station`;
  const rest = method === 'EMOM' || method === 'INTERVAL' ? 'selon méthode' : null;
  return { label: null, structure: method, scheme, movements, rest };
}

function buildCardioForce(rng: RNG, params: HyroxParams): Block {
  const method = rng.pick(SESSION[params.session_type].methods.filter((m) => m !== 'STRENGTH').concat('AMRAP'));
  const cardio = selectMoves(rng, params, ['cardio'], 1).map((m) => toMovement(rng, params, m));
  const loaded = selectMoves(rng, params, ['station', 'sandbag', 'kb'], 2).map((m) => toMovement(rng, params, m));
  const movements = [...cardio, ...loaded];
  const scheme = method === 'AMRAP' ? `${Math.round(params.duration_min * 0.8)} min AMRAP` : `${params.duration_min <= 30 ? 4 : 5} RFT`;
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
  const repPool = MOVES.filter((m) => isAvailable(m, params.equipment) && m.scheme(probe, 20).includes('reps'));
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

function buildForceBlocks(rng: RNG, params: HyroxParams): Block[] {
  const rpe = rpeMid(params.session_type);
  const forcePool = MOVES.filter(
    (m) => m.force && isAvailable(m, params.equipment) && rpe >= m.rpe[0] && rpe <= m.rpe[1]
  );

  // Bloc A — mouvement principal. Priorité : chargeable à reps > port lesté/sled > poids de corps.
  const loadableReps = forcePool.filter((m) => isLoadable(m) && schemeIsReps(m));
  const loadableDist = forcePool.filter((m) => isLoadable(m) && !schemeIsReps(m));
  const bodyweight = forcePool.filter((m) => !isLoadable(m));

  let aMove: MoveDef | undefined;
  let aKind: 'heavyReps' | 'heavyDist' | 'tempo';
  if (loadableReps.length) { aMove = rng.pick(loadableReps); aKind = 'heavyReps'; }
  else if (loadableDist.length) { aMove = rng.pick(loadableDist); aKind = 'heavyDist'; }
  else { aMove = bodyweight.length ? rng.pick(bodyweight) : undefined; aKind = 'tempo'; }

  const a = aMove ? [(() => {
    const mv = toMovement(rng, params, aMove!);
    if (aKind === 'heavyReps') mv.prescription = `${rng.pick([5, 8])} reps lourdes`;
    else if (aKind === 'tempo') mv.prescription = `${rng.pick([6, 8])} reps — tempo contrôlé 3s`;
    // heavyDist : on garde la distance naturelle + charge lourde affichée
    return mv;
  })()] : [];
  const aScheme = aKind === 'tempo' ? '5 rounds — tempo contrôlé, work:rest égal'
    : '5 rounds — charge lourde, work:rest égal';

  // Bloc B — 2 accessoires (hors mouvement A), prescription naturelle.
  const bPool = forcePool.filter((m) => !aMove || m.name !== aMove.name);
  const b = rng.sample(bPool, Math.min(2, bPool.length)).map((m) => toMovement(rng, params, m));

  return [
    { label: 'A', structure: 'STRENGTH', scheme: aScheme, movements: a, rest: '1:30 entre séries' },
    { label: 'B', structure: 'STRENGTH', scheme: '4 rounds for quality', movements: b, rest: '60-90s entre rounds' },
  ];
}

// ============================ Génération principale ============================

export function generateHyroxWod(params: HyroxParams, seed: number): HyroxWod {
  const rng = new RNG(seed);
  const durKey = (DURATION[params.duration_min] ? params.duration_min : 45) as number;
  const cap = Math.round(params.duration_min * DURATION[durKey].capPct);

  let blocks: Block[];
  if (params.session_type === 'Force') {
    blocks = buildForceBlocks(rng, params);
  } else if (params.session_type === 'Run Split') {
    blocks = [buildRunSplit(rng, params)];
  } else {
    switch (params.training_type) {
      case 'Race Simulation': blocks = [buildRaceSimulation(rng, params)]; break;
      case 'Station Training': blocks = [buildStationTraining(rng, params)]; break;
      case 'Cardio Force':     blocks = [buildCardioForce(rng, params)]; break;
      default:                 blocks = [buildNamedWod(rng, params)];
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
    duration_min: params.duration_min,
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
  return `${wod.structure.toLowerCase()}::${[...new Set(moves)].sort().join('|')}`;
}

export function generateFreshHyrox(params: HyroxParams, recentSignatures: string[], maxTries = 5): HyroxWod {
  const seen = new Set(recentSignatures);
  let wod = generateHyroxWod(params, randomSeed());
  for (let i = 0; i < maxTries && seen.has(hyroxSignature(wod)); i++) {
    wod = generateHyroxWod(params, randomSeed());
  }
  return wod;
}
