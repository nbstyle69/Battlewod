import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';

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
  return (data ?? []) as EarnedBadge[];
}

export async function getStreak(userId: string): Promise<StreakInfo> {
  const { data } = await supabase
    .from('athlete_streaks')
    .select('*')
    .eq('athlete_id', userId)
    .single();
  if (!data) return { current_streak: 0, longest_streak: 0, week_session_count: 0, week_start: '' };
  return data as StreakInfo;
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

  // Send local notification for badge unlock
  try {
    const { title, icon } = await getBadgeTitle(badgeKey);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${icon} Badge débloqué !`,
        body: title,
        data: { type: 'badge_unlock', badgeKey },
      },
      trigger: null, // immediate
    });
  } catch {}

  return true;
}

// ── Record activity for streak tracking ─────────────────────────────

export async function recordActivity(userId: string): Promise<string[]> {
  const newBadges: string[] = [];

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

    // Check if we just hit 3 sessions this week → validate the week
    if (existing.week_session_count < 3 && newCount >= 3) {
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
    // Different week
    const lastWeekEnd = new Date(storedWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
    const isConsecutive = currentWeekStart === getWeekStart(lastWeekEnd) ||
                          daysBetween(storedWeekStart, currentWeekStart) === 7;

    // If last week was validated (>=3) and this is the next week, keep streak
    // If last week was NOT validated or gap > 1 week, reset streak
    const lastWeekValidated = existing.week_session_count >= 3;
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
    // ELO
    [(counters.elo ?? 0) >= 1200, 'elo_1200'],
    [(counters.elo ?? 0) >= 1500, 'elo_1500'],
    [(counters.elo ?? 0) >= 2000, 'elo_2000'],
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

  // Record activity for streak
  const streakBadges = await recordActivity(userId);

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
