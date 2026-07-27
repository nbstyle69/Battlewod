-- ═══════════════════════════════════════════════════════════════════════════
-- Exclude unresolved CONTESTED scores from daily-tournament ranking + ELO.
--
-- Rule (product decision): a score marked `contested` by a peer must NOT count
-- toward the classement or the ELO distribution until an admin resolves it.
--   * Admin validates → status becomes 'validated' → it counts.
--   * Admin rejects   → the score row is deleted → it's gone.
--   * Left `contested` at closure → it is ignored (never counts).
--
-- ELO freezes lazily at `ends_at`, so any contest still open at closure is
-- excluded permanently — arbitration must happen before the tournament ends.
--
-- Only the daily-tournament path has peer validation (pending/validated/contested);
-- box-whiteboard WODs and owner tournaments are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

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
SET search_path = public, pg_temp
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
       -- Unresolved contested scores don't count toward ranking/ELO.
       AND COALESCE(s.status, 'pending') <> 'contested'
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

NOTIFY pgrst, 'reload schema';
