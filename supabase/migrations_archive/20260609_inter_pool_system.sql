-- ═══════════════════════════════════════════════════════════════════════
-- Inter-box Pool System (Round-Robin)
-- For inter-competitions with format='pool':
-- - Athletes are split into groups (poules)
-- - Each group does round-robin (everyone plays everyone)
-- - Points: Win=3, Draw=1, Loss=0
-- - Top N from each group advance (to bracket or final ranking)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. inter_pool_groups — one group per poule
CREATE TABLE IF NOT EXISTS public.inter_pool_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  group_name      text NOT NULL,
  group_index     int  NOT NULL,
  advance_count   int  NOT NULL DEFAULT 2,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competition_id, group_index)
);

CREATE INDEX IF NOT EXISTS idx_ipg_comp ON public.inter_pool_groups(competition_id);

ALTER TABLE public.inter_pool_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_pool_groups_read" ON public.inter_pool_groups;
CREATE POLICY "inter_pool_groups_read" ON public.inter_pool_groups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_pool_groups_admin" ON public.inter_pool_groups;
CREATE POLICY "inter_pool_groups_admin" ON public.inter_pool_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 2. inter_pool_members — athletes assigned to a group
CREATE TABLE IF NOT EXISTS public.inter_pool_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.inter_pool_groups(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points          int NOT NULL DEFAULT 0,
  wins            int NOT NULL DEFAULT 0,
  draws           int NOT NULL DEFAULT 0,
  losses          int NOT NULL DEFAULT 0,
  score_for       numeric NOT NULL DEFAULT 0,
  score_against   numeric NOT NULL DEFAULT 0,
  UNIQUE(group_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_ipm_group ON public.inter_pool_members(group_id, points DESC);

ALTER TABLE public.inter_pool_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_pool_members_read" ON public.inter_pool_members;
CREATE POLICY "inter_pool_members_read" ON public.inter_pool_members
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_pool_members_admin" ON public.inter_pool_members;
CREATE POLICY "inter_pool_members_admin" ON public.inter_pool_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 3. inter_pool_matches — individual match within a group
CREATE TABLE IF NOT EXISTS public.inter_pool_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES public.inter_pool_groups(id) ON DELETE CASCADE,
  competition_id  uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  athlete1_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete2_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wod_id          uuid REFERENCES public.inter_competition_wods(id) ON DELETE SET NULL,
  score1          numeric,
  score2          numeric,
  winner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','completed')),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, athlete1_id, athlete2_id)
);

CREATE INDEX IF NOT EXISTS idx_ipmat_group ON public.inter_pool_matches(group_id);
CREATE INDEX IF NOT EXISTS idx_ipmat_comp ON public.inter_pool_matches(competition_id);

ALTER TABLE public.inter_pool_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_pool_matches_read" ON public.inter_pool_matches;
CREATE POLICY "inter_pool_matches_read" ON public.inter_pool_matches
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_pool_matches_admin" ON public.inter_pool_matches;
CREATE POLICY "inter_pool_matches_admin" ON public.inter_pool_matches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 4. RPC: generate_inter_pool_groups
-- Splits registered athletes into groups and generates round-robin matches.
CREATE OR REPLACE FUNCTION public.generate_inter_pool_groups(
  p_competition_id uuid,
  p_groups_count int DEFAULT 2,
  p_advance_count int DEFAULT 2
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_participants uuid[];
  v_count int;
  v_per_group int;
  v_group_id uuid;
  v_group_name text;
  v_start int;
  v_end int;
  g int;
  i int;
  j int;
  v_total_matches int := 0;
BEGIN
  SELECT format INTO v_format FROM public.inter_competitions WHERE id = p_competition_id;
  IF v_format NOT IN ('pool') THEN
    RAISE EXCEPTION 'Competition format % does not use pools', v_format;
  END IF;

  -- Prevent re-generation
  IF EXISTS (SELECT 1 FROM public.inter_pool_groups WHERE competition_id = p_competition_id) THEN
    RAISE EXCEPTION 'Pool groups already exist for this competition';
  END IF;

  -- Get participants sorted by ELO (serpentine seeding)
  SELECT array_agg(r.athlete_id ORDER BY COALESCE(p.elo, 1000) DESC, random())
    INTO v_participants
    FROM public.inter_registrations r
    LEFT JOIN public.profiles p ON p.id = r.athlete_id
    WHERE r.competition_id = p_competition_id
      AND r.status = 'active'
      AND r.athlete_id IS NOT NULL;

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < p_groups_count * 2 THEN
    RAISE EXCEPTION 'Need at least % participants for % groups', p_groups_count * 2, p_groups_count;
  END IF;

  v_per_group := CEIL(v_count::float / p_groups_count);

  -- Create groups and distribute athletes (serpentine: 1→A, 2→B, 3→B, 4→A...)
  FOR g IN 1..p_groups_count LOOP
    v_group_name := 'Poule ' || CHR(64 + g); -- A, B, C, D...
    INSERT INTO public.inter_pool_groups (competition_id, group_name, group_index, advance_count)
    VALUES (p_competition_id, v_group_name, g, p_advance_count)
    RETURNING id INTO v_group_id;

    -- Serpentine: for even rounds go forward, odd rounds go backward
    FOR i IN 1..v_count LOOP
      -- Serpentine assignment: athlete i goes to group based on snake pattern
      DECLARE
        v_row int := (i - 1) / p_groups_count;
        v_pos int := (i - 1) % p_groups_count;
        v_assigned_group int;
      BEGIN
        IF v_row % 2 = 0 THEN
          v_assigned_group := v_pos + 1;
        ELSE
          v_assigned_group := p_groups_count - v_pos;
        END IF;
        IF v_assigned_group = g THEN
          INSERT INTO public.inter_pool_members (group_id, athlete_id)
          VALUES (v_group_id, v_participants[i]);
        END IF;
      END;
    END LOOP;

    -- Generate round-robin matches for this group
    FOR i IN 1..v_count LOOP
      FOR j IN (i+1)..v_count LOOP
        -- Only if both are in this group
        IF EXISTS (SELECT 1 FROM public.inter_pool_members WHERE group_id = v_group_id AND athlete_id = v_participants[i])
           AND EXISTS (SELECT 1 FROM public.inter_pool_members WHERE group_id = v_group_id AND athlete_id = v_participants[j])
        THEN
          INSERT INTO public.inter_pool_matches (group_id, competition_id, athlete1_id, athlete2_id, status)
          VALUES (v_group_id, p_competition_id, v_participants[i], v_participants[j], 'pending');
          v_total_matches := v_total_matches + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_total_matches;
END;
$$;

-- 5. RPC: resolve_inter_pool_match
-- Records a match result and updates standings.
CREATE OR REPLACE FUNCTION public.resolve_inter_pool_match(
  p_match_id uuid,
  p_score1 numeric,
  p_score2 numeric,
  p_scoring_type text DEFAULT 'reps'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match record;
  v_winner_id uuid;
  v_loser_id uuid;
  v_draw boolean := false;
BEGIN
  SELECT * INTO v_match FROM public.inter_pool_matches WHERE id = p_match_id;
  IF v_match IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF v_match.status = 'completed' THEN RAISE EXCEPTION 'Match already completed'; END IF;

  -- Determine winner based on scoring_type
  IF p_score1 = p_score2 THEN
    v_draw := true;
  ELSIF p_scoring_type = 'time' THEN
    -- Lower is better for time
    IF p_score1 < p_score2 THEN v_winner_id := v_match.athlete1_id; v_loser_id := v_match.athlete2_id;
    ELSE v_winner_id := v_match.athlete2_id; v_loser_id := v_match.athlete1_id;
    END IF;
  ELSE
    -- Higher is better for reps/weight
    IF p_score1 > p_score2 THEN v_winner_id := v_match.athlete1_id; v_loser_id := v_match.athlete2_id;
    ELSE v_winner_id := v_match.athlete2_id; v_loser_id := v_match.athlete1_id;
    END IF;
  END IF;

  -- Update match
  UPDATE public.inter_pool_matches SET
    score1 = p_score1, score2 = p_score2,
    winner_id = v_winner_id,
    status = 'completed', completed_at = now()
  WHERE id = p_match_id;

  -- Update standings
  IF v_draw THEN
    UPDATE public.inter_pool_members SET
      points = points + 1, draws = draws + 1,
      score_for = score_for + p_score1, score_against = score_against + p_score2
    WHERE group_id = v_match.group_id AND athlete_id = v_match.athlete1_id;
    UPDATE public.inter_pool_members SET
      points = points + 1, draws = draws + 1,
      score_for = score_for + p_score2, score_against = score_against + p_score1
    WHERE group_id = v_match.group_id AND athlete_id = v_match.athlete2_id;
  ELSE
    UPDATE public.inter_pool_members SET
      points = points + 3, wins = wins + 1,
      score_for = score_for + (CASE WHEN v_winner_id = v_match.athlete1_id THEN p_score1 ELSE p_score2 END),
      score_against = score_against + (CASE WHEN v_winner_id = v_match.athlete1_id THEN p_score2 ELSE p_score1 END)
    WHERE group_id = v_match.group_id AND athlete_id = v_winner_id;
    UPDATE public.inter_pool_members SET
      losses = losses + 1,
      score_for = score_for + (CASE WHEN v_loser_id = v_match.athlete1_id THEN p_score1 ELSE p_score2 END),
      score_against = score_against + (CASE WHEN v_loser_id = v_match.athlete1_id THEN p_score2 ELSE p_score1 END)
    WHERE group_id = v_match.group_id AND athlete_id = v_loser_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inter_pool_groups(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_inter_pool_match(uuid, numeric, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
