import { supabase } from '../lib/supabase';
import { awardLevelBadge } from '../services/gamification';

export type EloLevel = 'scaled' | 'inter' | 'rx' | 'rx+' | 'elite' | 'pro';

export const ELO_THRESHOLDS: { min: number; level: EloLevel }[] = [
  { min: 1800, level: 'pro' },
  { min: 1600, level: 'elite' },
  { min: 1400, level: 'rx+' },
  { min: 1200, level: 'rx' },
  { min: 800,  level: 'inter' },
  { min: 0,    level: 'scaled' },
];

export const LEVEL_BADGE_MAP: Record<EloLevel, string> = {
  scaled: 'level_scaled',
  inter:  'level_inter',
  rx:     'level_rx',
  'rx+':  'level_rx_plus',
  elite:  'level_elite',
  pro:    'level_pro',
};

export const LEVEL_BADGE_THRESHOLDS: { minElo: number; badge: string }[] = [
  { minElo: 1800, badge: 'level_pro' },
  { minElo: 1600, badge: 'level_elite' },
  { minElo: 1400, badge: 'level_rx_plus' },
  { minElo: 1200, badge: 'level_rx' },
  { minElo: 1001, badge: 'level_inter' },
];

export function getLevelFromElo(elo: number): EloLevel {
  for (const t of ELO_THRESHOLDS) {
    if (elo >= t.min) return t.level;
  }
  return 'scaled';
}

/**
 * Update the user's level based on their current ELO and award any new level badges.
 * Call this after every ELO computation.
 */
export async function syncLevelAndBadges(userId: string, elo: number): Promise<string[]> {
  const newLevel = getLevelFromElo(elo);

  // Update level in profiles
  await supabase.from('profiles').update({ level: newLevel }).eq('id', userId);

  // Check and award level badges (permanent — once earned, kept forever)
  const newBadges: string[] = [];
  for (const { minElo, badge } of LEVEL_BADGE_THRESHOLDS) {
    if (elo >= minElo) {
      const awarded = await awardLevelBadge(userId, badge);
      if (awarded) newBadges.push(badge);
    }
  }

  return newBadges;
}
