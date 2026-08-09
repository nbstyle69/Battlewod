-- ─────────────────────────────────────────────────────────────────────────
-- Fix: league division points ranking
--
-- Bug 1: recalc_division_points ranked scores with `ORDER BY score_value DESC`
--        on a TEXT column → lexicographic sort ("99" > "153" > "100"), so
--        division points / promotions / relegations were wrong.
-- Bug 2: it always sorted DESC, ignoring WOD type. For "For Time" WODs a
--        LOWER score is better and must sort ASC.
--
-- Fix: cast the leading numeric part of score_value to numeric (mirrors the
--      app's parseFloat) and pick the sort direction from the WOD type,
--      matching rankWodScores() in src/utils/tournamentUtils.ts.
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

  -- Compute new points: per WOD × per division, ranked numerically with the
  -- correct direction (For Time = ascending, everything else = descending).
  WITH ranked AS (
    SELECT
      tdm.id              AS member_id,
      ROW_NUMBER() OVER (
        PARTITION BY ts.tournament_wod_id, tdm.division_id
        ORDER BY
          CASE WHEN tw.type = 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^-?[0-9]+(\.[0-9]+)?'), '')::numeric, 'Infinity'::numeric)
          END ASC NULLS LAST,
          CASE WHEN tw.type <> 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^-?[0-9]+(\.[0-9]+)?'), '')::numeric, '-Infinity'::numeric)
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

-- Backfill: recompute every existing league_div tournament with the fix
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM public.tournaments WHERE format = 'league_div'
  LOOP
    PERFORM public.recalc_division_points(rec.id);
  END LOOP;
END $$;
