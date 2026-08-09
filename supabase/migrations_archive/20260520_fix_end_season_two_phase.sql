-- ═══════════════════════════════════════════════════════════════════════
-- Fix #2: `end_season_and_advance`
--   Bug: the FOR loop mutates `tournament_division_members` while iterating,
--   so athletes just relegated from D(n) to D(n+1) are immediately picked up
--   by the promotion step of D(n+1) and moved back up.
--
-- Solution: TWO-PHASE — first compute the full list of moves into a temp
-- table, then apply them atomically at the end.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.end_season_and_advance(p_tournament_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_season int;
  d record;
  upper_div uuid;
  lower_div uuid;
BEGIN
  SELECT format, current_season
    INTO v_format, v_season
    FROM public.tournaments
    WHERE id = p_tournament_id;

  IF v_format <> 'league_div' THEN
    RAISE EXCEPTION 'Tournament % is not a league_div tournament', p_tournament_id;
  END IF;

  -- ── 1. Snapshot standings into history with outcome ──────────────────
  WITH ranked AS (
    SELECT
      tdm.id,
      tdm.division_id,
      tdm.athlete_id,
      tdm.points,
      tdiv.level AS div_level,
      tdiv.name  AS div_name,
      tdiv.promote_count,
      tdiv.relegate_count,
      ROW_NUMBER() OVER (
        PARTITION BY tdm.division_id
        ORDER BY tdm.points DESC, COALESCE(tdm.rank, 999999) ASC
      ) AS final_rank,
      COUNT(*) OVER (PARTITION BY tdm.division_id) AS div_size
    FROM public.tournament_division_members tdm
    JOIN public.tournament_divisions tdiv ON tdiv.id = tdm.division_id
    WHERE tdiv.tournament_id = p_tournament_id
  )
  INSERT INTO public.tournament_season_history
    (tournament_id, season_number, division_id, division_level, division_name,
     athlete_id, final_rank, final_points, outcome)
  SELECT
    p_tournament_id,
    v_season,
    r.division_id,
    r.div_level,
    r.div_name,
    r.athlete_id,
    r.final_rank,
    r.points,
    CASE
      WHEN r.div_level = 1 AND r.final_rank = 1 THEN 'champion'
      WHEN r.final_rank <= r.promote_count AND r.div_level > 1 THEN 'promoted'
      WHEN r.final_rank > r.div_size - r.relegate_count
           AND EXISTS (SELECT 1 FROM public.tournament_divisions tdiv2
                       WHERE tdiv2.tournament_id = p_tournament_id
                         AND tdiv2.level = r.div_level + 1) THEN 'relegated'
      ELSE 'stayed'
    END
  FROM ranked r
  ON CONFLICT (tournament_id, season_number, athlete_id) DO NOTHING;

  -- ── 2. Compute moves into temp table (NO mutation yet) ───────────────
  CREATE TEMP TABLE IF NOT EXISTS _season_moves (
    athlete_id      uuid PRIMARY KEY,
    new_division_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE TABLE _season_moves;

  FOR d IN
    SELECT * FROM public.tournament_divisions
    WHERE tournament_id = p_tournament_id
    ORDER BY level
  LOOP
    -- Promote top N to upper division (level - 1) if exists
    IF d.promote_count > 0 AND d.level > 1 THEN
      SELECT id INTO upper_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level - 1;
      IF upper_div IS NOT NULL THEN
        INSERT INTO _season_moves (athlete_id, new_division_id)
        SELECT athlete_id, upper_div
        FROM public.tournament_division_members
        WHERE division_id = d.id
        ORDER BY points DESC, COALESCE(rank, 999999) ASC
        LIMIT d.promote_count
        ON CONFLICT (athlete_id) DO NOTHING;
      END IF;
    END IF;

    -- Relegate bottom N to lower division (level + 1) if exists
    IF d.relegate_count > 0 THEN
      SELECT id INTO lower_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level + 1;
      IF lower_div IS NOT NULL THEN
        INSERT INTO _season_moves (athlete_id, new_division_id)
        SELECT athlete_id, lower_div
        FROM public.tournament_division_members
        WHERE division_id = d.id
        ORDER BY points ASC, COALESCE(rank, 0) DESC
        LIMIT d.relegate_count
        ON CONFLICT (athlete_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Apply all moves atomically ────────────────────────────────────
  UPDATE public.tournament_division_members tdm
    SET division_id = sm.new_division_id,
        points      = 0,
        rank        = NULL
    FROM _season_moves sm,
         public.tournament_divisions tdiv
    WHERE tdm.athlete_id = sm.athlete_id
      AND tdm.division_id = tdiv.id
      AND tdiv.tournament_id = p_tournament_id;

  -- ── 4. Reset points & rank for everyone (clean slate) ────────────────
  UPDATE public.tournament_division_members tdm
    SET points = 0, rank = NULL
    FROM public.tournament_divisions tdiv
    WHERE tdiv.id = tdm.division_id
      AND tdiv.tournament_id = p_tournament_id;

  -- ── 5. Increment current_season ──────────────────────────────────────
  UPDATE public.tournaments
    SET current_season = v_season + 1
    WHERE id = p_tournament_id;

  RETURN v_season + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_season_and_advance(uuid) TO authenticated;
