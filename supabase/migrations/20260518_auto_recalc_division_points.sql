-- ─────────────────────────────────────────────────────────────────────────
-- Auto-recalc tournament_division_members.points whenever scores change
-- (only for league_div format)
--
-- Scoring: per WOD inside each division:
--   1st = 100 pts, 2nd = 97 pts, 3rd = 94 pts, ... (-3 per rank, min 1)
-- ─────────────────────────────────────────────────────────────────────────

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

  -- Reset all points for this tournament's divisions
  UPDATE public.tournament_division_members tdm
  SET points = 0
  FROM public.tournament_divisions d
  WHERE d.id = tdm.division_id
    AND d.tournament_id = p_tournament_id;

  -- Compute new points: per WOD × per division, rank by score_value DESC
  WITH ranked AS (
    SELECT
      tdm.id              AS member_id,
      ts.athlete_id,
      ts.tournament_wod_id,
      ROW_NUMBER() OVER (
        PARTITION BY ts.tournament_wod_id, tdm.division_id
        ORDER BY ts.score_value DESC NULLS LAST
      ) AS rk
    FROM public.tournament_scores ts
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


-- ─── Trigger: fire on every change of tournament_scores ────────────────
CREATE OR REPLACE FUNCTION public.trg_recalc_division_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
BEGIN
  v_tournament_id := COALESCE(NEW.tournament_id, OLD.tournament_id);
  IF v_tournament_id IS NOT NULL THEN
    PERFORM public.recalc_division_points(v_tournament_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_division_points_on_scores ON public.tournament_scores;

CREATE TRIGGER trg_recalc_division_points_on_scores
AFTER INSERT OR UPDATE OF status, score_value OR DELETE
ON public.tournament_scores
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_division_points();


-- ─── Backfill: recalc every existing league_div tournament ─────────────
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id FROM public.tournaments WHERE format = 'league_div'
  LOOP
    PERFORM public.recalc_division_points(rec.id);
  END LOOP;
END $$;
