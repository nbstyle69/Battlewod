import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureError } from '../lib/sentry';
import { hapticHeavy } from '../lib/haptics';
import { isLocalCategoryEnabled } from './notificationPrefsCache';
import { normalizeMovement, isKnownMovementKey } from '../utils/tournamentUtils';

// ── Badge title cache (avoid re-fetching) ───────────────────────────
let badgeTitleCache: Record<string, { title: string; icon: string; description: string }> = {};
async function getBadgeTitle(key: string): Promise<{ title: string; icon: string; description: string }> {
  if (badgeTitleCache[key]) return badgeTitleCache[key];
  const { data } = await supabase.from('badges_catalog').select('title, icon, description').eq('badge_key', key).single();
  const result = { title: data?.title ?? key, icon: data?.icon ?? '🏅', description: data?.description ?? '' };
  badgeTitleCache[key] = result;
  return result;
}

// ── Badges sans source d'attribution ────────────────────────────────
// claim_badge (20261018) ne peut poser que les badges dont le serveur sait
// revérifier la condition. Ceux-ci s'appuient sur des compteurs que leur
// porteur peut écrire (profiles.total_*, athlete_streaks) ou sur un état qui
// n'est matérialisé nulle part (fin du tutoriel) : personne ne peut les
// obtenir tant que le lot gamification serveur n'existe pas. On ne les
// affiche donc pas, sauf à un porteur historique.
export function isBadgeUnobtainable(badgeKey: string): boolean {
  return badgeKey === 'timer_50'
    || badgeKey === 'wod_gen_100'
    || badgeKey === 'first_step'
    || badgeKey.startsWith('streak_');
}

// ── Badge unlock queue (for HomeScreen popup) ────────────────────────
export interface BadgeQueueItem {
  badge_key: string;
  title: string;
  icon: string;
  description: string;
}

export async function readBadgeQueue(userId: string): Promise<BadgeQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(`@athlex:badge_queue_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function clearBadgeQueue(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(`@athlex:badge_queue_${userId}`); } catch (_e) { }
}

// ── Badge catalog (mirrors DB) ──────────────────────────────────────
export interface BadgeDef {
  badge_key: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  sort_order: number;
}

export interface EarnedBadge {
  badge_key: string;
  achieved_at: string;
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  week_session_count: number;
  week_start: string;
  max_sessions_per_week: number | null;
}

// ── Clé canonique de mouvement → préfixe de badge ───────────────────
// Les compteurs de reps sont indexés par la clé canonique de
// `normalizeMovement` ; le catalogue, lui, porte des clés
// `mv_<préfixe>_<palier>`. Cette table est la seule jonction entre les deux, et
// elle sert aux deux chemins d'attribution — crédit du back-office et WOD
// terminé côté athlète. Une clé absente d'ici ne donne aucun badge.
export const MOVEMENT_BADGE_PREFIX: Record<string, string> = {
  air_squat: 'mv_air_squat',        bar_muscle_up: 'mv_bmu',
  bike: 'mv_bike',                  box_jump: 'mv_box_jump',
  burpee: 'mv_burpee',              burpee_box_jump: 'mv_burpee_bj',
  chest_to_bar: 'mv_c2b',           clean: 'mv_clean',
  clean_and_jerk: 'mv_cj',          db_cj: 'mv_db_cj',
  db_push_press: 'mv_db_push_press', db_snatch: 'mv_db_snatch',
  db_thruster: 'mv_db_thruster',    deadlift: 'mv_deadlifts',
  devil_press: 'mv_devil_press',    double_under: 'mv_du',
  goblet_squat: 'mv_goblet_squat',  hollow_rock: 'mv_hollow',
  hspu: 'mv_hspu',                  kb_cj: 'mv_kb_cj',
  kb_snatch: 'mv_kb_snatch',        kb_swing: 'mv_kb_swing',
  kb_thruster: 'mv_kb_thruster',    knees_to_elbow: 'mv_k2e',
  lunge: 'mv_lunge',                mb_slam: 'mv_mb_slam',
  mountain_climber: 'mv_mtclimber', overhead_squat: 'mv_ohs',
  pistol_squat: 'mv_pistol',        press: 'mv_press',
  pull_over: 'mv_pullover',         pull_up: 'mv_pullup',
  push_up: 'mv_pushup',             ring_dip: 'mv_ring_dip',
  ring_muscle_up: 'mv_ring_mu',     ring_row: 'mv_ring_row',
  row: 'mv_row',                    sdlhp: 'mv_sdlhp',
  single_under: 'mv_su',            sit_up: 'mv_situp',
  ski_erg: 'mv_ski',                snatch: 'mv_snatch',
  squat: 'mv_squat',                thruster: 'mv_thrusters',
  toes_to_bar: 'mv_t2b',            turkish_get_up: 'mv_turkish_gu',
  v_up: 'mv_vup',                   wall_ball: 'mv_wallball',
  wall_walk: 'mv_wallwalk',
};

/**
 * Badges qui totalisent plusieurs mouvements en plus du leur : les burpees box
 * jump comptent aussi comme burpees, les variantes de squat comme squats. Les
 * variantes de barre (power clean, hang snatch…) n'ont pas besoin d'y figurer :
 * `normalizeMovement` les ramène déjà sur `clean` et `snatch`.
 */
export const MOVEMENT_BADGE_ROLLUP: Record<string, string[]> = {
  mv_burpee: ['burpee_box_jump'],
  mv_squat: ['air_squat', 'goblet_squat', 'overhead_squat'],
};

/** Paliers du catalogue par préfixe de badge de mouvement. */
export async function movementBadgeThresholds(): Promise<Map<string, number[]>> {
  const { data, error } = await supabase
    .from('badges_catalog')
    .select('badge_key')
    .eq('category', 'movement');
  if (error) captureError(error, { service: 'gamification', action: 'movementBadgeThresholds' });

  const byPrefix = new Map<string, number[]>();
  for (const prefix of new Set(Object.values(MOVEMENT_BADGE_PREFIX))) {
    const thresholds = (data ?? [])
      .filter(b => b.badge_key.startsWith(`${prefix}_`) && /^\d+$/.test(b.badge_key.slice(prefix.length + 1)))
      .map(b => parseInt(b.badge_key.slice(prefix.length + 1), 10))
      .sort((a, b) => a - b);
    if (thresholds.length) byPrefix.set(prefix, thresholds);
  }
  return byPrefix;
}

export interface MovementBadgeTier {
  badge_key: string;
  title: string;
  icon: string;
}

/**
 * Badges de mouvement franchis en passant de `prevTotal` à `newTotal` reps.
 * Les paliers sont lus dans `badges_catalog` : la liste diffère d'un mouvement
 * à l'autre (100/500/1000/5000 pour les squats, 50/200/500 pour les muscle-ups…)
 * et rester déclaratif évite de la dupliquer ici.
 */
export async function movementBadgesCrossed(
  movementKey: string,
  prevTotal: number,
  newTotal: number,
): Promise<MovementBadgeTier[]> {
  // Le back-office écrit tantôt le singulier tantôt le pluriel selon la
  // ligne de WOD saisie ("10 Thruster" / "10 Thrusters").
  const prefix = MOVEMENT_BADGE_PREFIX[movementKey]
    ?? MOVEMENT_BADGE_PREFIX[movementKey.replace(/s$/, '')];
  if (!prefix || newTotal <= prevTotal) return [];

  const { data, error } = await supabase
    .from('badges_catalog')
    .select('badge_key, title, icon')
    .eq('category', 'movement');
  if (error || !data) return [];

  return data
    .filter(b => {
      if (!b.badge_key.startsWith(`${prefix}_`)) return false;
      const suffix = b.badge_key.slice(prefix.length + 1);
      if (!/^\d+$/.test(suffix)) return false; // ex. mv_total_10k : badge méta
      const threshold = parseInt(suffix, 10);
      return threshold > prevTotal && threshold <= newTotal;
    })
    .map(b => ({ badge_key: b.badge_key, title: b.title, icon: b.icon }));
}

// ── Fetch helpers ───────────────────────────────────────────────────

export async function getBadgesCatalog(): Promise<BadgeDef[]> {
  const { data } = await supabase
    .from('badges_catalog')
    .select('*')
    .order('sort_order');
  return (data ?? []) as BadgeDef[];
}

export async function getEarnedBadges(userId: string): Promise<EarnedBadge[]> {
  const { data } = await supabase
    .from('athlete_badges')
    .select('badge_key, achieved_at')
    .eq('athlete_id', userId);
  return (data ?? []) as unknown as EarnedBadge[];
}

export async function getStreak(userId: string, boxId?: string): Promise<StreakInfo> {
  const { data } = await supabase
    .from('athlete_streaks')
    .select('*')
    .eq('athlete_id', userId)
    .single();

  // Fetch the user's plan limit for the current box
  let maxSessions: number | null = null;
  if (boxId) {
    const { data: membership } = await supabase
      .from('box_members')
      .select('plan_id, membership_plans(max_sessions_per_week)')
      .eq('member_id', userId)
      .eq('box_id', boxId)
      .eq('status', 'active')
      .maybeSingle();
    if (membership?.membership_plans) {
      maxSessions = (membership.membership_plans as any).max_sessions_per_week ?? null;
    }
  }

  if (!data) return { current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '', max_sessions_per_week: maxSessions };
  return { ...data, max_sessions_per_week: maxSessions } as StreakInfo;
}

// ── Award badge (idempotent) ────────────────────────────────────────

async function awardBadge(userId: string, badgeKey: string): Promise<boolean> {
  // Check if already earned
  const { data: existing } = await supabase
    .from('athlete_badges')
    .select('id')
    .eq('athlete_id', userId)
    .eq('badge_key', badgeKey)
    .maybeSingle();
  if (existing) return false; // already had it

  const { data: session } = await supabase.auth.getSession();
  const isSelf = session?.session?.user?.id === userId;

  if (isSelf) {
    // L'athlète déclenche, le serveur décide : la condition est revérifiée
    // dans claim_badge() sur des données qu'il ne peut pas écrire.
    const { data, error } = await supabase.rpc('claim_badge', { p_badge_key: badgeKey });
    if (error) return false;
    if (!(data as { awarded?: boolean } | null)?.awarded) return false;
  } else {
    // Chemin owner (crédit de score, clôture) : scopé par is_box_admin_of_athlete().
    const { error } = await supabase
      .from('athlete_badges')
      .insert({ athlete_id: userId, badge_key: badgeKey });
    if (error) return false;
  }

  // Queue badge for HomeScreen popup
  try {
    const { title, icon, description } = await getBadgeTitle(badgeKey);
    const raw = await AsyncStorage.getItem(`@athlex:badge_queue_${userId}`);
    const q: BadgeQueueItem[] = raw ? JSON.parse(raw) : [];
    q.push({ badge_key: badgeKey, title, icon, description });
    await AsyncStorage.setItem(`@athlex:badge_queue_${userId}`, JSON.stringify(q));
  } catch (_e) { }

  // Send local notification + haptic for badge unlock
  try {
    hapticHeavy();
    if (!(await isLocalCategoryEnabled('badge_unlocks'))) return true;
    const { title, icon } = await getBadgeTitle(badgeKey);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${icon} Badge débloqué !`,
        body: title,
        data: { type: 'badge_unlock', badgeKey },
      },
      trigger: null, // immediate
    });
  } catch (e) { captureError(e, { service: 'gamification', action: 'badgeNotification', badgeKey }); }

  return true;
}

// ── Public badge award (used by eloLevels) ──────────────────────────

export async function awardLevelBadge(userId: string, badgeKey: string): Promise<boolean> {
  return awardBadge(userId, badgeKey);
}

// ── Record activity for streak tracking ─────────────────────────────

export async function recordActivity(userId: string, boxId?: string): Promise<string[]> {
  const newBadges: string[] = [];

  // Fetch the user's plan limit (default 3 if no plan assigned)
  let threshold = 3;
  if (boxId) {
    const { data: membership } = await supabase
      .from('box_members')
      .select('plan_id, membership_plans(max_sessions_per_week)')
      .eq('member_id', userId)
      .eq('box_id', boxId)
      .eq('status', 'active')
      .maybeSingle();
    const planMax = (membership?.membership_plans as any)?.max_sessions_per_week;
    if (planMax != null) threshold = planMax;
  }

  // Get or create streak row
  const { data: existing } = await supabase
    .from('athlete_streaks')
    .select('*')
    .eq('athlete_id', userId)
    .single();

  const now = new Date();
  const currentWeekStart = getWeekStart(now);

  if (!existing) {
    // First activity ever
    await supabase.from('athlete_streaks').insert({
      athlete_id: userId,
      current_streak: 0,
      longest_streak: 0,
      week_session_count: 1,
      week_start: currentWeekStart,
    });
    return newBadges;
  }

  const storedWeekStart = existing.week_start;

  if (storedWeekStart === currentWeekStart) {
    // Same week — increment session count
    const newCount = existing.week_session_count + 1;
    await supabase.from('athlete_streaks').update({
      week_session_count: newCount,
      updated_at: now.toISOString(),
    }).eq('athlete_id', userId);

    // Check if we just hit the plan threshold → validate the week
    if (existing.week_session_count < threshold && newCount >= threshold) {
      const newStreak = existing.current_streak + 1;
      const newLongest = Math.max(existing.longest_streak, newStreak);
      await supabase.from('athlete_streaks').update({
        current_streak: newStreak,
        longest_streak: newLongest,
      }).eq('athlete_id', userId);

      // Check streak badges
      const streakBadges = checkStreakBadges(newStreak);
      for (const key of streakBadges) {
        const awarded = await awardBadge(userId, key);
        if (awarded) newBadges.push(key);
      }
    }
  } else {
    // Different week — reset counter, check if last week was validated
    const lastWeekEnd = new Date(storedWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
    const isConsecutive = currentWeekStart === getWeekStart(lastWeekEnd) ||
                          daysBetween(storedWeekStart, currentWeekStart) === 7;

    // If last week reached the threshold and this is consecutive, keep streak
    const lastWeekValidated = existing.week_session_count >= threshold;
    let currentStreak = existing.current_streak;

    if (!isConsecutive || !lastWeekValidated) {
      currentStreak = 0; // reset
    }

    await supabase.from('athlete_streaks').update({
      week_session_count: 1,
      week_start: currentWeekStart,
      current_streak: currentStreak,
      updated_at: now.toISOString(),
    }).eq('athlete_id', userId);
  }

  return newBadges;
}

// ── Check cumulative badges after specific actions ──────────────────

export async function checkAndAwardBadges(
  userId: string,
  counters: {
    total_scores_submitted?: number;
    total_wods_generated?: number;
    total_timer_sessions?: number;
    total_messages_sent?: number;
    total_tournaments?: number;
    total_tournament_wins?: number;
    total_friends?: number;
    elo?: number;
  },
): Promise<string[]> {
  const newBadges: string[] = [];

  const checks: [boolean, string][] = [
    // Score
    [(counters.total_scores_submitted ?? 0) >= 1, 'first_score'],
    // WOD gen
    [(counters.total_wods_generated ?? 0) >= 100, 'wod_gen_100'],
    // Timer
    [(counters.total_timer_sessions ?? 0) >= 50, 'timer_50'],
    // Messages
    [(counters.total_messages_sent ?? 0) >= 50, 'chatty_50'],
    // Friends
    [(counters.total_friends ?? 0) >= 5, 'social_5'],
    // Tournaments
    [(counters.total_tournaments ?? 0) >= 10, 'veteran_10'],
    [(counters.total_tournament_wins ?? 0) >= 1, 'first_win'],
    [(counters.total_tournament_wins ?? 0) >= 5, 'champion_5'],
    // Podium is checked separately in tournament close
    // ELO level badges
    [(counters.elo ?? 0) >= 1001, 'level_inter'],
    [(counters.elo ?? 0) >= 1200, 'level_rx'],
    [(counters.elo ?? 0) >= 1400, 'level_rx_plus'],
    [(counters.elo ?? 0) >= 1600, 'level_elite'],
    [(counters.elo ?? 0) >= 1800, 'level_pro'],
  ];

  for (const [condition, badgeKey] of checks) {
    if (condition) {
      const awarded = await awardBadge(userId, badgeKey);
      if (awarded) newBadges.push(badgeKey);
    }
  }

  return newBadges;
}

// ── Increment a counter and check badges ────────────────────────────

export async function incrementCounter(
  userId: string,
  field: string,
  amount: number = 1,
  boxId?: string,
  options: { skipStreak?: boolean } = {},
): Promise<string[]> {
  // Increment counter
  const { data: profile } = await supabase
    .from('profiles')
    .select(`${field}, elo, total_scores_submitted, total_wods_generated, total_timer_sessions, total_messages_sent, total_tournaments, total_tournament_wins, total_friends`)
    .eq('id', userId)
    .single();

  if (!profile) return [];

  const currentVal = (profile as any)[field] ?? 0;
  const newVal = currentVal + amount;

  await supabase.from('profiles').update({ [field]: newVal }).eq('id', userId);

  // Record activity for streak (using plan limit from box membership)
  // Skip if caller already recorded it (e.g. wod_completion was inserted before score)
  const streakBadges = options.skipStreak ? [] : await recordActivity(userId, boxId);

  // Check cumulative badges with updated counter
  const updatedCounters = { ...(profile as Record<string, any>), [field]: newVal };
  const cumulBadges = await checkAndAwardBadges(userId, updatedCounters as any);

  return [...streakBadges, ...cumulBadges];
}

// ── Helpers ─────────────────────────────────────────────────────────

function getWeekStart(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round(Math.abs(db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function checkStreakBadges(streak: number): string[] {
  const badges: string[] = [];
  if (streak >= 1)  badges.push('streak_1w');
  if (streak >= 3)  badges.push('streak_3w');
  if (streak >= 8)  badges.push('streak_8w');
  if (streak >= 16) badges.push('streak_16w');
  if (streak >= 26) badges.push('streak_26w');
  return badges;
}

// ── Movement rep tracking ───────────────────────────────────────────

export interface MovementEntry {
  name: string;
  reps: number;
  weight_kg?: number;
}

/**
 * Log movement reps after a WOD completion and check movement badges.
 * @param userId  - athlete id
 * @param movements - array of { name, reps, weight_kg? }
 * @param sourceType - 'wod' | 'tournament' | 'daily' | 'whiteboard'
 * @param sourceId - optional wod or tournament id
 */
export async function logMovementReps(
  userId: string,
  movements: MovementEntry[],
  sourceType: 'wod' | 'tournament' | 'daily' | 'whiteboard' = 'wod',
  sourceId?: string,
): Promise<string[]> {
  if (!movements.length) return [];
  const newBadges: string[] = [];

  // Une seule normalisation, la même que le crédit de reps du back-office :
  // deux espaces de clés (« pull-ups » ici, « pull_up » là) donnaient deux
  // compteurs dont aucun badge ne lisait le premier. Les lignes qui ne se
  // résolvent pas en mouvement connu ne sont pas comptées.
  const counted = movements
    .map(m => ({ ...m, key: normalizeMovement(m.name).key }))
    .filter(m => isKnownMovementKey(m.key));
  if (!counted.length) return [];

  // 1. Insert individual logs
  const logs = counted.map(m => ({
    user_id: userId,
    movement: m.key,
    total_reps: m.reps,
    weight_kg: m.weight_kg ?? null,
    source_type: sourceType,
    source_id: sourceId ?? null,
  }));
  try { await supabase.from('movement_logs').insert(logs); } catch (e) { captureError(e, { service: 'gamification', action: 'insertMovementLogs' }); }

  // 2. Increment cumulative stats via RPC
  for (const m of counted) {
    try {
      await supabase.rpc('increment_movement_stats', {
        p_user_id: userId,
        p_movement: m.key,
        p_reps: m.reps,
        p_weight: m.weight_kg ?? undefined,
      });
    } catch (e) { captureError(e, { service: 'gamification', action: 'incrementMovementStats', movement: m.key }); }
  }

  // 3. Check movement badges
  const { data: stats } = await supabase
    .from('user_movement_stats')
    .select('movement, total_reps')
    .eq('user_id', userId);

  if (stats) {
    // Les lignes héritées dont la clé n'est pas un mouvement (« rounds »,
    // « work_hsw », « wod_du_jour_ou_hyrox »…) restent en base mais ne
    // comptent plus : elles gonflaient les badges de polyvalence et de total
    // de reps avec des lignes de format de WOD.
    const statsMap = new Map<string, number>();
    let totalAllReps = 0;
    for (const s of stats) {
      if (!isKnownMovementKey(s.movement)) continue;
      statsMap.set(s.movement, (statsMap.get(s.movement) ?? 0) + s.total_reps);
      totalAllReps += s.total_reps;
    }

    // Un total par préfixe de badge. La clé canonique est la seule jonction
    // avec le catalogue (MOVEMENT_BADGE_PREFIX) : avant, ce bloc listait des
    // clés à la main ("pull_ups", "thrusters", "hspu_stricts") qu'aucune
    // écriture ne produisait — les badges de mouvement de l'athlète étaient
    // donc inatteignables.
    const perPrefix = new Map<string, number>();
    for (const [key, reps] of statsMap) {
      const prefix = MOVEMENT_BADGE_PREFIX[key];
      if (prefix) perPrefix.set(prefix, (perPrefix.get(prefix) ?? 0) + reps);
    }
    for (const [prefix, keys] of Object.entries(MOVEMENT_BADGE_ROLLUP)) {
      const extra = keys.reduce((sum, k) => sum + (statsMap.get(k) ?? 0), 0);
      if (extra > 0) perPrefix.set(prefix, (perPrefix.get(prefix) ?? 0) + extra);
    }

    // Paliers lus dans le catalogue, comme movementBadgesCrossed : une liste
    // redéclarée ici finissait par diverger (mv_sdlhp n'y était pas).
    const thresholds = await movementBadgeThresholds();

    for (const [prefix, total] of perPrefix) {
      for (const threshold of thresholds.get(prefix) ?? []) {
        if (total < threshold) continue;
        const badgeKey = `${prefix}_${threshold}`;
        const awarded = await awardBadge(userId, badgeKey);
        if (awarded) newBadges.push(badgeKey);
      }
    }

    // Meta badges: polyvalent (movements with 100+ reps)
    const mvWith100 = Array.from(statsMap.values()).filter(v => v >= 100).length;
    if (mvWith100 >= 5) { const a = await awardBadge(userId, 'mv_polyvalent_5'); if (a) newBadges.push('mv_polyvalent_5'); }
    if (mvWith100 >= 10) { const a = await awardBadge(userId, 'mv_polyvalent_10'); if (a) newBadges.push('mv_polyvalent_10'); }
    if (mvWith100 >= 20) { const a = await awardBadge(userId, 'mv_polyvalent_20'); if (a) newBadges.push('mv_polyvalent_20'); }

    // Total reps badges
    if (totalAllReps >= 10000) { const a = await awardBadge(userId, 'mv_total_10k'); if (a) newBadges.push('mv_total_10k'); }
    if (totalAllReps >= 50000) { const a = await awardBadge(userId, 'mv_total_50k'); if (a) newBadges.push('mv_total_50k'); }
    if (totalAllReps >= 100000) { const a = await awardBadge(userId, 'mv_total_100k'); if (a) newBadges.push('mv_total_100k'); }
  }

  return newBadges;
}
