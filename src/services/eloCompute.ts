import { supabase } from '../lib/supabase';
import { log } from '../lib/logger';
import { syncLevelAndBadges } from '../utils/eloLevels';
import { WODScore } from '../types';

export function sortScoresRxFirst(scores: WODScore[], isTimeBased: boolean): WODScore[] {
  return [...scores].sort((a, b) => {
    const rxDiff = (a.rx ? 0 : 1) - (b.rx ? 0 : 1);
    if (rxDiff !== 0) return rxDiff;
    return isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value;
  });
}

interface WodEloRow {
  member_id: string;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  rank: number;
}

// ELO is computed and persisted entirely server-side (compute_wod_elo RPC).
// The client only triggers the computation; it never supplies ELO values.
// The RPC is idempotent (no-op if elo_history already exists for the WOD).
export async function computeAndSaveElo(wodId: string, _boxId: string, scores: WODScore[], _isTimeBased: boolean) {
  try {
    if (scores.length < 2) return;

    const { data, error } = await supabase.rpc('compute_wod_elo', { p_wod_id: wodId });
    if (error) { log.warn('[eloCompute] compute_wod_elo error:', error.message); return; }

    const rows = (data ?? []) as WodEloRow[];
    // Sync display level + badges from the authoritative server-computed ELO.
    for (const r of rows) {
      await syncLevelAndBadges(r.member_id, r.elo_after);
    }

    // Box-scoped ELO ranking (distinct from the global/tournament ELO).
    const { error: boxErr } = await supabase.rpc('compute_box_elo', { p_wod_id: wodId });
    if (boxErr) log.warn('[eloCompute] compute_box_elo error:', boxErr.message);

    log.debug('[eloCompute] done for wod', wodId, '—', rows.length, 'athletes');
  } catch (err: any) {
    log.error('[eloCompute] CRASH', err, { wodId });
  }
}
