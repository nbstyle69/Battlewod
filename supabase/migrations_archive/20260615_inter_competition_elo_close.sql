-- ═══════════════════════════════════════════════════════════════════════
-- Inter-box competition ELO distribution on close (server-side, secure)
--
-- Until now, closing an inter-box competition computed ELO CLIENT-SIDE in
-- BOInterCompetitionScreen (sum of raw score_value DESC + per-athlete
-- update_user_elo calls) — not atomic, not idempotent, ignored scoring_type,
-- and left no ELO history. This mirrors the established tournament pattern
-- (compute_tournament_elo): a SECURITY DEFINER RPC that ranks, computes the
-- avg-opponent ELO delta (K=48, floor 100), persists history, updates
-- profiles, closes the competition, and returns the deltas — all in one txn.
--
-- Ranking is CrossFit-Games style: for each athlete, points = SUM of their
-- per-WOD rank (from the inter_standings view, which already respects
-- scoring_type: time ASC, everything else DESC) + a penalty of (field+1) per
-- WOD they have no validated score for. Lowest points = best (final_rank 1).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. ELO history table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inter_elo_history (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id      uuid        NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  athlete_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_rank          integer     NOT NULL,
  participants_count  integer     NOT NULL,
  avg_opponent_elo    integer     NOT NULL,
  elo_before          integer     NOT NULL,
  elo_after           integer     NOT NULL,
  elo_change          integer     NOT NULL,
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, athlete_id)
);

ALTER TABLE public.inter_elo_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_elo_history_read" ON public.inter_elo_history;
CREATE POLICY "inter_elo_history_read" ON public.inter_elo_history
  FOR SELECT USING (
    auth.uid() = athlete_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

DROP POLICY IF EXISTS "inter_elo_history_admin_write" ON public.inter_elo_history;
CREATE POLICY "inter_elo_history_admin_write" ON public.inter_elo_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

CREATE INDEX IF NOT EXISTS idx_inter_elo_history_competition ON public.inter_elo_history(competition_id);
CREATE INDEX IF NOT EXISTS idx_inter_elo_history_athlete     ON public.inter_elo_history(athlete_id);

-- ── 2. Close + distribute ELO ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_inter_competition_elo(p_competition_id uuid)
RETURNS TABLE (
  athlete_id uuid,
  final_rank int,
  elo_before int,
  elo_after  int,
  elo_change int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_n     int;
  v_wods  int;
  v_avg   int;
  k_inter constant numeric := 48;
BEGIN
  -- Only the competition creator or an admin can close it.
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ic:' || p_competition_id::text));

  -- Idempotent: if already computed, do nothing.
  IF EXISTS (SELECT 1 FROM inter_elo_history h WHERE h.competition_id = p_competition_id) THEN
    RETURN;
  END IF;

  -- Number of distinct WODs that received at least one validated score.
  SELECT COUNT(DISTINCT s.wod_id) INTO v_wods
    FROM inter_standings s
   WHERE s.competition_id = p_competition_id;

  -- Per-athlete rank sums (before missed-WOD penalty).
  CREATE TEMP TABLE _ic_base ON COMMIT DROP AS
  SELECT s.athlete_id,
         COALESCE(p.elo, 1000)::int AS elo,
         SUM(s.rank)::numeric        AS rank_sum,
         COUNT(*)::int               AS wods_done
    FROM inter_standings s
    JOIN profiles p ON p.id = s.athlete_id
   WHERE s.competition_id = p_competition_id
     AND s.athlete_id IS NOT NULL
   GROUP BY s.athlete_id, p.elo;

  SELECT COUNT(*) INTO v_n FROM _ic_base;
  IF v_n < 2 THEN
    UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;
    RETURN;
  END IF;

  -- Apply missed-WOD penalty and assign final ranks (lowest points = best).
  CREATE TEMP TABLE _ic_field ON COMMIT DROP AS
  SELECT b.athlete_id,
         b.elo,
         (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) AS points,
         ROW_NUMBER() OVER (
           ORDER BY (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) ASC, b.wods_done DESC, b.elo DESC
         )::int AS rank
    FROM _ic_base b;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _ic_field;

  CREATE TEMP TABLE _ic_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_inter * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _ic_field f;

  INSERT INTO inter_elo_history
    (competition_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_competition_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change), d.elo_change
    FROM _ic_deltas d
  ON CONFLICT (competition_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _ic_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after, d.elo_change
      FROM _ic_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_inter_competition_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_inter_competition_elo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
