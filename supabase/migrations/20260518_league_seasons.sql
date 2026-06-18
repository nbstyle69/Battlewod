-- ═══════════════════════════════════════════════════════════════════════
-- League seasons — tournois de format league_div sans fin (18 mai 2026)
--
-- - `tournaments.current_season` int — saison actuellement active (1, 2, ...)
-- - `tournament_season_history` — snapshot final de chaque saison clôturée
-- - RPC `end_season_and_advance` :
--     1. snapshot standings dans season_history avec outcome
--     2. promote/relegate (réutilise la logique existante)
--     3. reset points à 0
--     4. incrémente current_season
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Colonne current_season ---------------------------------------------
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS current_season int NOT NULL DEFAULT 1;

-- 2. Table tournament_season_history ------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_season_history (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  season_number   int  NOT NULL,
  division_id     uuid REFERENCES public.tournament_divisions(id) ON DELETE SET NULL,
  division_level  int  NOT NULL,
  division_name   text NOT NULL,
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_rank      int  NOT NULL,
  final_points    numeric NOT NULL DEFAULT 0,
  outcome         text NOT NULL CHECK (outcome IN ('champion','promoted','relegated','stayed')),
  closed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, season_number, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_tsh_tournament ON public.tournament_season_history(tournament_id, season_number);
CREATE INDEX IF NOT EXISTS idx_tsh_athlete    ON public.tournament_season_history(athlete_id);

ALTER TABLE public.tournament_season_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_history_read"        ON public.tournament_season_history;
DROP POLICY IF EXISTS "season_history_admin_write" ON public.tournament_season_history;

CREATE POLICY "season_history_read" ON public.tournament_season_history
  FOR SELECT USING (true);

CREATE POLICY "season_history_admin_write" ON public.tournament_season_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_season_history.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_season_history.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- 3. RPC: end_season_and_advance ----------------------------------------
-- Clôture la saison actuelle, snapshot, promote/relegate, reset, incrémente.
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
  champion_athlete uuid;
BEGIN
  SELECT format, current_season
    INTO v_format, v_season
    FROM public.tournaments
    WHERE id = p_tournament_id;

  IF v_format <> 'league_div' THEN
    RAISE EXCEPTION 'Tournament % is not a league_div tournament', p_tournament_id;
  END IF;

  -- ── 1. Snapshot standings into history with outcome ──────────────────
  -- Compute final ranks per division (by points DESC, then existing rank ASC)
  WITH ranked AS (
    SELECT
      tdm.id,
      tdm.division_id,
      tdm.athlete_id,
      tdm.points,
      d.level AS div_level,
      d.name  AS div_name,
      d.promote_count,
      d.relegate_count,
      ROW_NUMBER() OVER (
        PARTITION BY tdm.division_id
        ORDER BY tdm.points DESC, COALESCE(tdm.rank, 999999) ASC
      ) AS final_rank,
      COUNT(*) OVER (PARTITION BY tdm.division_id) AS div_size
    FROM public.tournament_division_members tdm
    JOIN public.tournament_divisions d ON d.id = tdm.division_id
    WHERE d.tournament_id = p_tournament_id
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
           AND EXISTS (SELECT 1 FROM public.tournament_divisions d2
                       WHERE d2.tournament_id = p_tournament_id
                         AND d2.level = r.div_level + 1) THEN 'relegated'
      ELSE 'stayed'
    END
  FROM ranked r
  ON CONFLICT (tournament_id, season_number, athlete_id) DO NOTHING;

  -- ── 2. Apply promote / relegate (same logic as the old RPC) ──────────
  FOR d IN
    SELECT * FROM public.tournament_divisions
    WHERE tournament_id = p_tournament_id
    ORDER BY level
  LOOP
    -- promote top promote_count to upper division (level - 1) if exists
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

    -- relegate bottom relegate_count to lower division (level + 1) if exists
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

  -- ── 3. Reset points & rank for everyone (clean slate for next season) ─
  UPDATE public.tournament_division_members tdm
    SET points = 0, rank = NULL
    FROM public.tournament_divisions d
    WHERE d.id = tdm.division_id
      AND d.tournament_id = p_tournament_id;

  -- ── 4. Increment current_season ──────────────────────────────────────
  UPDATE public.tournaments
    SET current_season = v_season + 1
    WHERE id = p_tournament_id;

  RETURN v_season + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_season_and_advance(uuid) TO authenticated;
