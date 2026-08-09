-- ═══════════════════════════════════════════════════════════════════════════
-- ELO gains/losses per tournament format
--
-- Requirement (user):
--   * classique (format 'simple')  → ELO at tournament close (already handled by
--     compute_tournament_elo). We only make sure that function no longer applies
--     to bracket/swiss/league, which now earn ELO incrementally.
--   * bracket / swiss              → ELO applied per match (head-to-head).
--   * league (league_div)          → ELO applied at the end of each WOD
--     (pairwise within each division for that WOD).
--
-- All entry points stay owner/coach/admin only (is_tournament_manager). ELO is
-- floored at 100. History tables make every computation idempotent, and the
-- per-match trigger is reversible when a result is annulled.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. History tables ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_match_elo_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES public.tournament_bracket_matches(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL,
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opponent_id   uuid,
  result        text NOT NULL CHECK (result IN ('win','loss')),
  elo_before    int  NOT NULL,
  elo_after     int  NOT NULL,
  elo_delta     int  NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_tmeh_athlete ON public.tournament_match_elo_history(athlete_id);
CREATE INDEX IF NOT EXISTS idx_tmeh_tournament ON public.tournament_match_elo_history(tournament_id);

CREATE TABLE IF NOT EXISTS public.tournament_wod_elo_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_wod_id uuid NOT NULL REFERENCES public.tournament_wods(id) ON DELETE CASCADE,
  tournament_id     uuid NOT NULL,
  division_id       uuid,
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  elo_before        int  NOT NULL,
  elo_after         int  NOT NULL,
  elo_delta         int  NOT NULL,
  rank              int  NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_wod_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_tweh_athlete ON public.tournament_wod_elo_history(athlete_id);
CREATE INDEX IF NOT EXISTS idx_tweh_tournament ON public.tournament_wod_elo_history(tournament_id);

ALTER TABLE public.tournament_match_elo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_wod_elo_history   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tmeh_read ON public.tournament_match_elo_history;
CREATE POLICY tmeh_read ON public.tournament_match_elo_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tweh_read ON public.tournament_wod_elo_history;
CREATE POLICY tweh_read ON public.tournament_wod_elo_history FOR SELECT TO authenticated USING (true);

-- ── 2. Classique close: skip formats that earn ELO incrementally ────────────
-- compute_tournament_elo previously ran for every format at close. Bracket /
-- swiss / league now distribute ELO per match / per WOD, so re-running the
-- aggregate close ELO would double-count. Guard it: for those formats we only
-- mark the tournament completed and return.
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
#variable_conflict use_column
DECLARE
  v_n      int;
  v_avg    int;
  v_format text;
  k_tourn  constant numeric := 48;
BEGIN
  -- Only staff can close a tournament (matches existing tournament RLS).
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = p_tournament_id;

  -- Incremental-ELO formats: don't apply aggregate close ELO, just complete.
  IF v_format IN ('bracket','swiss','league_div') THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
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

-- ── 3. Bracket / Swiss: per-match head-to-head ELO (trigger) ────────────────
-- Fires whenever a bracket match's winner changes. Reverses any previously
-- applied ELO for that match first (handles "annuler le résultat" and winner
-- changes), then applies the new head-to-head result. K = 32, floor 100.
-- BYEs and half-populated matches are ignored.
CREATE OR REPLACE FUNCTION public.apply_bracket_match_elo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_match constant numeric := 32;
  v_win   uuid;
  v_lose  uuid;
  v_we    int;
  v_le    int;
  v_exp_w numeric;
  v_delta int;
  v_after_w int;
  v_after_l int;
  h       record;
BEGIN
  -- Reverse a previous result when the winner changes (reset or correction).
  IF TG_OP = 'UPDATE' AND OLD.winner_id IS DISTINCT FROM NEW.winner_id THEN
    FOR h IN SELECT * FROM tournament_match_elo_history WHERE match_id = OLD.id LOOP
      UPDATE profiles p
         SET elo           = GREATEST(100, p.elo - h.elo_delta),
             total_matches = GREATEST(0, p.total_matches - 1),
             wins          = CASE WHEN h.result = 'win' THEN GREATEST(0, p.wins - 1) ELSE p.wins END
       WHERE p.id = h.athlete_id;
    END LOOP;
    DELETE FROM tournament_match_elo_history WHERE match_id = OLD.id;
  END IF;

  -- Apply the new result for a real, completed 1v1 match.
  IF NEW.winner_id IS NOT NULL
     AND NEW.status = 'completed'
     AND NEW.side IN ('winner','loser','grand_final')
     AND NEW.participant1_id IS NOT NULL
     AND NEW.participant2_id IS NOT NULL
     AND NEW.participant1_id <> NEW.participant2_id
     AND NEW.winner_id IN (NEW.participant1_id, NEW.participant2_id) THEN

    v_win  := NEW.winner_id;
    v_lose := CASE WHEN NEW.winner_id = NEW.participant1_id
                   THEN NEW.participant2_id ELSE NEW.participant1_id END;

    SELECT COALESCE(elo, 1000) INTO v_we FROM profiles WHERE id = v_win;
    SELECT COALESCE(elo, 1000) INTO v_le FROM profiles WHERE id = v_lose;
    IF v_we IS NULL OR v_le IS NULL THEN
      RETURN NEW;
    END IF;

    v_exp_w := 1.0 / (1.0 + POWER(10, (v_le - v_we) / 400.0));
    v_delta := ROUND(k_match * (1 - v_exp_w))::int;
    IF v_delta < 1 THEN v_delta := 1; END IF;   -- guarantee a minimum swing

    v_after_w := GREATEST(100, v_we + v_delta);
    v_after_l := GREATEST(100, v_le - v_delta);

    INSERT INTO tournament_match_elo_history
      (match_id, tournament_id, athlete_id, opponent_id, result, elo_before, elo_after, elo_delta)
    VALUES
      (NEW.id, NEW.tournament_id, v_win,  v_lose, 'win',  v_we, v_after_w, v_after_w - v_we),
      (NEW.id, NEW.tournament_id, v_lose, v_win,  'loss', v_le, v_after_l, v_after_l - v_le)
    ON CONFLICT (match_id, athlete_id) DO NOTHING;

    UPDATE profiles SET elo = v_after_w, total_matches = total_matches + 1, wins = wins + 1 WHERE id = v_win;
    UPDATE profiles SET elo = v_after_l, total_matches = total_matches + 1                    WHERE id = v_lose;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bracket_match_elo ON public.tournament_bracket_matches;
CREATE TRIGGER trg_bracket_match_elo
  AFTER INSERT OR UPDATE OF winner_id, status ON public.tournament_bracket_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_bracket_match_elo();

-- ── 4. League: per-WOD ELO within each division ─────────────────────────────
-- Owner action "attribuer l'ELO de ce WOD". Pairwise ELO among the athletes of
-- each division who have a validated score for the WOD, ranked by WOD type
-- (For Time = ascending, else descending). K = 64, floor 100. Idempotent.
CREATE OR REPLACE FUNCTION public.compute_league_wod_elo(p_tournament_wod_id uuid)
RETURNS TABLE (
  athlete_id  uuid,
  division_id uuid,
  elo_before  int,
  elo_after   int,
  elo_delta   int,
  rank        int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_tournament_id uuid;
  v_type          text;
  v_format        text;
  k_wod           constant numeric := 64;
BEGIN
  SELECT tw.tournament_id, tw.type INTO v_tournament_id, v_type
    FROM tournament_wods tw WHERE tw.id = p_tournament_wod_id;
  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  IF NOT is_tournament_manager(v_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = v_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RAISE EXCEPTION 'ELO par WOD réservé aux ligues (league_div)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lw:' || p_tournament_wod_id::text));

  IF EXISTS (SELECT 1 FROM tournament_wod_elo_history h WHERE h.tournament_wod_id = p_tournament_wod_id) THEN
    RETURN;
  END IF;

  -- Ranked field per division for this WOD (numeric, direction by WOD type).
  CREATE TEMP TABLE _lw_field ON COMMIT DROP AS
  WITH scored AS (
    SELECT ts.athlete_id,
           tdm.division_id,
           COALESCE(p.elo, 1000)::int AS elo,
           NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric AS num
      FROM tournament_scores ts
      JOIN tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
      JOIN tournament_divisions d ON d.id = tdm.division_id AND d.tournament_id = v_tournament_id
      JOIN profiles p ON p.id = ts.athlete_id
     WHERE ts.tournament_wod_id = p_tournament_wod_id
       AND ts.status = 'validated'
  ),
  ranked AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             PARTITION BY s.division_id
             ORDER BY
               CASE WHEN v_type = 'For Time'  THEN COALESCE(s.num,  'Infinity'::numeric) END ASC  NULLS LAST,
               CASE WHEN v_type <> 'For Time' THEN COALESCE(s.num, '-Infinity'::numeric) END DESC NULLS LAST
           )::int AS rank,
           COUNT(*) OVER (PARTITION BY s.division_id)::int AS div_n
      FROM scored s
  )
  SELECT athlete_id, division_id, elo, rank, div_n FROM ranked;

  -- Pairwise ELO within each division for this WOD.
  CREATE TEMP TABLE _lw_deltas ON COMMIT DROP AS
  SELECT a.athlete_id, a.division_id, a.elo AS elo_before, a.rank,
         ROUND(
           (k_wod / GREATEST(1, (a.div_n - 1))) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1
                                       WHEN a.rank = b.rank THEN 0.5
                                       ELSE 0 END), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
           )
         )::int AS elo_delta
    FROM _lw_field a
   WHERE a.div_n >= 2;

  INSERT INTO tournament_wod_elo_history
    (tournament_wod_id, tournament_id, division_id, athlete_id, elo_before, elo_after, elo_delta, rank)
  SELECT p_tournament_wod_id, v_tournament_id, d.division_id, d.athlete_id,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before, d.rank
    FROM _lw_deltas d
  ON CONFLICT (tournament_wod_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _lw_deltas d
   WHERE p.id = d.athlete_id;

  RETURN QUERY
    SELECT d.athlete_id, d.division_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _lw_deltas d;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_league_wod_elo(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.compute_league_wod_elo(uuid) TO authenticated;

-- ── 5. Fix league division points numeric parse ────────────────────────────
-- recalc_division_points (migration 20260619) used
-- substring(score_value from '^-?[0-9]+(\.[0-9]+)?'). With a capturing group,
-- Postgres returns the GROUP (the optional decimals) — so integer scores parse
-- to NULL and fall back to ±Infinity, breaking the numeric ranking it was meant
-- to fix. Wrap the whole number in one capturing group (inner group made
-- non-capturing) so integers parse correctly.
CREATE OR REPLACE FUNCTION public.recalc_division_points(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format text;
BEGIN
  SELECT format INTO v_format FROM public.tournaments WHERE id = p_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RETURN;
  END IF;

  UPDATE public.tournament_division_members tdm
  SET points = 0
  FROM public.tournament_divisions d
  WHERE d.id = tdm.division_id
    AND d.tournament_id = p_tournament_id;

  WITH ranked AS (
    SELECT
      tdm.id AS member_id,
      ROW_NUMBER() OVER (
        PARTITION BY ts.tournament_wod_id, tdm.division_id
        ORDER BY
          CASE WHEN tw.type = 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric, 'Infinity'::numeric)
          END ASC NULLS LAST,
          CASE WHEN tw.type <> 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric, '-Infinity'::numeric)
          END DESC NULLS LAST
      ) AS rk
    FROM public.tournament_scores ts
    JOIN public.tournament_wods tw ON tw.id = ts.tournament_wod_id
    JOIN public.tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
    JOIN public.tournament_divisions d ON d.id = tdm.division_id
    WHERE d.tournament_id = p_tournament_id
      AND ts.tournament_id = p_tournament_id
      AND ts.status = 'validated'
  ),
  totals AS (
    SELECT member_id, SUM(GREATEST(1, 100 - (rk::int - 1) * 3)) AS pts
    FROM ranked
    GROUP BY member_id
  )
  UPDATE public.tournament_division_members tdm
  SET points = totals.pts
  FROM totals
  WHERE tdm.id = totals.member_id;
END;
$$;

-- Backfill existing leagues with the corrected parse.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM public.tournaments WHERE format = 'league_div' LOOP
    PERFORM public.recalc_division_points(rec.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
