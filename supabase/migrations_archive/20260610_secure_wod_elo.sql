-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY: move WOD ELO computation server-side + lock down update_user_elo
--
-- Rationale (audit A1 + A2):
--   * update_user_elo was SECURITY DEFINER, executable by any authenticated
--     user, with no authorization or bounds → anyone could rewrite anyone's
--     ELO / wins / matches.
--   * ELO was computed client-side and the final value pushed via that RPC,
--     which also allowed double-counting of total_matches/wins.
--
-- Fix: compute the whole thing server-side from the stored wod_scores, in a
-- single idempotent SECURITY DEFINER function that the client can only trigger
-- (never supply values to). Then revoke direct execute on update_user_elo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Lock down the raw ELO setter ─────────────────────────────────────────
-- Keep the function (used internally by SECURITY DEFINER routines that run as
-- the owner), but forbid the client roles from calling it directly.
REVOKE EXECUTE ON FUNCTION public.update_user_elo(uuid, int, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_user_elo(uuid, int, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_user_elo(uuid, int, int, int) FROM authenticated;

-- ── 2. Server-side WOD ELO computation ──────────────────────────────────────
-- Mirrors src/utils/elo.ts calculatePairwiseDeltas (K=64) + the RX/scaled
-- multiplier (0.4) and RX-first tie-aware ranking from src/services/eloCompute.ts.
-- Idempotent: does nothing if elo_history already exists for the WOD.
CREATE OR REPLACE FUNCTION public.compute_wod_elo(p_wod_id uuid)
RETURNS TABLE (
  member_id  uuid,
  elo_before int,
  elo_after  int,
  elo_delta  int,
  rank       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_id       uuid;
  v_is_time      boolean;
  v_lb_enabled   boolean;
  v_n            int;
  k_pairwise     constant numeric := 64;
  scaled_mult    constant numeric := 0.4;
BEGIN
  -- Resolve the WOD + its box + scoring direction.
  SELECT bw.box_id,
         (bw.wod_type = 'for-time'),
         COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw
   WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  -- Authorization: caller must be an active member (or the owner) of the box.
  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id
         AND bm.member_id = auth.uid()
         AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN
    RETURN;
  END IF;

  -- Serialize concurrent triggers for the same WOD so ELO is applied once.
  PERFORM pg_advisory_xact_lock(hashtext(p_wod_id::text));

  -- Idempotency: already computed.
  IF EXISTS (SELECT 1 FROM elo_history eh WHERE eh.wod_id = p_wod_id) THEN
    RETURN;
  END IF;

  -- Build the ranked field (RX before scaled, then by score direction),
  -- with tie handling identical to the client (same score AND same rx).
  CREATE TEMP TABLE _wod_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id,
           COALESCE(p.elo, 1000)::int AS elo,
           ws.score_value,
           COALESCE(ws.rx, false)      AS rx
      FROM wod_scores ws
      JOIN profiles p ON p.id = ws.member_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    -- Dense-ish rank: equal (rx, score_value) share the smallest seq.
    SELECT o.*,
           MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk
      FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _wod_field;
  IF v_n < 2 THEN
    RETURN;
  END IF;

  -- Pairwise ELO deltas computed against every other player.
  CREATE TEMP TABLE _wod_deltas ON COMMIT DROP AS
  SELECT a.member_id,
         a.elo AS elo_before,
         a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             -- actual score
             (SELECT COALESCE(SUM(
                CASE WHEN a.rank < b.rank THEN 1
                     WHEN a.rank = b.rank THEN 0.5
                     ELSE 0 END), 0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
             -- expected score
             - (SELECT COALESCE(SUM(
                  1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _wod_field a;

  -- Persist history (unique on wod_id, member_id) + update profiles atomically.
  INSERT INTO elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before, d.elo_before + d.elo_delta, d.elo_delta, d.rank
    FROM _wod_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = d.elo_before + d.elo_delta,
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _wod_deltas d
   WHERE p.id = d.member_id;

  RETURN QUERY
    SELECT d.member_id, d.elo_before, (d.elo_before + d.elo_delta) AS elo_after, d.elo_delta, d.rank
      FROM _wod_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_wod_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_wod_elo(uuid) TO authenticated;

-- ── 3. Server-side DAILY TOURNAMENT ELO (pairwise, K=64) ────────────────────
-- Mirrors DailyTournamentDetailScreen.computeAndSaveEloForTournament.
CREATE OR REPLACE FUNCTION public.compute_daily_tournament_elo(p_tournament_id uuid)
RETURNS TABLE (
  user_id    uuid,
  elo_before int,
  elo_after  int,
  elo_delta  int,
  final_rank int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_time   boolean;
  v_n         int;
  k_pairwise  constant numeric := 64;
  scaled_mult constant numeric := 0.4;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT (dt.score_mode = 'time') INTO v_is_time
    FROM daily_tournaments dt WHERE dt.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournoi introuvable';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dt:' || p_tournament_id::text));

  IF EXISTS (SELECT 1 FROM daily_tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _dt_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT s.user_id,
           COALESCE(p.elo, 1000)::int AS elo,
           s.score_value,
           COALESCE(s.rx, false)      AS rx
      FROM daily_tournament_scores s
      JOIN profiles p ON p.id = s.user_id
     WHERE s.tournament_id = p_tournament_id
  ),
  ordered AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk
      FROM ordered o
  )
  SELECT user_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _dt_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _dt_deltas ON COMMIT DROP AS
  SELECT a.user_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _dt_field a;

  INSERT INTO daily_tournament_elo_history (tournament_id, user_id, elo_before, elo_after, elo_delta, final_rank)
  SELECT p_tournament_id, d.user_id, d.elo_before, d.elo_before + d.elo_delta, d.elo_delta, d.rank
    FROM _dt_deltas d
  ON CONFLICT (tournament_id, user_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = d.elo_before + d.elo_delta,
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _dt_deltas d
   WHERE p.id = d.user_id;

  RETURN QUERY
    SELECT d.user_id, d.elo_before, (d.elo_before + d.elo_delta) AS elo_after, d.elo_delta, d.rank
      FROM _dt_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_daily_tournament_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_daily_tournament_elo(uuid) TO authenticated;

-- ── 4. Server-side BOX-OWNER TOURNAMENT ELO (avg-opponent, K=48, floor 100) ──
-- Mirrors BOTournamentScreen.performTournamentClose. Rank strictly by score DESC.
CREATE OR REPLACE FUNCTION public.compute_tournament_elo(p_tournament_id uuid)
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
DECLARE
  v_n     int;
  v_avg   int;
  k_tourn constant numeric := 48;
BEGIN
  -- Only staff can close a tournament (matches existing tournament RLS).
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('t:' || p_tournament_id::text));

  IF EXISTS (SELECT 1 FROM tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _t_field ON COMMIT DROP AS
  SELECT tp.athlete_id,
         COALESCE(p.elo, 1000)::int AS elo,
         ROW_NUMBER() OVER (ORDER BY tp.score DESC)::int AS rank
    FROM tournament_participants tp
    JOIN profiles p ON p.id = tp.athlete_id
   WHERE tp.tournament_id = p_tournament_id;

  SELECT COUNT(*) INTO v_n FROM _t_field;
  IF v_n < 2 THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _t_field;

  CREATE TEMP TABLE _t_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_tourn * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _t_field f;

  INSERT INTO tournament_elo_history
    (tournament_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_tournament_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change), d.elo_change
    FROM _t_deltas d
  ON CONFLICT (tournament_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _t_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after, d.elo_change
      FROM _t_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_tournament_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_tournament_elo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
