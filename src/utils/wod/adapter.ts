/**
 * BattleWOD — Adaptateur d'affichage
 * ==================================
 * Convertit la sortie structurée des moteurs déterministes (CFWod / HyroxWod)
 * vers les formes d'affichage plates utilisées par les écrans mobile existants
 * (GeneratedWOD: movements string ; HyroxWOD: stations string[]).
 *
 * Ainsi la logique de génération est entièrement remplacée par les nouveaux
 * moteurs, sans toucher au rendu (cartes, save, timer, score, whiteboard, share).
 */

import { randomSeed } from './rng';
import {
  generateCFWod, cfSignature, CFParams, CFWod, Block as CFBlock, Movement as CFMovement, Level, Intent as CFIntent, Method,
} from './engineCrossFit';
import {
  generateHyroxWod, hyroxSignature, HyroxParams, HyroxWod, Block as HyBlock, SessionType, Category, TrainingType,
} from './engineHyrox';
import { applyTeamFormat } from './teamWod';
import { buildHyroxTimerPlan, HyroxTimerPlan } from './hyroxTimer';

// ============================ Formes d'affichage ============================

export interface FunctionalDisplay {
  name: string;
  movements: string;   // lignes séparées par \n (header = sans indentation, détail = "  ...")
  scoring: string;
  coach: string;
  teamNote?: string;
  tags?: string[];
}

export interface HyroxDisplay {
  name: string;
  level: string;
  format: string;
  type: string;
  duration: number;
  stations: string[];
  scoring: string;
  coach: string;
  tags: string[];
  rpe: string;
  sessionLabel: string;
  coachingNotes: string[];
  timerPlan: HyroxTimerPlan;
}

// ============================ Helpers de formatage ============================

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Anti-répétition en session : on évite de re-proposer les ~8 derniers WOD.
const recentCF: string[] = [];
const recentHy: string[] = [];
const MAX_RECENT = 8;
function remember(list: string[], sig: string) {
  list.push(sig);
  if (list.length > MAX_RECENT) list.shift();
}

function cfMovementLine(m: CFMovement): string {
  let line = m.prescription ? `  ${m.prescription} — ${m.name}` : `  ${m.name}`;
  if (m.load) line += ` @ ${m.load}`;
  if (m.scaling_note) line += `  (${m.scaling_note})`;
  return line;
}

function cfBlockLines(b: CFBlock): string[] {
  const header = b.label ? `${b.label} · ${b.scheme}` : b.scheme;
  const lines = [header, ...b.movements.map(cfMovementLine)];
  if (b.rest) lines.push(`  → Repos : ${b.rest}`);
  return lines;
}

function hyMovementLine(m: { name: string; prescription: string; load: string | null; substitution: string | null }): string {
  let line = `  ${m.prescription} — ${m.name}`;
  if (m.load) line += ` @ ${m.load}`;
  if (m.substitution) line += `  [sub: ${m.substitution}]`;
  return line;
}

function hyBlockLines(b: HyBlock): string[] {
  const header = b.label ? `── ${b.label} · ${b.scheme} ──` : `── ${b.scheme} ──`;
  const lines = [header, ...b.movements.map(hyMovementLine)];
  if (b.rest) lines.push(`  → Repos : ${b.rest}`);
  return lines;
}

// ============================ Functional Fitness ============================

export interface FunctionalInput {
  level: string;           // 'Scaled' | 'Inter' | 'RX' | 'RX+' | 'Elite' | 'Pro'
  duration_min: number;
  intent: string;          // 'Mixed' | 'Cardio' | 'Force' | 'Gym'
  method: string;          // 'For Time' | 'AMRAP' | 'EMOM' | 'Tabata' | 'Max Reps'
  format: string;          // 'Solo' | 'Équipe 2' | 'Équipe 3' | 'Équipe 4' | 'Équipe 6'
  equipment: string[];     // labels moteur (Barbell, Haltères, ...)
  benchmark?: boolean;
}

const CF_METHODS: Method[] = ['For Time', 'AMRAP', 'EMOM', 'Tabata', 'Max Reps'];

export function generateFunctionalDisplay(input: FunctionalInput): FunctionalDisplay {
  const params: CFParams = {
    level: (input.level as Level),
    duration_min: input.duration_min,
    intent: (input.intent as CFIntent),
    method: (CF_METHODS.includes(input.method as Method) ? input.method : 'For Time') as Method,
    format: input.format as CFParams['format'],
    equipment: input.equipment,
    benchmark: input.benchmark,
  };
  let seed = randomSeed();
  let wod: CFWod = generateCFWod(params, seed);
  for (let i = 0; i < 6 && recentCF.includes(cfSignature(wod)); i++) {
    seed = randomSeed();
    wod = generateCFWod(params, seed);
  }
  remember(recentCF, cfSignature(wod));
  const isTeam = !/solo/i.test(input.format);
  if (isTeam) {
    wod = applyTeamFormat(wod, { mode: 'crossfit', seed, wormAvailable: input.equipment.includes('Worm') });
  }

  const lines: string[] = [];
  if (wod.strength) lines.push(...cfBlockLines(wod.strength));
  wod.blocks.forEach((b) => lines.push(...cfBlockLines(b)));

  const teamModifier = wod.modifiers.find((m) => /athlète/.test(m));
  const teamCoach = isTeam ? wod.coach_notes.find((n) => /équipe|partenaire|relais|alterne|synchro|partagez/i.test(n)) : undefined;

  return {
    name: wod.title,
    movements: lines.join('\n'),
    scoring: `${cap1(wod.score_type)} — cap ${wod.time_cap_min} min`,
    coach: [wod.stimulus, ...wod.coach_notes].join('\n• '),
    teamNote: teamModifier ? `${teamModifier}${teamCoach ? ' — ' + teamCoach : ''}` : undefined,
    tags: [
      `🏋️ ${input.intent}`,
      ...(wod.modifiers.includes('Format Benchmark') ? ['📋 Benchmark'] : []),
    ],
  };
}

// ============================ Hybrid / Hyrox ============================

const SESSION_EMOJI: Record<SessionType, string> = {
  'Interval': '⚡', 'Engine': '🔧', 'Aerobic': '🏃', 'Run Split': '🎽', 'Force': '💪',
};

export interface HyroxInput {
  category: string;        // 'Women' | 'Women Pro' | 'Men' | 'Men Pro'
  duration_min: number;    // 20 | 30 | 45 | 60
  session_type: SessionType;
  format: string;          // 'Solo' | 'Doubles' | 'Relais' | 'Mixed Relais'
  training_type: string;   // 'Race Simulation' | 'Station Training' | 'Cardio Force' | 'Named WOD'
  equipment: string[];     // labels moteur (SkiErg, Sled Push, ...)
  vest?: 'off' | 'on' | 'optional';
}

export function generateHyroxDisplay(input: HyroxInput): HyroxDisplay {
  const params: HyroxParams = {
    category: (input.category as Category),
    duration_min: (input.duration_min as HyroxParams['duration_min']),
    session_type: input.session_type,
    format: (input.format as HyroxParams['format']),
    training_type: (input.training_type as TrainingType),
    equipment: input.equipment,
    vest: input.vest ?? 'off',
  };
  let seed = randomSeed();
  let wod: HyroxWod = generateHyroxWod(params, seed);
  for (let i = 0; i < 6 && recentHy.includes(hyroxSignature(wod)); i++) {
    seed = randomSeed();
    wod = generateHyroxWod(params, seed);
  }
  remember(recentHy, hyroxSignature(wod));
  const isTeam = !/solo/i.test(input.format);
  if (isTeam) {
    wod = applyTeamFormat(wod, { mode: 'hyrox', seed });
  }

  const stations: string[] = [];
  wod.blocks.forEach((b) => stations.push(...hyBlockLines(b)));
  if (wod.modifiers.length > 0) stations.push(`  ⚙️ ${wod.modifiers.join(' · ')}`);

  return {
    name: wod.title,
    level: wod.category,
    format: wod.format,
    type: wod.training_type,
    duration: wod.duration_min,
    stations,
    scoring: `${cap1(wod.score_type)} — cap ${wod.time_cap_min} min`,
    coach: wod.coach_notes[0] ?? wod.stimulus,
    tags: [`${SESSION_EMOJI[input.session_type]} ${input.session_type}`, `📋 ${input.training_type}`],
    rpe: wod.rpe,
    sessionLabel: `${SESSION_EMOJI[input.session_type]} HYBRID ${input.session_type.toUpperCase()}`,
    coachingNotes: wod.coach_notes,
    timerPlan: buildHyroxTimerPlan(wod),
  };
}

// ============================ Mappings UI ============================

export const CF_LEVEL_MAP: Record<string, Level> = {
  scaled: 'Scaled', inter: 'Inter', rx: 'RX', 'rx+': 'RX+', elite: 'Elite', pro: 'Pro',
};

export const CF_INTENT_MAP: Record<string, CFIntent> = {
  mixed: 'Mixed', cardio: 'Cardio', strength: 'Force', gymnastics: 'Gym',
};

// HyroxIntent (UI 7 choix) -> SessionType moteur (5 filières)
export const HY_SESSION_MAP: Record<string, SessionType> = {
  race_prep: 'Engine', complete: 'Interval', interval: 'Interval',
  engine: 'Engine', aerobic: 'Aerobic', run_interval: 'Run Split', strength: 'Force',
};
