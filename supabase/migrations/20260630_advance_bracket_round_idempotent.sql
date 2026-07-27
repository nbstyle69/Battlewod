-- ═══════════════════════════════════════════════════════════════════════
-- Fix: advance_bracket_round must be idempotent
--
-- Bug: calling advance_bracket_round for a round whose next round was already
-- generated re-runs the INSERTs and violates
--   tournament_bracket_matches_tournament_id_round_match_number_key
-- ("duplicate key value violates unique constraint …"). This happened when the
-- owner clicked "Round suivant" twice (or before the page refreshed).
--
-- Fix: bail out early (RETURN 0) when the next round already exists. Everything
-- else is unchanged from the previous definition.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.advance_bracket_round(p_tournament_id uuid, p_completed_round integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_format text;
  v_pending int;
  v_winners uuid[];
  v_losers  uuid[];
  v_lb_prev_winners uuid[];
  v_match_num int := 1;
  v_count int;
  i int;
BEGIN
  IF NOT public.is_tournament_manager(p_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

  SELECT format INTO v_format FROM public.tournaments WHERE id = p_tournament_id;

  SELECT count(*) INTO v_pending
    FROM public.tournament_bracket_matches
    WHERE tournament_id = p_tournament_id
      AND round = p_completed_round AND winner_id IS NULL;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Round % has % unfinished matches', p_completed_round, v_pending;
  END IF;

  -- Idempotency: if the next round already exists, do nothing (avoids the
  -- duplicate-key error when "Round suivant" is triggered more than once).
  IF EXISTS (
    SELECT 1 FROM public.tournament_bracket_matches
    WHERE tournament_id = p_tournament_id
      AND round = p_completed_round + 1
  ) THEN
    RETURN 0;
  END IF;

  IF v_format = 'bracket' THEN
    SELECT array_agg(winner_id ORDER BY match_number) INTO v_winners
      FROM public.tournament_bracket_matches
      WHERE tournament_id = p_tournament_id
        AND round = p_completed_round AND side = 'winner';

    v_count := COALESCE(array_length(v_winners, 1), 0);
    IF v_count <= 1 THEN RETURN 0; END IF;  -- final reached

    i := 1;
    WHILE i <= v_count LOOP
      IF i + 1 <= v_count THEN
        INSERT INTO public.tournament_bracket_matches
          (tournament_id, round, match_number, side, participant1_id, participant2_id, status)
        VALUES (p_tournament_id, p_completed_round + 1, v_match_num, 'winner',
                v_winners[i], v_winners[i+1], 'pending');
      ELSE
        INSERT INTO public.tournament_bracket_matches
          (tournament_id, round, match_number, side, participant1_id, winner_id, status, completed_at)
        VALUES (p_tournament_id, p_completed_round + 1, v_match_num, 'winner',
                v_winners[i], v_winners[i], 'bye', now());
      END IF;
      v_match_num := v_match_num + 1;
      i := i + 2;
    END LOOP;
    RETURN v_match_num - 1;

  ELSIF v_format = 'swiss' THEN
    SELECT array_agg(winner_id ORDER BY match_number),
           array_agg(loser_id  ORDER BY match_number)
      INTO v_winners, v_losers
      FROM public.tournament_bracket_matches
      WHERE tournament_id = p_tournament_id
        AND round = p_completed_round AND side = 'winner';

    v_count := COALESCE(array_length(v_winners, 1), 0);

    -- WB next round (pair winners)
    i := 1;
    WHILE i + 1 <= v_count LOOP
      INSERT INTO public.tournament_bracket_matches
        (tournament_id, round, match_number, side, participant1_id, participant2_id, status)
      VALUES (p_tournament_id, p_completed_round + 1, v_match_num, 'winner',
              v_winners[i], v_winners[i+1], 'pending');
      v_match_num := v_match_num + 1;
      i := i + 2;
    END LOOP;

    -- LB construction:
    --  round 1 LB = losers of WB round 1 paired together
    --  round N LB = winners of LB round N-1 vs losers of WB round N
    IF p_completed_round = 1 THEN
      v_match_num := 1;
      i := 1;
      WHILE i + 1 <= COALESCE(array_length(v_losers, 1), 0) LOOP
        INSERT INTO public.tournament_bracket_matches
          (tournament_id, round, match_number, side, participant1_id, participant2_id, status)
        VALUES (p_tournament_id, 1, v_match_num, 'loser',
                v_losers[i], v_losers[i+1], 'pending');
        v_match_num := v_match_num + 1;
        i := i + 2;
      END LOOP;
    ELSE
      SELECT array_agg(winner_id ORDER BY match_number) INTO v_lb_prev_winners
        FROM public.tournament_bracket_matches
        WHERE tournament_id = p_tournament_id
          AND round = p_completed_round - 1 AND side = 'loser';

      v_match_num := 1;
      i := 1;
      WHILE i <= LEAST(COALESCE(array_length(v_lb_prev_winners, 1), 0),
                        COALESCE(array_length(v_losers, 1), 0)) LOOP
        INSERT INTO public.tournament_bracket_matches
          (tournament_id, round, match_number, side, participant1_id, participant2_id, status)
        VALUES (p_tournament_id, p_completed_round, v_match_num, 'loser',
                v_lb_prev_winners[i], v_losers[i], 'pending');
        v_match_num := v_match_num + 1;
        i := i + 1;
      END LOOP;
    END IF;

    RETURN v_match_num - 1;
  END IF;

  RETURN 0;
END;
$function$;
