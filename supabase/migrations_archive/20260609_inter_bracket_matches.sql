-- ═══════════════════════════════════════════════════════════════════════
-- Inter-box Bracket System
-- Adds bracket matches table + RPCs for inter-competitions
-- ═══════════════════════════════════════════════════════════════════════

-- 1. inter_bracket_matches table
CREATE TABLE IF NOT EXISTS public.inter_bracket_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.inter_competitions(id) ON DELETE CASCADE,
  round           int  NOT NULL,
  match_number    int  NOT NULL,
  side            text NOT NULL DEFAULT 'winner'
                  CHECK (side IN ('winner','loser','grand_final')),
  participant1_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  participant2_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  loser_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  wod_id          uuid REFERENCES public.inter_competition_wods(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','completed','bye')),
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(competition_id, round, match_number, side)
);

CREATE INDEX IF NOT EXISTS idx_ibm_competition ON public.inter_bracket_matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_ibm_round ON public.inter_bracket_matches(competition_id, round);

ALTER TABLE public.inter_bracket_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inter_bracket_read" ON public.inter_bracket_matches;
CREATE POLICY "inter_bracket_read" ON public.inter_bracket_matches
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "inter_bracket_admin" ON public.inter_bracket_matches;
CREATE POLICY "inter_bracket_admin" ON public.inter_bracket_matches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 2. RPC: generate_inter_bracket_round_1
-- Seeds participants into round 1 matches (random pairing)
CREATE OR REPLACE FUNCTION public.generate_inter_bracket_round_1(p_competition_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_participants uuid[];
  v_count int;
  v_match_num int := 1;
  i int;
BEGIN
  SELECT format INTO v_format FROM public.inter_competitions WHERE id = p_competition_id;
  IF v_format NOT IN ('bracket','swiss') THEN
    RAISE EXCEPTION 'Competition format % does not use brackets', v_format;
  END IF;

  -- Prevent re-generation if matches already completed
  IF EXISTS (SELECT 1 FROM public.inter_bracket_matches
             WHERE competition_id = p_competition_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Cannot regenerate: competition already has completed matches';
  END IF;
  DELETE FROM public.inter_bracket_matches WHERE competition_id = p_competition_id;

  -- Get all registered athletes (individual)
  SELECT array_agg(athlete_id ORDER BY random()) INTO v_participants
    FROM public.inter_registrations
    WHERE competition_id = p_competition_id AND status = 'active' AND athlete_id IS NOT NULL;

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 participants to generate a bracket (found %)', v_count;
  END IF;

  i := 1;
  WHILE i <= v_count LOOP
    IF i + 1 <= v_count THEN
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, participant2_id, status)
      VALUES (p_competition_id, 1, v_match_num, 'winner',
              v_participants[i], v_participants[i+1], 'pending');
    ELSE
      -- BYE: auto-advance odd participant
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, winner_id, status, completed_at)
      VALUES (p_competition_id, 1, v_match_num, 'winner',
              v_participants[i], v_participants[i], 'bye', now());
    END IF;
    v_match_num := v_match_num + 1;
    i := i + 2;
  END LOOP;

  RETURN v_match_num - 1;
END;
$$;

-- 3. RPC: advance_inter_bracket_round
-- Once all matches of round N are completed, generate round N+1
CREATE OR REPLACE FUNCTION public.advance_inter_bracket_round(
  p_competition_id uuid, p_completed_round int
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pending int;
  v_winners uuid[];
  v_match_num int := 1;
  v_count int;
  i int;
BEGIN
  -- Check all matches in round are resolved
  SELECT count(*) INTO v_pending
    FROM public.inter_bracket_matches
    WHERE competition_id = p_competition_id
      AND round = p_completed_round AND winner_id IS NULL AND status != 'bye';
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Round % has % unfinished matches', p_completed_round, v_pending;
  END IF;

  -- Collect winners
  SELECT array_agg(winner_id ORDER BY match_number) INTO v_winners
    FROM public.inter_bracket_matches
    WHERE competition_id = p_competition_id
      AND round = p_completed_round AND side = 'winner';

  v_count := COALESCE(array_length(v_winners, 1), 0);
  IF v_count <= 1 THEN RETURN 0; END IF;  -- Final reached, competition over

  i := 1;
  WHILE i <= v_count LOOP
    IF i + 1 <= v_count THEN
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, participant2_id, status)
      VALUES (p_competition_id, p_completed_round + 1, v_match_num, 'winner',
              v_winners[i], v_winners[i+1], 'pending');
    ELSE
      -- BYE
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, winner_id, status, completed_at)
      VALUES (p_competition_id, p_completed_round + 1, v_match_num, 'winner',
              v_winners[i], v_winners[i], 'bye', now());
    END IF;
    v_match_num := v_match_num + 1;
    i := i + 2;
  END LOOP;

  RETURN v_match_num - 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inter_bracket_round_1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_inter_bracket_round(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
