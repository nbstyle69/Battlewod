import { supabase } from '../lib/supabase';
import { calculatePairwiseDeltas, RankedPlayer, SCALED_MULTIPLIER } from '../utils/elo';
import { syncLevelAndBadges } from '../utils/eloLevels';
import { WODScore } from '../types';

export function sortScoresRxFirst(scores: WODScore[], isTimeBased: boolean): WODScore[] {
  return [...scores].sort((a, b) => {
    const rxDiff = (a.rx ? 0 : 1) - (b.rx ? 0 : 1);
    if (rxDiff !== 0) return rxDiff;
    return isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value;
  });
}

export async function computeAndSaveElo(wodId: string, boxId: string, scores: WODScore[], isTimeBased: boolean) {
  try {
    if (scores.length < 2) return;

    const memberIds = scores.map(s => s.member_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, elo')
      .in('id', memberIds);

    if (!profiles || profiles.length === 0) { console.log('[eloCompute] no profiles found'); return; }

    const eloMap: Record<string, number> = {};
    for (const p of profiles) eloMap[p.id] = p.elo ?? 1000;

    const rxMap: Record<string, boolean> = {};
    for (const s of scores) rxMap[s.member_id] = !!s.rx;

    const sorted = sortScoresRxFirst(scores, isTimeBased);

    const ranked: (RankedPlayer & { isScaled: boolean })[] = sorted.map((s, i) => {
      let rank = i + 1;
      if (i > 0 && sorted[i].score_value === sorted[i - 1].score_value && sorted[i].rx === sorted[i - 1].rx) {
        rank = ranked[i - 1]?.rank ?? rank;
      }
      return { id: s.member_id, elo: eloMap[s.member_id] ?? 1000, rank, isScaled: !s.rx };
    });

    const rawDeltas = calculatePairwiseDeltas(ranked);

    const deltas = rawDeltas.map(d => ({
      ...d,
      delta: Math.round(d.delta * (rxMap[d.id] ? 1 : SCALED_MULTIPLIER)),
    }));

    const historyRows = deltas.map(d => ({
      box_id: boxId,
      wod_id: wodId,
      member_id: d.id,
      elo_before: d.elo,
      elo_after: d.elo + d.delta,
      elo_delta: d.delta,
      rank: d.rank,
    }));

    console.log('[eloCompute] upserting', historyRows.length, 'rows for wod', wodId);
    const { error: upsertErr } = await supabase.from('elo_history').upsert(historyRows, { onConflict: 'wod_id,member_id' });
    if (upsertErr) { console.log('[eloCompute] upsert error:', upsertErr.message); return; }

    for (const d of deltas) {
      const newElo = d.elo + d.delta;
      await supabase.rpc('update_user_elo', {
        p_user_id: d.id,
        p_new_elo: newElo,
        p_increment_matches: 1,
        p_increment_wins: d.rank === 1 ? 1 : 0,
      });
      await syncLevelAndBadges(d.id, newElo);
    }
    console.log('[eloCompute] done for wod', wodId);
  } catch (err: any) {
    console.log('[eloCompute] CRASH:', err?.message, err);
  }
}
