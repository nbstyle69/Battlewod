-- ═══════════════════════════════════════════════════════════════════════
-- Fix: `end_season_and_advance` — alias `d` clashes with PL/pgSQL record var
--   PG error: record "d" is not assigned yet
-- Rename SQL aliases to `tdiv` / `tdiv2` to avoid collision.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.end_season_and_advance(p_tournament_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_season int;
  d record;
  upper_div uuid;
  lower_div uuid;
  promoted uuid[];
  relegated uuid[];
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

  -- ── 2. Apply promote / relegate ─────────────────────────────────────
  FOR d IN
    SELECT * FROM public.tournament_divisions
    WHERE tournament_id = p_tournament_id
    ORDER BY level
  LOOP
    -- promote top N to upper division (level - 1) if exists
    IF d.promote_count > 0 AND d.level > 1 THEN
      SELECT id INTO upper_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level - 1;
      IF upper_div IS NOT NULL THEN
        SELECT array_agg(athlete_id) INTO promoted FROM (
          SELECT athlete_id FROM public.tournament_division_members
          WHERE division_id = d.id
          ORDER BY points DESC, COALESCE(rank, 999999) ASC
          LIMIT d.promote_count
        ) sub;
        IF promoted IS NOT NULL THEN
          UPDATE public.tournament_division_members
            SET division_id = upper_div, points = 0, rank = NULL
            WHERE division_id = d.id AND athlete_id = ANY(promoted);
        END IF;
      END IF;
    END IF;

    -- relegate bottom N to lower division (level + 1) if exists
    IF d.relegate_count > 0 THEN
      SELECT id INTO lower_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level + 1;
      IF lower_div IS NOT NULL THEN
        SELECT array_agg(athlete_id) INTO relegated FROM (
          SELECT athlete_id FROM public.tournament_division_members
          WHERE division_id = d.id
          ORDER BY points ASC, COALESCE(rank, 0) DESC
          LIMIT d.relegate_count
        ) sub;
        IF relegated IS NOT NULL THEN
          UPDATE public.tournament_division_members
            SET division_id = lower_div, points = 0, rank = NULL
            WHERE division_id = d.id AND athlete_id = ANY(relegated);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Reset points & rank for everyone ──────────────────────────────
  UPDATE public.tournament_division_members tdm
    SET points = 0, rank = NULL
    FROM public.tournament_divisions tdiv
    WHERE tdiv.id = tdm.division_id
      AND tdiv.tournament_id = p_tournament_id;

  -- ── 4. Increment current_season ──────────────────────────────────────
  UPDATE public.tournaments
    SET current_season = v_season + 1
    WHERE id = p_tournament_id;

  RETURN v_season + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_season_and_advance(uuid) TO authenticated;
