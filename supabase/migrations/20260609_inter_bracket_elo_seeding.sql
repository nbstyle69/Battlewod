-- ═══════════════════════════════════════════════════════════════════════
-- ELO-based seeding for Inter-box Bracket
-- Replaces random ORDER BY with ELO DESC so top seeds face bottom seeds.
-- Proper bracket seeding: 1v16, 2v15, 3v14, etc.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_inter_bracket_round_1(p_competition_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_participants uuid[];
  v_seeded uuid[];
  v_count int;
  v_match_num int := 1;
  v_top int;
  v_bot int;
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

  -- Get registered athletes sorted by ELO (highest first = best seed)
  SELECT array_agg(r.athlete_id ORDER BY COALESCE(p.elo, 1000) DESC, random())
    INTO v_participants
    FROM public.inter_registrations r
    LEFT JOIN public.profiles p ON p.id = r.athlete_id
    WHERE r.competition_id = p_competition_id
      AND r.status = 'active'
      AND r.athlete_id IS NOT NULL;

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 participants to generate a bracket (found %)', v_count;
  END IF;

  -- Bracket seeding: pair top vs bottom (1v last, 2v second-last, etc.)
  -- This ensures strongest players don't meet until later rounds.
  v_top := 1;
  v_bot := v_count;

  WHILE v_top <= v_bot LOOP
    IF v_top < v_bot THEN
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, participant2_id, status)
      VALUES (p_competition_id, 1, v_match_num, 'winner',
              v_participants[v_top], v_participants[v_bot], 'pending');
    ELSE
      -- BYE: auto-advance odd participant (last remaining)
      INSERT INTO public.inter_bracket_matches
        (competition_id, round, match_number, side, participant1_id, winner_id, status, completed_at)
      VALUES (p_competition_id, 1, v_match_num, 'winner',
              v_participants[v_top], v_participants[v_top], 'bye', now());
    END IF;
    v_match_num := v_match_num + 1;
    v_top := v_top + 1;
    v_bot := v_bot - 1;
  END LOOP;

  RETURN v_match_num - 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inter_bracket_round_1(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
