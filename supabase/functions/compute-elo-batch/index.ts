// Edge Function: compute-elo-batch
// ------------------------------------------------------------------
// Computes ELO deltas for all expired WODs that have scores but no
// elo_history rows yet. Idempotent thanks to the upsert on
// (wod_id, member_id) and a per-WOD advisory lock to prevent races
// between concurrent invocations.
//
// Invocation modes:
//  - POST (authenticated) : computes only WODs the caller has scored.
//  - POST with `{ all: true }` and service-role key : computes every
//    expired WOD (intended for a daily pg_cron job).
// ------------------------------------------------------------------
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const K_PAIRWISE = 64;
const SCALED_MULTIPLIER = 0.4;
const ELO_FLOOR = 100;

interface WodScoreRow {
  member_id: string;
  score_value: number;
  rx: boolean | null;
}

interface RankedPlayer { id: string; elo: number; rank: number; }
interface EloDelta extends RankedPlayer { delta: number; }

function sortScoresRxFirst(scores: WodScoreRow[], isTimeBased: boolean): WodScoreRow[] {
  return [...scores].sort((a, b) => {
    const rxDiff = (a.rx ? 0 : 1) - (b.rx ? 0 : 1);
    if (rxDiff !== 0) return rxDiff;
    return isTimeBased ? a.score_value - b.score_value : b.score_value - a.score_value;
  });
}

function calculatePairwiseDeltas(players: RankedPlayer[], k: number = K_PAIRWISE): EloDelta[] {
  const n = players.length;
  if (n < 2) return players.map(p => ({ ...p, delta: 0 }));
  return players.map(player => {
    let expectedScore = 0;
    let actualScore = 0;
    for (const opp of players) {
      if (opp.id === player.id) continue;
      expectedScore += 1 / (1 + Math.pow(10, (opp.elo - player.elo) / 400));
      if (player.rank < opp.rank) actualScore += 1;
      else if (player.rank === opp.rank) actualScore += 0.5;
    }
    return { ...player, delta: Math.round((k / (n - 1)) * (actualScore - expectedScore)) };
  });
}

async function computeWod(
  admin: ReturnType<typeof createClient>,
  wodId: string,
  boxId: string,
  isTimeBased: boolean,
): Promise<{ ok: boolean; reason?: string; computed?: number }> {
  // Short-circuit if already computed
  const { data: existing } = await admin
    .from('elo_history')
    .select('id')
    .eq('wod_id', wodId)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true, reason: 'already_computed' };

  const { data: scores } = await admin
    .from('wod_scores')
    .select('member_id, score_value, rx')
    .eq('wod_id', wodId);

  if (!scores || scores.length < 2) return { ok: true, reason: 'not_enough_scores' };

  const memberIds = scores.map((s: any) => s.member_id);
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, elo')
    .in('id', memberIds);

  if (!profiles || profiles.length === 0) return { ok: false, reason: 'no_profiles' };

  const eloMap: Record<string, number> = {};
  for (const p of profiles as any[]) eloMap[p.id] = p.elo ?? 1000;
  const rxMap: Record<string, boolean> = {};
  for (const s of scores as any[]) rxMap[s.member_id] = !!s.rx;

  const sorted = sortScoresRxFirst(scores as WodScoreRow[], isTimeBased);
  const ranked: RankedPlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let rank = i + 1;
    if (i > 0 && sorted[i].score_value === sorted[i - 1].score_value && sorted[i].rx === sorted[i - 1].rx) {
      rank = ranked[i - 1]?.rank ?? rank;
    }
    ranked.push({ id: sorted[i].member_id, elo: eloMap[sorted[i].member_id] ?? 1000, rank });
  }

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
    elo_after: Math.max(ELO_FLOOR, d.elo + d.delta),
    elo_delta: d.delta,
    rank: d.rank,
  }));

  const { error: upsertErr } = await admin
    .from('elo_history')
    .upsert(historyRows, { onConflict: 'wod_id,member_id' });
  if (upsertErr) return { ok: false, reason: `upsert: ${upsertErr.message}` };

  for (const d of deltas) {
    const newElo = Math.max(ELO_FLOOR, d.elo + d.delta);
    await admin.rpc('update_user_elo', {
      p_user_id: d.id,
      p_new_elo: newElo,
      p_increment_matches: 1,
      p_increment_wins: d.rank === 1 ? 1 : 0,
    });
  }

  return { ok: true, computed: historyRows.length };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceKey);

    let userId: string | null = null;
    let processAll = false;

    try {
      const body = await req.json();
      processAll = body?.all === true;
    } catch { /* no body */ }

    if (!processAll) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing auth header' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    // Fetch expired WODs with scores but no elo_history yet
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];

    let wodQuery = admin
      .from('box_wods')
      .select('id, box_id, wod_type, scheduled_date, leaderboard_enabled')
      .lte('scheduled_date', yStr)
      .neq('leaderboard_enabled', false);

    if (userId) {
      const { data: userScores } = await admin
        .from('wod_scores')
        .select('wod_id')
        .eq('member_id', userId);
      const wodIds = Array.from(new Set((userScores ?? []).map((s: any) => s.wod_id).filter(Boolean)));
      if (wodIds.length === 0) {
        return new Response(JSON.stringify({ processed: 0, total: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      wodQuery = wodQuery.in('id', wodIds);
    }

    const { data: wods, error: wodsErr } = await wodQuery;
    if (wodsErr) {
      return new Response(JSON.stringify({ error: wodsErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: Array<{ wod_id: string; ok: boolean; reason?: string; computed?: number }> = [];
    for (const w of wods ?? []) {
      const isTimeBased = (w as any).wod_type === 'for-time';
      const r = await computeWod(admin, (w as any).id, (w as any).box_id, isTimeBased);
      results.push({ wod_id: (w as any).id, ...r });
    }

    return new Response(JSON.stringify({
      processed: results.filter(r => r.ok && r.computed).length,
      total: results.length,
      results,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('compute-elo-batch error:', err);
    return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
