-- ═══════════════════════════════════════════════════════════════════════
-- Swiss-system tournament for inter-box competitions
-- Unlike bracket (elimination), Swiss pairs players by current standing
-- each round. Everyone plays all rounds. Final ranking by cumulative pts.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Swiss rounds table
CREATE TABLE IF NOT EXISTS public.inter_swiss_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  round_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (competition_id, round_number)
);

ALTER TABLE public.inter_swiss_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swiss_rounds_read" ON public.inter_swiss_rounds FOR SELECT USING (true);
CREATE POLICY "swiss_rounds_admin" ON public.inter_swiss_rounds FOR ALL
  USING (public.is_super_admin());

-- 2. Swiss pairings (one row per match per round)
CREATE TABLE IF NOT EXISTS public.inter_swiss_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.inter_swiss_rounds(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  athlete1_id uuid NOT NULL REFERENCES public.profiles(id),
  athlete2_id uuid REFERENCES public.profiles(id), -- NULL = BYE
  wod_id uuid REFERENCES public.inter_competition_wods(id),
  score1 numeric,
  score2 numeric,
  winner_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','bye')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (round_id, athlete1_id)
);

ALTER TABLE public.inter_swiss_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swiss_pairings_read" ON public.inter_swiss_pairings FOR SELECT USING (true);
CREATE POLICY "swiss_pairings_admin" ON public.inter_swiss_pairings FOR ALL
  USING (public.is_super_admin());

-- 3. Swiss standings (cumulative per athlete)
CREATE TABLE IF NOT EXISTS public.inter_swiss_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.profiles(id),
  points numeric NOT NULL DEFAULT 0,       -- W=3, D=1, L=0
  buchholz numeric NOT NULL DEFAULT 0,     -- tiebreaker: sum of opponents' points
  wins int NOT NULL DEFAULT 0,
  draws int NOT NULL DEFAULT 0,
  losses int NOT NULL DEFAULT 0,
  rounds_played int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (competition_id, athlete_id)
);

ALTER TABLE public.inter_swiss_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swiss_standings_read" ON public.inter_swiss_standings FOR SELECT USING (true);
CREATE POLICY "swiss_standings_admin" ON public.inter_swiss_standings FOR ALL
  USING (public.is_super_admin());

-- 4. RPC: Generate Swiss round (pair by current standings)
CREATE OR REPLACE FUNCTION public.generate_inter_swiss_round(
  p_competition_id uuid
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_round_number int;
  v_round_id uuid;
  v_athletes uuid[];
  v_standings RECORD;
  v_paired uuid[] := '{}';
  v_i int;
  v_j int;
  v_a1 uuid;
  v_a2 uuid;
  v_count int := 0;
  v_wod_id uuid;
BEGIN
  SELECT format INTO v_format FROM public.inter_competitions WHERE id = p_competition_id;
  IF v_format != 'swiss' THEN
    RAISE EXCEPTION 'Competition format % is not swiss', v_format;
  END IF;

  -- Determine round number
  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_round_number
    FROM public.inter_swiss_rounds WHERE competition_id = p_competition_id;

  -- Get next available WOD
  SELECT w.id INTO v_wod_id
    FROM public.inter_competition_wods w
    WHERE w.competition_id = p_competition_id
      AND w.id NOT IN (
        SELECT DISTINCT sr.round_id FROM public.inter_swiss_pairings sr
        WHERE sr.competition_id = p_competition_id AND sr.wod_id IS NOT NULL
      )
    ORDER BY w.order_index LIMIT 1;

  -- Create round
  INSERT INTO public.inter_swiss_rounds (competition_id, round_number, status)
  VALUES (p_competition_id, v_round_number, 'active')
  RETURNING id INTO v_round_id;

  -- Get all registered athletes
  IF v_round_number = 1 THEN
    -- Round 1: seed by ELO (top vs bottom-half, like in chess Swiss)
    SELECT ARRAY_AGG(r.athlete_id ORDER BY COALESCE(p.elo, 1000) DESC)
    INTO v_athletes
    FROM public.inter_registrations r
    JOIN public.profiles p ON p.id = r.athlete_id
    WHERE r.competition_id = p_competition_id AND r.status = 'active';
  ELSE
    -- Subsequent rounds: order by standings (points DESC, buchholz DESC)
    SELECT ARRAY_AGG(sub.athlete_id ORDER BY sub.points DESC, sub.buchholz DESC)
    INTO v_athletes
    FROM (
      SELECT s.athlete_id, s.points, s.buchholz
      FROM public.inter_swiss_standings s
      WHERE s.competition_id = p_competition_id
      ORDER BY s.points DESC, s.buchholz DESC
    ) sub;
  END IF;

  IF v_athletes IS NULL OR array_length(v_athletes, 1) < 2 THEN
    RAISE EXCEPTION 'Not enough participants for Swiss pairing';
  END IF;

  -- Initialize standings for newcomers (round 1)
  IF v_round_number = 1 THEN
    FOR v_i IN 1..array_length(v_athletes, 1) LOOP
      INSERT INTO public.inter_swiss_standings
        (competition_id, athlete_id, points, buchholz, wins, draws, losses, rounds_played)
      VALUES (p_competition_id, v_athletes[v_i], 0, 0, 0, 0, 0, 0)
      ON CONFLICT (competition_id, athlete_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Swiss pairing: adjacent players in sorted order, avoiding rematches
  v_i := 1;
  WHILE v_i <= array_length(v_athletes, 1) LOOP
    v_a1 := v_athletes[v_i];
    IF v_a1 = ANY(v_paired) THEN
      v_i := v_i + 1;
      CONTINUE;
    END IF;

    -- Find best opponent (first unpaired, not already faced if possible)
    v_a2 := NULL;
    v_j := v_i + 1;
    WHILE v_j <= array_length(v_athletes, 1) LOOP
      IF NOT (v_athletes[v_j] = ANY(v_paired)) THEN
        -- Check if already faced
        IF NOT EXISTS (
          SELECT 1 FROM public.inter_swiss_pairings sp
          WHERE sp.competition_id = p_competition_id
            AND ((sp.athlete1_id = v_a1 AND sp.athlete2_id = v_athletes[v_j])
              OR (sp.athlete1_id = v_athletes[v_j] AND sp.athlete2_id = v_a1))
        ) THEN
          v_a2 := v_athletes[v_j];
          EXIT;
        END IF;
      END IF;
      v_j := v_j + 1;
    END LOOP;

    -- Fallback: if all adjacent were already faced, pair with first available
    IF v_a2 IS NULL THEN
      v_j := v_i + 1;
      WHILE v_j <= array_length(v_athletes, 1) LOOP
        IF NOT (v_athletes[v_j] = ANY(v_paired)) THEN
          v_a2 := v_athletes[v_j];
          EXIT;
        END IF;
        v_j := v_j + 1;
      END LOOP;
    END IF;

    IF v_a2 IS NOT NULL THEN
      INSERT INTO public.inter_swiss_pairings
        (round_id, competition_id, athlete1_id, athlete2_id, wod_id, status)
      VALUES (v_round_id, p_competition_id, v_a1, v_a2, v_wod_id, 'pending');
      v_paired := v_paired || v_a1 || v_a2;
      v_count := v_count + 1;
    ELSE
      -- BYE: odd number of participants
      INSERT INTO public.inter_swiss_pairings
        (round_id, competition_id, athlete1_id, athlete2_id, wod_id, status, winner_id)
      VALUES (v_round_id, p_competition_id, v_a1, NULL, NULL, 'bye', v_a1);
      v_paired := v_paired || v_a1;
      -- BYE = free win (3 pts)
      UPDATE public.inter_swiss_standings
        SET points = points + 3, wins = wins + 1, rounds_played = rounds_played + 1, updated_at = now()
        WHERE competition_id = p_competition_id AND athlete_id = v_a1;
      v_count := v_count + 1;
    END IF;

    v_i := v_i + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 5. RPC: Resolve Swiss pairing
CREATE OR REPLACE FUNCTION public.resolve_inter_swiss_pairing(
  p_pairing_id uuid,
  p_score1 numeric,
  p_score2 numeric,
  p_scoring_type text DEFAULT 'reps'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pairing RECORD;
  v_winner_id uuid;
  v_loser_id uuid;
  v_is_draw boolean := false;
BEGIN
  SELECT * INTO v_pairing FROM public.inter_swiss_pairings WHERE id = p_pairing_id;
  IF v_pairing IS NULL THEN RAISE EXCEPTION 'Pairing not found'; END IF;
  IF v_pairing.status = 'completed' THEN RETURN; END IF;

  -- Determine winner based on scoring type
  IF p_scoring_type = 'time' THEN
    -- Lower is better for time
    IF p_score1 < p_score2 THEN v_winner_id := v_pairing.athlete1_id; v_loser_id := v_pairing.athlete2_id;
    ELSIF p_score2 < p_score1 THEN v_winner_id := v_pairing.athlete2_id; v_loser_id := v_pairing.athlete1_id;
    ELSE v_is_draw := true;
    END IF;
  ELSE
    -- Higher is better (reps, weight, rounds_reps)
    IF p_score1 > p_score2 THEN v_winner_id := v_pairing.athlete1_id; v_loser_id := v_pairing.athlete2_id;
    ELSIF p_score2 > p_score1 THEN v_winner_id := v_pairing.athlete2_id; v_loser_id := v_pairing.athlete1_id;
    ELSE v_is_draw := true;
    END IF;
  END IF;

  -- Update pairing
  UPDATE public.inter_swiss_pairings
    SET score1 = p_score1, score2 = p_score2, winner_id = v_winner_id,
        status = 'completed'
    WHERE id = p_pairing_id;

  -- Update standings
  IF v_is_draw THEN
    UPDATE public.inter_swiss_standings SET points = points + 1, draws = draws + 1,
      rounds_played = rounds_played + 1, updated_at = now()
      WHERE competition_id = v_pairing.competition_id AND athlete_id = v_pairing.athlete1_id;
    UPDATE public.inter_swiss_standings SET points = points + 1, draws = draws + 1,
      rounds_played = rounds_played + 1, updated_at = now()
      WHERE competition_id = v_pairing.competition_id AND athlete_id = v_pairing.athlete2_id;
  ELSE
    UPDATE public.inter_swiss_standings SET points = points + 3, wins = wins + 1,
      rounds_played = rounds_played + 1, updated_at = now()
      WHERE competition_id = v_pairing.competition_id AND athlete_id = v_winner_id;
    UPDATE public.inter_swiss_standings SET points = points + 0, losses = losses + 1,
      rounds_played = rounds_played + 1, updated_at = now()
      WHERE competition_id = v_pairing.competition_id AND athlete_id = v_loser_id;
  END IF;

  -- Update Buchholz tiebreaker for both players
  UPDATE public.inter_swiss_standings s SET
    buchholz = (
      SELECT COALESCE(SUM(opp.points), 0)
      FROM public.inter_swiss_pairings sp
      JOIN public.inter_swiss_standings opp ON opp.competition_id = s.competition_id
        AND opp.athlete_id = CASE WHEN sp.athlete1_id = s.athlete_id THEN sp.athlete2_id ELSE sp.athlete1_id END
      WHERE sp.competition_id = s.competition_id
        AND (sp.athlete1_id = s.athlete_id OR sp.athlete2_id = s.athlete_id)
        AND sp.status = 'completed' AND sp.athlete2_id IS NOT NULL
    ), updated_at = now()
    WHERE s.competition_id = v_pairing.competition_id
      AND s.athlete_id IN (v_pairing.athlete1_id, v_pairing.athlete2_id);

  -- Check if all pairings in the round are completed → mark round completed
  IF NOT EXISTS (
    SELECT 1 FROM public.inter_swiss_pairings
    WHERE round_id = v_pairing.round_id AND status NOT IN ('completed', 'bye')
  ) THEN
    UPDATE public.inter_swiss_rounds SET status = 'completed', completed_at = now()
      WHERE id = v_pairing.round_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inter_swiss_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inter_swiss_pairing(uuid, numeric, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
