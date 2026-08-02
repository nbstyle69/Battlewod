/**
 * AthleX — Ranker de WOD personnalisé (SPEC §1, §4)
 * =================================================
 * « Le moteur ne change pas, on met un cerveau au-dessus. »
 * - Génère N candidats via les moteurs déterministes existants (N seeds).
 * - Score chaque candidat contre le profil utilisateur : règles + poids.
 * - Renvoie un top 3 DIVERSIFIÉ avec une ligne « pourquoi » (templates FR).
 * AUCUN LLM, aucun appel réseau : pur TypeScript, testable.
 */

import { RNG, randomSeed } from './rng';
import { generateCFWod, cfSignature, CFParams, CFWod } from './engineCrossFit';
import { generateHyroxWod, hyroxSignature, HyroxParams, HyroxWod } from './engineHyrox';
import { BodyZone, movementHitsZones } from './movementZones';
import { PRMap } from './movementLoadability';
import { GymDeclaration } from './athleteLevels';

// ============================ Types ============================

export interface UserWodProfile {
  /** nom normalisé -> score [-1, 1] (user_movement_prefs) */
  prefs: Record<string, number>;
  /** zones à ménager actives (avoid_zones non expirées) */
  avoidZones: BodyZone[];
  /** nom normalisé -> nb de jours depuis la dernière fois (0 = aujourd'hui) */
  daysSinceMovement: Record<string, number>;
  /** signatures des WOD chosen/completed des 21 derniers jours (serveur) */
  recentSignatures: string[];
  /** mouvements détectés comme faibles (V1 : prefs très négatives exclues ; scores sous médiane box) */
  weakMovements: string[];
  goal: 'balanced' | 'progress' | 'race';
  /** ajustement de charge calculé (−0.10..+0.10) — V1 : affichage seulement */
  levelAdjust: number;
  /** mode Hybrid : jours restant avant la course déclarée (null si aucune) */
  raceDaysLeft?: number | null;
  /** 1RM normalisés (kg) issus de profiles.personal_records — voir parsePersonalRecords().
   *  Consommé à l'AFFICHAGE (resolveLoad), pas dans le scoring : les reps/charges restent
   *  comparables entre athlètes, seule la valeur affichée est personnalisée. {} = repli RX. */
  prs: PRMap;
  /** déclaration Gymnastique (palier max par famille) → gymLevel(). {} = niveau gym déduit. */
  gymDeclaration?: GymDeclaration;
}

export interface RankedSuggestion {
  kind: 'cf' | 'hyrox';
  wod: CFWod | HyroxWod;
  seed: number;
  signature: string;
  movementNames: string[];   // noms normalisés
  score: number;
  matchPct: number;
  /** true dès qu'un signal personnel (prefs, rotation, objectif, course) a joué. */
  personalized: boolean;
  isChallenge: boolean;
  why: string;
  method: string;
}

// Poids tunables (SPEC §4) — exportés pour les tests et le tuning.
export const WEIGHTS = {
  BASE: 50,
  RECENT_SIGNATURE: -40,
  ROTATION_PER_MOVE: -8,   // mouvement fait il y a ≤ ROTATION_DAYS jours
  ROTATION_DAYS: 2,
  PREF_SCALE: 15,          // score = pref × 15, borné ±15 par mouvement
  WEAKNESS_BONUS: 12,      // goal='progress' et contient un mouvement faible
  RACE_SIM_FAR: 8,         // 70 ≥ J > 42
  RACE_SIM_NEAR: 20,       // 42 ≥ J > 10
  RACE_TAPER_MALUS: -10,   // J ≤ 10 : Race Sim et Force pénalisés
  N_CANDIDATES: 20,
  TOP: 3,
};

const norm = (s: string) => s.toLowerCase().trim();
const GENERIC = new Set(['run', 'row', 'bike erg', 'skierg', 'bikeerg', 'echo bike']);

// ============================ Extraction ============================

function movementNamesOf(kind: 'cf' | 'hyrox', wod: CFWod | HyroxWod): string[] {
  const blocks =
    kind === 'cf'
      ? [...((wod as CFWod).strength ? [(wod as CFWod).strength!] : []), ...(wod as CFWod).blocks]
      : (wod as HyroxWod).blocks;
  return [...new Set(blocks.flatMap((b) => b.movements.map((m) => norm(m.name))))];
}

/** Empreinte structurelle d'un candidat, utilisée pour dédoublonner le tirage.
 *  La signature moteur reste la référence anti-répétition (feedback), mais elle est
 *  trop grossière pour certains formats (Hyrox Race Simulation : 1 signature pour
 *  20 séances pourtant différentes) et écraserait 2 des 3 cartes. */
function fingerprintOf(kind: 'cf' | 'hyrox', wod: CFWod | HyroxWod): string {
  const blocks =
    kind === 'cf'
      ? [...((wod as CFWod).strength ? [(wod as CFWod).strength!] : []), ...(wod as CFWod).blocks]
      : (wod as HyroxWod).blocks;
  return blocks
    .map((b) => `${b.label ?? ''}|${b.scheme}|${b.movements.map((m) => `${m.name}~${m.prescription ?? ''}~${m.load ?? ''}`).join(',')}`)
    .join('#');
}

// ============================ Scoring ============================

interface ScoreDetail { score: number; reasons: string[]; eliminated: boolean }

function scoreCandidate(
  kind: 'cf' | 'hyrox',
  wod: CFWod | HyroxWod,
  names: string[],
  signature: string,
  profile: UserWodProfile,
): ScoreDetail {
  const reasons: string[] = [];

  // 1. Blacklist zones : élimination pure (SPEC §4)
  for (const n of names) {
    if (movementHitsZones(n, profile.avoidZones)) {
      return { score: 0, reasons: [`exclu : ${n} sollicite une zone à ménager`], eliminated: true };
    }
  }

  let score = WEIGHTS.BASE;

  // 2. Anti-répétition serveur
  if (profile.recentSignatures.includes(signature)) {
    score += WEIGHTS.RECENT_SIGNATURE;
    reasons.push('déjà proposé récemment');
  }

  // 3. Rotation musculaire : mouvements (non génériques) faits il y a ≤ 2 jours
  let rotationHits = 0;
  let freshest: { name: string; days: number } | null = null;
  for (const n of names) {
    if (GENERIC.has(n)) continue;
    const days = profile.daysSinceMovement[n];
    if (days !== undefined && days <= WEIGHTS.ROTATION_DAYS) {
      rotationHits++;
      score += WEIGHTS.ROTATION_PER_MOVE;
    } else if (days !== undefined && (freshest === null || days > freshest.days)) {
      freshest = { name: n, days };
    }
  }
  if (rotationHits > 0) reasons.push(`${rotationHits} mouvement(s) déjà travaillé(s) ces 2 derniers jours`);

  // 4. Préférences apprises
  let bestPref: { name: string; v: number } | null = null;
  for (const n of names) {
    const p = profile.prefs[n] ?? 0;
    if (p !== 0) {
      score += Math.max(-WEIGHTS.PREF_SCALE, Math.min(WEIGHTS.PREF_SCALE, p * WEIGHTS.PREF_SCALE));
      if (p > 0 && (bestPref === null || p > bestPref.v)) bestPref = { name: n, v: p };
    }
  }

  // 5. Objectif « progresser » : bonus si mouvement faible présent
  const weakIn = names.filter((n) => profile.weakMovements.includes(n));
  if (profile.goal === 'progress' && weakIn.length > 0) score += WEIGHTS.WEAKNESS_BONUS;

  // 6. Objectif « course » (Hyrox) : périodisation par J−X (SPEC §7)
  if (kind === 'hyrox' && profile.goal === 'race' && profile.raceDaysLeft != null) {
    const d = profile.raceDaysLeft;
    const isRaceSim = (wod as HyroxWod).training_type === 'Race Simulation';
    const isForce = (wod as HyroxWod).session_type === 'Force';
    if (d <= 10) {
      if (isRaceSim || isForce) score += WEIGHTS.RACE_TAPER_MALUS;
      reasons.push('phase d’affûtage');
    } else if (d <= 42 && isRaceSim) {
      score += WEIGHTS.RACE_SIM_NEAR;
      reasons.push(`J−${d} : priorité race sim`);
    } else if (d <= 70 && isRaceSim) {
      score += WEIGHTS.RACE_SIM_FAR;
    }
  }

  // Mémos pour la ligne « pourquoi »
  if (bestPref) reasons.push(`fort:${bestPref.name}`);
  if (freshest && rotationHits === 0) reasons.push(`repos:${freshest.name}:${freshest.days}`);
  if (weakIn.length > 0) reasons.push(`faible:${weakIn[0]}`);

  return { score: Math.max(1, Math.round(score)), reasons, eliminated: false };
}

// ============================ « Pourquoi » (templates FR, pas de LLM) ============================

function buildWhy(s: { reasons: string[]; isChallenge: boolean; kind: 'cf' | 'hyrox' }, wod: CFWod | HyroxWod): string {
  const get = (p: string) => s.reasons.find((r) => r.startsWith(p))?.split(':');
  const weak = get('faible:');
  const fort = get('fort:');
  const repos = get('repos:');
  const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

  if (s.isChallenge && weak) {
    return `⚡ ${cap1(weak[1])} te freine dans tes scores — ${ (wod as CFWod).duration_min } min pour progresser ?`;
  }
  const parts: string[] = [];
  if (repos) parts.push(`tu n'as pas travaillé ${repos[1]} depuis ${repos[2]} jours`);
  if (fort) parts.push(`${fort[1]} est dans tes points forts`);
  if (s.reasons.some((r) => r.includes('priorité race sim'))) parts.push('ta course approche, les race sims passent en tête');
  if (s.reasons.some((r) => r.includes('affûtage'))) parts.push('affûtage : on garde de la fraîcheur pour le jour J');
  // Aucun signal personnel : pas de phrase générique répétée sur les 3 cartes (l'UI masque).
  if (parts.length === 0) return '';
  return `💡 Proposé parce que ${parts.slice(0, 2).join(' — et ')}.`;
}

// ============================ Sélection top 3 diversifié ============================

/** Recouvrement de mouvements (hors cardio générique) avec les cartes déjà retenues. */
function overlapWithPicked(c: RankedSuggestion, picked: RankedSuggestion[]): number {
  const mine = c.movementNames.filter((n) => !GENERIC.has(n));
  return Math.max(0, ...picked.map((p) => mine.filter((n) => p.movementNames.includes(n)).length));
}

function pickTop(cands: RankedSuggestion[], profile: UserWodProfile): RankedSuggestion[] {
  const valid = cands.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  const picked: RankedSuggestion[] = [];

  const pickNext = (filter?: (c: RankedSuggestion) => boolean) => {
    const found = valid.find(
      (c) => !picked.includes(c) &&
             !picked.some((p) => fingerprintOf(p.kind, p.wod) === fingerprintOf(c.kind, c.wod)) &&
             (!filter || filter(c)),
    );
    if (found) picked.push(found);
    return !!found;
  };

  // Diversité (SPEC §4) : en CF la méthode est fixée par l'utilisateur → la diversité
  // porte sur les MOUVEMENTS (recouvrement ≤1 avec les cartes retenues) ; quand les
  // méthodes varient (Hyrox), une méthode différente compte aussi comme diversité.
  const diverse = (c: RankedSuggestion) =>
    overlapWithPicked(c, picked) <= 1 || !picked.some((p) => p.method === c.method);

  // Carte 1 : meilleur score. Carte 2 : diversifiée si possible.
  pickNext();
  if (!pickNext(diverse)) pickNext();

  // Carte 3 : défi si goal='progress' et candidat avec mouvement faible dispo (SPEC §4)
  if (profile.goal === 'progress' && profile.weakMovements.length > 0) {
    const challenged = pickNext((c) => c.movementNames.some((n) => profile.weakMovements.includes(n)));
    if (challenged) picked[picked.length - 1].isChallenge = true;
  }
  while (picked.length < WEIGHTS.TOP && pickNext(diverse)) {/* diversité d'abord */}
  while (picked.length < WEIGHTS.TOP && pickNext()) {/* puis complète */}

  return picked.map((p) => ({
    ...p,
    matchPct: Math.min(98, p.score),
    personalized: ((p as any)._reasons ?? []).length > 0,
    why: buildWhy({ reasons: (p as any)._reasons ?? [], isChallenge: p.isChallenge, kind: p.kind }, p.wod),
  }));
}

// ============================ API publique ============================

function rank<K extends 'cf' | 'hyrox'>(
  kind: K,
  gen: (seed: number) => CFWod | HyroxWod,
  sig: (w: any) => string,
  profile: UserWodProfile,
  seeds?: number[],
): RankedSuggestion[] {
  const baseSeeds = seeds ?? Array.from({ length: WEIGHTS.N_CANDIDATES }, () => randomSeed());
  // Les zones à ménager peuvent éliminer tout un tirage : on élargit alors le pool avec
  // des seeds dérivés (déterministes) plutôt que de rendre un écran vide.
  const extraSeeds = profile.avoidZones.length > 0
    ? baseSeeds.flatMap((s) => [s * 3 + 11, s * 7 + 23, s * 13 + 41])
    : [];
  const seen = new Set<string>();
  const cands: RankedSuggestion[] = [];
  for (const seed of [...baseSeeds, ...extraSeeds]) {
    const wod = gen(seed);
    const signature = sig(wod);
    const fingerprint = fingerprintOf(kind, wod);
    if (seen.has(fingerprint)) continue; // dédoublonne le tirage
    seen.add(fingerprint);
    const names = movementNamesOf(kind, wod);
    const d = scoreCandidate(kind, wod, names, signature, profile);
    const c: RankedSuggestion = {
      kind, wod, seed, signature, movementNames: names,
      score: d.eliminated ? 0 : d.score, matchPct: 0, personalized: false,
      isChallenge: false, why: '', method: (wod as any).method ?? (wod as any).structure,
    };
    (c as any)._reasons = d.reasons;
    cands.push(c);
  }
  return pickTop(cands, profile);
}

/** Mode Functional Fitness / CrossFit. `seeds` injectable pour les tests (déterminisme). */
export function rankCF(params: CFParams, profile: UserWodProfile, seeds?: number[]): RankedSuggestion[] {
  // Le moteur ramène le cap à 95 % de la durée demandée hors AMRAP : on le recale sur
  // la durée choisie (20 min demandées = cap 20), sans toucher au moteur ni aux reps.
  const gen = (s: number) => {
    const w = generateCFWod(params, s);
    return params.benchmark ? w : { ...w, time_cap_min: params.duration_min };
  };
  return rank('cf', gen, cfSignature, profile, seeds);
}

/** Mode Hybrid / Hyrox. `seeds` injectable pour les tests (déterminisme). */
export function rankHyrox(params: HyroxParams, profile: UserWodProfile, seeds?: number[]): RankedSuggestion[] {
  return rank('hyrox', (s) => generateHyroxWod(params, s), hyroxSignature, profile, seeds);
}

/** Profil neutre (cold start / non connecté) : le ranker se comporte comme l'ancien générateur. */
export const EMPTY_PROFILE: UserWodProfile = {
  prefs: {}, avoidZones: [], daysSinceMovement: {}, recentSignatures: [],
  weakMovements: [], goal: 'balanced', levelAdjust: 0, raceDaysLeft: null,
  prs: {}, gymDeclaration: {},
};
