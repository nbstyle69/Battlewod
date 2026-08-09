-- ═══════════════════════════════════════════════════════════════════════
-- Inter-box League System
-- Adds league rounds (journées) + point-based standings for inter-box
-- competitions with format='league'.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. inter_league_rounds — one row per "journée" (match day)
CREATE TABLE IF NOT EXISTS public.inter_league_rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  round_number    int  NOT NULL,
  title           text,
  wod_id          uuid REFERENCES public.inter_competition_wods(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','completed')),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competition_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_ilr_comp ON public.inter_league_rounds(competition_id);

ALTER TABLE public.inter_league_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_league_rounds_read" ON public.inter_league_rounds;
CREATE POLICY "inter_league_rounds_read" ON public.inter_league_rounds
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_league_rounds_admin" ON public.inter_league_rounds;
CREATE POLICY "inter_league_rounds_admin" ON public.inter_league_rounds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 2. inter_league_standings — cumulative points per athlete in a league
CREATE TABLE IF NOT EXISTS public.inter_league_standings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES public.inter_teams(id) ON DELETE CASCADE,
  total_points    numeric NOT NULL DEFAULT 0,
  rounds_played   int     NOT NULL DEFAULT 0,
  wins            int     NOT NULL DEFAULT 0,
  podiums         int     NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competition_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_ils_comp ON public.inter_league_standings(competition_id, total_points DESC);

ALTER TABLE public.inter_league_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_league_standings_read" ON public.inter_league_standings;
CREATE POLICY "inter_league_standings_read" ON public.inter_league_standings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_league_standings_admin" ON public.inter_league_standings;
CREATE POLICY "inter_league_standings_admin" ON public.inter_league_standings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 3. RPC: compute_inter_league_round
-- Calculates points for a given round (journée) using CF Games scoring table:
-- 1st=100, 2nd=97, 3rd=94, 4th=91, 5th=88... down to min 1pt
-- Handles "For Time" (ASC) vs default (DESC) scoring_type.
CREATE OR REPLACE FUNCTION public.compute_inter_league_round(
  p_competition_id uuid,
  p_round_number int
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_round_id uuid;
  v_wod_id uuid;
  v_scoring_type text;
  v_ranked RECORD;
  v_points int;
  v_count int := 0;
BEGIN
  SELECT format INTO v_format FROM public.inter_competitions WHERE id = p_competition_id;
  IF v_format NOT IN ('league','pool') THEN
    RAISE EXCEPTION 'Competition format % does not use league scoring', v_format;
  END IF;

  -- Get round info
  SELECT id, wod_id INTO v_round_id, v_wod_id
    FROM public.inter_league_rounds
    WHERE competition_id = p_competition_id AND round_number = p_round_number;
  IF v_round_id IS NULL THEN
    RAISE EXCEPTION 'Round % not found for competition %', p_round_number, p_competition_id;
  END IF;

  -- Get scoring_type for the WOD
  SELECT COALESCE(scoring_type, 'reps') INTO v_scoring_type
    FROM public.inter_competition_wods WHERE id = v_wod_id;

  -- Rank athletes by validated score for this round's WOD
  FOR v_ranked IN
    SELECT
      s.athlete_id,
      s.team_id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN v_scoring_type = 'time' THEN s.score_value ELSE -s.score_value END
          ASC NULLS LAST
      ) AS rank
    FROM public.inter_scores s
    WHERE s.competition_id = p_competition_id
      AND s.wod_id = v_wod_id
      AND s.status = 'validated'
  LOOP
    -- CF Games style points: 1st=100, 2nd=97, 3rd=94, then -3 each rank
    v_points := GREATEST(1, 100 - (v_ranked.rank - 1) * 3);

    -- Upsert into league standings
    INSERT INTO public.inter_league_standings
      (competition_id, athlete_id, team_id, total_points, rounds_played, wins, podiums)
    VALUES (p_competition_id, v_ranked.athlete_id, v_ranked.team_id, v_points, 1,
            CASE WHEN v_ranked.rank = 1 THEN 1 ELSE 0 END,
            CASE WHEN v_ranked.rank <= 3 THEN 1 ELSE 0 END)
    ON CONFLICT (competition_id, athlete_id) DO UPDATE SET
      total_points = inter_league_standings.total_points + v_points,
      rounds_played = inter_league_standings.rounds_played + 1,
      wins = inter_league_standings.wins + CASE WHEN v_ranked.rank = 1 THEN 1 ELSE 0 END,
      podiums = inter_league_standings.podiums + CASE WHEN v_ranked.rank <= 3 THEN 1 ELSE 0 END,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  -- Mark round as completed
  UPDATE public.inter_league_rounds
    SET status = 'completed', completed_at = now()
    WHERE id = v_round_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_inter_league_round(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
