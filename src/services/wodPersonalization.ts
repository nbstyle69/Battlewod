/**
 * AthleX — Service de personnalisation du générateur (SPEC §3, §5)
 * ================================================================
 * Charge le profil de personnalisation depuis Supabase et enregistre la
 * boucle de feedback (shown / chosen / skipped / completed + RPE).
 * Best-effort : toute erreur réseau est loggée, jamais bloquante pour l'UX.
 */

import { supabase } from '../lib/supabase';
import { Json } from '../types/supabase';
import { BodyZone } from '../utils/wod/movementZones';
import { UserWodProfile, RankedSuggestion, EMPTY_PROFILE } from '../utils/wod/ranker';
import { parsePersonalRecords } from '../utils/wod/movementLoadability';
import { GymDeclaration } from '../utils/wod/athleteLevels';

const SIGNATURE_WINDOW_DAYS = 21; // anti-répétition serveur (SPEC §5)
const ROTATION_WINDOW_DAYS = 14;  // fenêtre d'historique mouvements
const PREF_CHOSEN = 0.10;         // bandit léger (SPEC §5)
const PREF_IGNORED = -0.05;
const CALIB_STEP = 0.05;
const CALIB_MAX = 0.10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

// ============================ Chargement du profil ============================

export async function loadWodProfile(userId: string): Promise<UserWodProfile> {
  try {
    const since = new Date(Date.now() - SIGNATURE_WINDOW_DAYS * 86_400_000).toISOString();

    const [settingsQ, prefsQ, feedbackQ, raceQ, profileQ] = await Promise.all([
      supabase.from('user_generation_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_movement_prefs').select('movement, score').eq('user_id', userId),
      supabase.from('user_wod_feedback')
        .select('signature, movements, action, created_at')
        .eq('user_id', userId).in('action', ['chosen', 'completed'])
        .gte('created_at', since).order('created_at', { ascending: false }).limit(120),
      supabase.from('user_races').select('race_date, format, category')
        .eq('user_id', userId).gte('race_date', new Date().toISOString().slice(0, 10))
        .order('race_date').limit(1),
      // Pont avec la page PR : lecture des 1RM existants (aucune nouvelle table).
      supabase.from('profiles').select('personal_records').eq('id', userId).maybeSingle(),
    ]);

    const settings = settingsQ.data ?? null;

    // Charges basées sur les PR : normalise profiles.personal_records → PRMap chiffré.
    // {} si la page Records est vide → resolveLoad retombe proprement sur RX.
    const prs = parsePersonalRecords(
      (profileQ.data?.personal_records ?? null) as Record<string, unknown> | null,
    );

    // Déclaration Gymnastique (palier max par famille), stockée dans les settings de génération.
    const gymDeclaration = (settings?.gym_declaration ?? {}) as GymDeclaration;

    // Zones actives (purge des expirées)
    const today = new Date().toISOString().slice(0, 10);
    const avoidZones: BodyZone[] = ((settings?.avoid_zones ?? []) as { zone: BodyZone; until: string | null }[])
      .filter((z) => z.until === null || z.until >= today)
      .map((z) => z.zone);

    // Préférences
    const prefs: Record<string, number> = {};
    for (const p of prefsQ.data ?? []) prefs[p.movement] = Number(p.score);

    // Historique mouvements (jours depuis la dernière fois) + signatures récentes
    const daysSinceMovement: Record<string, number> = {};
    const recentSignatures: string[] = [];
    for (const f of feedbackQ.data ?? []) {
      recentSignatures.push(f.signature);
      const d = daysAgo(f.created_at);
      if (d <= ROTATION_WINDOW_DAYS) {
        for (const m of f.movements ?? []) {
          if (daysSinceMovement[m] === undefined || d < daysSinceMovement[m]) daysSinceMovement[m] = d;
        }
      }
    }

    // Mouvements faibles (V1 : prefs nettement négatives = évités mais pas blacklistés).
    // V2 : croiser avec les scores sous la médiane de la box.
    const weakMovements = Object.entries(prefs)
      .filter(([, v]) => v <= -0.3).map(([k]) => k);

    // Course à venir → goal 'race' prioritaire côté Hybrid
    const race = raceQ.data?.[0] ?? null;
    const raceDaysLeft = race ? Math.max(0, daysAgo(race.race_date) * -1) : null;

    return {
      prefs,
      avoidZones,
      daysSinceMovement,
      recentSignatures: [...new Set(recentSignatures)],
      weakMovements,
      goal: (settings?.goal as UserWodProfile['goal']) ?? 'balanced',
      levelAdjust: Number(settings?.level_adjust ?? 0),
      raceDaysLeft,
      prs,
      gymDeclaration,
    };
  } catch (e) {
    console.warn('[wodPersonalization] loadWodProfile fallback:', e);
    return { ...EMPTY_PROFILE };
  }
}

// ============================ Feedback ============================

type Sport = 'functional' | 'hybrid';

function rowFor(userId: string, sport: Sport, s: RankedSuggestion, action: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: userId, sport, seed: s.seed, signature: s.signature,
    movements: s.movementNames, params: {}, action,
    is_challenge: s.isChallenge, ...extra,
  };
}

/** À l'affichage des 3 cartes. */
export async function recordShown(userId: string, sport: Sport, suggestions: RankedSuggestion[], params: Record<string, unknown>) {
  try {
    await supabase.from('user_wod_feedback').insert(
      suggestions.map((s, i) => ({ ...rowFor(userId, sport, s, 'shown', { rank: i + 1 }), params: params as Json })),
    );
  } catch (e) { console.warn('[wodPersonalization] recordShown:', e); }
}

/** Au choix d'une carte : journal + bandit léger sur les prefs (SPEC §5). */
export async function recordChosen(
  userId: string, sport: Sport,
  chosen: RankedSuggestion, ignored: RankedSuggestion[], rank: number,
) {
  try {
    await supabase.from('user_wod_feedback').insert(rowFor(userId, sport, chosen, 'chosen', { rank }));
    const deltas: Record<string, number> = {};
    for (const m of chosen.movementNames) deltas[m] = (deltas[m] ?? 0) + PREF_CHOSEN;
    for (const s of ignored) for (const m of s.movementNames) deltas[m] = (deltas[m] ?? 0) + PREF_IGNORED;
    await applyPrefDeltas(userId, deltas);
  } catch (e) { console.warn('[wodPersonalization] recordChosen:', e); }
}

/** Au tap « Regénérer » : signal + raison (chips). */
export async function recordSkippedAll(
  userId: string, sport: Sport, suggestions: RankedSuggestion[],
  reason: 'too_long' | 'disliked' | 'equipment' | 'too_hard' | 'other',
) {
  try {
    await supabase.from('user_wod_feedback').insert(
      suggestions.map((s, i) => rowFor(userId, sport, s, 'skipped', { rank: i + 1, reason })),
    );
    if (reason === 'disliked') {
      const deltas: Record<string, number> = {};
      for (const s of suggestions) for (const m of s.movementNames) deltas[m] = (deltas[m] ?? 0) + PREF_IGNORED;
      await applyPrefDeltas(userId, deltas);
    }
  } catch (e) { console.warn('[wodPersonalization] recordSkippedAll:', e); }
}

/** Post-séance (écran score existant) : RPE 1-tap + calibration (SPEC §5, §6). */
export async function recordCompleted(
  userId: string, sport: Sport, suggestion: RankedSuggestion,
  rpe: 'easy' | 'perfect' | 'hard', capMarginPct?: number,
) {
  try {
    await supabase.from('user_wod_feedback').insert(rowFor(userId, sport, suggestion, 'completed', { rpe }));
    await updateCalibration(userId, rpe, capMarginPct);
  } catch (e) { console.warn('[wodPersonalization] recordCompleted:', e); }
}

// ============================ Prefs & calibration ============================

async function applyPrefDeltas(userId: string, deltas: Record<string, number>) {
  const moves = Object.keys(deltas);
  if (moves.length === 0) return;
  const { data: existing } = await supabase
    .from('user_movement_prefs').select('movement, score')
    .eq('user_id', userId).in('movement', moves);
  const current: Record<string, number> = {};
  for (const r of existing ?? []) current[r.movement] = Number(r.score);
  const rows = moves.map((m) => ({
    user_id: userId, movement: m,
    score: clamp((current[m] ?? 0) + deltas[m], -1, 1),
    updated_at: new Date().toISOString(),
  }));
  await supabase.from('user_movement_prefs').upsert(rows, { onConflict: 'user_id,movement' });
}

/** Règle de calibration : 3 signaux « facile » consécutifs → +0.05 ; 2 « dur » → −0.05 (SPEC §5). */
async function updateCalibration(userId: string, rpe: 'easy' | 'perfect' | 'hard', capMarginPct?: number) {
  const easySignal = rpe === 'easy' || (capMarginPct !== undefined && capMarginPct > 10);
  if (rpe === 'perfect' && !easySignal) return;

  const { data: last } = await supabase
    .from('user_wod_feedback').select('rpe').eq('user_id', userId)
    .eq('action', 'completed').order('created_at', { ascending: false }).limit(3);
  const rpes = (last ?? []).map((r) => r.rpe);

  // Garde de longueur : `.every()` renvoie true sur une liste trop courte (aucun
  // contre-exemple), donc sans ce garde UNE seule séance « facile » suffisait à
  // déclencher +0.05 au lieu des 3 consécutives exigées par la SPEC §5.
  let delta = 0;
  if (easySignal && rpes.length >= 3 && rpes.slice(0, 3).every((r) => r === 'easy')) delta = +CALIB_STEP;
  if (rpe === 'hard' && rpes.length >= 2 && rpes.slice(0, 2).every((r) => r === 'hard')) delta = -CALIB_STEP;
  if (delta === 0) return;

  const { data: s } = await supabase
    .from('user_generation_settings').select('level_adjust').eq('user_id', userId).maybeSingle();
  const next = clamp(Number(s?.level_adjust ?? 0) + delta, -CALIB_MAX, CALIB_MAX);
  await supabase.from('user_generation_settings').upsert(
    { user_id: userId, level_adjust: next, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

// ============================ Réglages (zones, objectif, course) ============================

export async function saveAvoidZone(userId: string, zone: BodyZone, until: string | null) {
  const { data: s } = await supabase
    .from('user_generation_settings').select('avoid_zones').eq('user_id', userId).maybeSingle();
  const zones = ((s?.avoid_zones ?? []) as { zone: BodyZone; until: string | null }[])
    .filter((z) => z.zone !== zone);
  zones.push({ zone, until });
  await supabase.from('user_generation_settings').upsert(
    { user_id: userId, avoid_zones: zones, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function removeAvoidZone(userId: string, zone: BodyZone) {
  const { data: s } = await supabase
    .from('user_generation_settings').select('avoid_zones').eq('user_id', userId).maybeSingle();
  const zones = ((s?.avoid_zones ?? []) as { zone: BodyZone; until: string | null }[])
    .filter((z) => z.zone !== zone);
  await supabase.from('user_generation_settings').upsert(
    { user_id: userId, avoid_zones: zones, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function saveGoal(userId: string, goal: UserWodProfile['goal']) {
  await supabase.from('user_generation_settings').upsert(
    { user_id: userId, goal, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

/** Lecture seule de la déclaration Gymnastique (page de records). */
export async function loadGymDeclaration(userId: string): Promise<GymDeclaration> {
  try {
    const { data } = await supabase
      .from('user_generation_settings').select('gym_declaration').eq('user_id', userId).maybeSingle();
    return (data?.gym_declaration ?? {}) as GymDeclaration;
  } catch (e) {
    console.warn('[wodPersonalization] loadGymDeclaration:', e);
    return {};
  }
}

/** Section « Gymnastique » (page de records) : palier max déclaré par famille → gymLevel(). */
export async function saveGymDeclaration(userId: string, gymDeclaration: GymDeclaration) {
  await supabase.from('user_generation_settings').upsert(
    { user_id: userId, gym_declaration: gymDeclaration, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

export async function saveRace(userId: string, race: { name: string; race_date: string; format: string; category: string }) {
  await supabase.from('user_races').insert({ user_id: userId, ...race });
  await saveGoal(userId, 'race');
}
