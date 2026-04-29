import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';
import { captureError } from '../lib/sentry';
import { hapticHeavy } from '../lib/haptics';

// ── Badge title cache (avoid re-fetching) ───────────────────────────
let badgeTitleCache: Record<string, { title: string; icon: string }> = {};
async function getBadgeTitle(key: string): Promise<{ title: string; icon: string }> {
  if (badgeTitleCache[key]) return badgeTitleCache[key];
  const { data } = await supabase.from('badges_catalog').select('title, icon').eq('badge_key', key).single();
  const result = { title: data?.title ?? key, icon: data?.icon ?? '🏅' };
  badgeTitleCache[key] = result;
  return result;
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
  earned_at: string;
}

export interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  week_session_count: number;
  week_start: string;
  max_sessions_per_week: number | null;
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
    .select('badge_key, earned_at')
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

  const { error } = await supabase
    .from('athlete_badges')
    .insert({ athlete_id: userId, badge_key: badgeKey });
  if (error) return false;

  // Send local notification + haptic for badge unlock
  try {
    hapticHeavy();
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

  // 1. Insert individual logs
  const logs = movements.map(m => ({
    user_id: userId,
    movement: normalizeMovement(m.name),
    total_reps: m.reps,
    weight_kg: m.weight_kg ?? null,
    source_type: sourceType,
    source_id: sourceId ?? null,
  }));
  try { await supabase.from('movement_logs').insert(logs); } catch (e) { captureError(e, { service: 'gamification', action: 'insertMovementLogs' }); }

  // 2. Increment cumulative stats via RPC
  for (const m of movements) {
    const normalized = normalizeMovement(m.name);
    try {
      await supabase.rpc('increment_movement_stats', {
        p_user_id: userId,
        p_movement: normalized,
        p_reps: m.reps,
        p_weight: m.weight_kg ?? undefined,
      });
    } catch (e) { captureError(e, { service: 'gamification', action: 'incrementMovementStats', movement: normalized }); }
  }

  // 3. Check movement badges
  const { data: stats } = await supabase
    .from('user_movement_stats')
    .select('movement, total_reps')
    .eq('user_id', userId);

  if (stats) {
    const statsMap = new Map<string, number>();
    let totalAllReps = 0;
    for (const s of stats) {
      statsMap.set(s.movement, s.total_reps);
      totalAllReps += s.total_reps;
    }

    // Grouped movements (combine variants)
    const groups: Record<string, string[]> = {
      clean: ['clean', 'power_clean', 'squat_clean', 'hang_clean', 'hang_squat_clean', 'hang_power_clean'],
      snatch: ['snatch', 'power_snatch', 'squat_snatch', 'hang_snatch'],
      squat: ['front_squats', 'back_squats', 'air_squats', 'goblet_squats', 'overhead_squat', 'jumping_squats'],
      press: ['strict_press', 'push_press', 'push_jerk', 'shoulder_to_overhead'],
      cj: ['clean_and_jerk', 'hang_clean_and_jerk', 'hang_squat_clean_and_jerk'],
      pullup: ['pull_ups', 'kipping_pull_ups'],
      lunge: ['lunges', 'db_lunges', 'db_walking_lunge', 'db_oh_walking_lunge', 'kb_walking_lunge', 'kb_oh_walking_lunge'],
      burpee: ['burpees', 'burpee_over_the_bar', 'bar_facing_burpee', 'burpee_over_the_db', 'burpee_box_jump', 'burpee_box_jump_over'],
      hspu: ['hspu_stricts', 'wall_facing_hspu'],
    };

    function groupTotal(keys: string[]): number {
      return keys.reduce((sum, k) => sum + (statsMap.get(k) ?? 0), 0);
    }

    // Individual movement badges
    const mvBadgeChecks: [() => number, string, number][] = [
      // Barbell
      [() => statsMap.get('thrusters') ?? 0, 'mv_thrusters', 0],
      [() => statsMap.get('deadlifts') ?? 0, 'mv_deadlifts', 0],
      [() => groupTotal(groups.clean), 'mv_clean', 0],
      [() => groupTotal(groups.snatch), 'mv_snatch', 0],
      [() => groupTotal(groups.squat), 'mv_squat', 0],
      [() => groupTotal(groups.press), 'mv_press', 0],
      [() => groupTotal(groups.cj), 'mv_cj', 0],
      [() => statsMap.get('overhead_squat') ?? 0, 'mv_ohs', 0],
      // DB
      [() => (statsMap.get('db_snatch') ?? 0) + (statsMap.get('db_hang_snatch') ?? 0) + (statsMap.get('db_squat_snatch') ?? 0), 'mv_db_snatch', 0],
      [() => statsMap.get('db_thrusters') ?? 0, 'mv_db_thruster', 0],
      [() => statsMap.get('devil_press') ?? 0, 'mv_devil_press', 0],
      [() => groupTotal(groups.lunge), 'mv_db_lunge', 0],
      [() => (statsMap.get('db_clean_and_jerk') ?? 0) + (statsMap.get('db_hang_clean_and_jerk') ?? 0), 'mv_db_cj', 0],
      [() => statsMap.get('db_push_press') ?? 0, 'mv_db_push_press', 0],
      // KB
      [() => statsMap.get('kb_swings') ?? 0, 'mv_kb_swing', 0],
      [() => statsMap.get('goblet_squats') ?? 0, 'mv_goblet_squat', 0],
      [() => (statsMap.get('kb_snatch') ?? 0) + (statsMap.get('double_kb_snatch') ?? 0), 'mv_kb_snatch', 0],
      [() => (statsMap.get('kb_clean_and_jerk') ?? 0) + (statsMap.get('double_kb_clean_and_jerk') ?? 0), 'mv_kb_cj', 0],
      [() => statsMap.get('turkish_get_up') ?? 0, 'mv_turkish_gu', 0],
      [() => statsMap.get('kb_thruster') ?? 0, 'mv_kb_thruster', 0],
      // Box
      [() => (statsMap.get('box_jump') ?? 0) + (statsMap.get('box_jump_over') ?? 0) + (statsMap.get('box_step_ups') ?? 0) + (statsMap.get('box_jump_step_overs') ?? 0), 'mv_box_jump', 0],
      [() => (statsMap.get('burpee_box_jump') ?? 0) + (statsMap.get('burpee_box_jump_over') ?? 0), 'mv_burpee_bj', 0],
      // Rope
      [() => statsMap.get('double_unders') ?? 0, 'mv_du', 0],
      [() => statsMap.get('single_unders') ?? 0, 'mv_su', 0],
      // Pull-up bar
      [() => groupTotal(groups.pullup), 'mv_pullup', 0],
      [() => statsMap.get('chest_to_bar') ?? 0, 'mv_c2b', 0],
      [() => statsMap.get('toes_to_bar') ?? 0, 'mv_t2b', 0],
      [() => statsMap.get('knees_to_elbows') ?? 0, 'mv_k2e', 0],
      [() => statsMap.get('bar_muscle_ups') ?? 0, 'mv_bmu', 0],
      [() => statsMap.get('pull_over') ?? 0, 'mv_pullover', 0],
      // Rings
      [() => statsMap.get('ring_muscle_ups') ?? 0, 'mv_ring_mu', 0],
      [() => statsMap.get('ring_dips') ?? 0, 'mv_ring_dip', 0],
      [() => statsMap.get('ring_rows') ?? 0, 'mv_ring_row', 0],
      // BW
      [() => groupTotal(groups.burpee), 'mv_burpee', 0],
      [() => statsMap.get('air_squats') ?? 0, 'mv_air_squat', 0],
      [() => statsMap.get('push_ups') ?? 0, 'mv_pushup', 0],
      [() => statsMap.get('sit_ups') ?? 0, 'mv_situp', 0],
      [() => statsMap.get('mountain_climbers') ?? 0, 'mv_mtclimber', 0],
      [() => statsMap.get('pistol_squats') ?? 0, 'mv_pistol', 0],
      [() => groupTotal(groups.hspu), 'mv_hspu', 0],
      [() => (statsMap.get('wall_walks') ?? 0) + (statsMap.get('wall_walks_partiels') ?? 0), 'mv_wallwalk', 0],
      [() => statsMap.get('v_ups') ?? 0, 'mv_vup', 0],
      [() => statsMap.get('hollow_rocks') ?? 0, 'mv_hollow', 0],
      // Wall Ball
      [() => statsMap.get('wall_balls_cible_3m_kg') ?? 0, 'mv_wallball', 0],
      [() => statsMap.get('mb_slams_kg') ?? 0, 'mv_mb_slam', 0],
      // Erg
      [() => (statsMap.get('row') ?? 0) + (statsMap.get('cal_rameur') ?? 0), 'mv_row', 0],
      [() => (statsMap.get('assault_bike') ?? 0) + (statsMap.get('echo_bike') ?? 0) + (statsMap.get('cal_assault_bike') ?? 0), 'mv_bike', 0],
      [() => (statsMap.get('ski_erg') ?? 0) + (statsMap.get('cal_ski_erg') ?? 0), 'mv_ski', 0],
    ];

    // Standard paliers per badge prefix
    const PALIERS: Record<string, number[]> = {};
    // Most movements: 100, 500, 1000 (some with 5000)
    const p4 = [100, 500, 1000, 5000];
    const p3 = [100, 500, 1000];
    const p2 = [100, 500];
    const ergP = [500, 2000, 5000];
    const ergP2 = [500, 2000];
    const duP = [500, 2000, 5000, 10000];
    const suP = [1000, 5000];
    const rmuP = [50, 200, 500];

    // Assign paliers
    for (const prefix of ['mv_thrusters', 'mv_deadlifts', 'mv_clean', 'mv_snatch', 'mv_squat', 'mv_press', 'mv_cj', 'mv_pullup', 'mv_burpee', 'mv_air_squat', 'mv_pushup', 'mv_wallball', 'mv_kb_swing']) PALIERS[prefix] = p4;
    for (const prefix of ['mv_db_snatch', 'mv_db_thruster', 'mv_devil_press', 'mv_db_lunge', 'mv_db_cj', 'mv_c2b', 'mv_t2b', 'mv_hspu', 'mv_situp', 'mv_lunge']) PALIERS[prefix] = p3;
    for (const prefix of ['mv_ohs', 'mv_db_push_press', 'mv_goblet_squat', 'mv_kb_snatch', 'mv_kb_cj', 'mv_turkish_gu', 'mv_kb_thruster', 'mv_k2e', 'mv_pullover', 'mv_ring_dip', 'mv_ring_row', 'mv_wallwalk', 'mv_vup', 'mv_hollow', 'mv_mtclimber', 'mv_pistol', 'mv_burpee_bj', 'mv_bmu', 'mv_mb_slam']) PALIERS[prefix] = p2;
    PALIERS['mv_box_jump'] = p3;
    PALIERS['mv_du'] = duP;
    PALIERS['mv_su'] = suP;
    PALIERS['mv_row'] = ergP;
    PALIERS['mv_bike'] = ergP2;
    PALIERS['mv_ski'] = ergP2;
    PALIERS['mv_ring_mu'] = rmuP;

    for (const [getValue, prefix] of mvBadgeChecks) {
      const val = getValue();
      const thresholds = PALIERS[prefix] ?? p3;
      for (const t of thresholds) {
        if (val >= t) {
          const awarded = await awardBadge(userId, `${prefix}_${t}`);
          if (awarded) newBadges.push(`${prefix}_${t}`);
        }
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

/**
 * Normalize a movement name to a snake_case key for DB storage.
 * e.g. "Clean & Jerk" → "clean_and_jerk", "DB Snatches alt." → "db_snatches_alt"
 */
function normalizeMovement(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[().,]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
