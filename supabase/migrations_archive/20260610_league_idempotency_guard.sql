-- ═══════════════════════════════════════════════════════════════════════
-- Idempotency guard for compute_inter_league_round
-- Prevents double-compute of points if called twice on the same round.
-- If the round is already completed, the function now returns 0 instead
-- of doubling the points.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_inter_league_round(
  p_competition_id uuid,
  p_round_number int
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_round_id uuid;
  v_wod_id uuid;
  v_scoring_type text;
  v_round_status text;
  v_ranked RECORD;
  v_points int;
  v_count int := 0;
BEGIN
  SELECT format INTO v_format FROM public.inter_competitions WHERE id = p_competition_id;
  IF v_format NOT IN ('league','pool') THEN
    RAISE EXCEPTION 'Competition format % does not use league scoring', v_format;
  END IF;

  -- Get round info
  SELECT id, wod_id, status INTO v_round_id, v_wod_id, v_round_status
    FROM public.inter_league_rounds
    WHERE competition_id = p_competition_id AND round_number = p_round_number;
  IF v_round_id IS NULL THEN
    RAISE EXCEPTION 'Round % not found for competition %', p_round_number, p_competition_id;
  END IF;

  -- IDEMPOTENCY GUARD: if round already completed, return 0
  IF v_round_status = 'completed' THEN
    RETURN 0;
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

NOTIFY pgrst, 'reload schema';
