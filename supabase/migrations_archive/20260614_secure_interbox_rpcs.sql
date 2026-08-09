-- ═══════════════════════════════════════════════════════════════════════
-- Security fix — authorization guard for inter-box competition RPCs
--
-- The 7 inter-box management RPCs are SECURITY DEFINER and GRANTed to
-- `authenticated`, but had NO internal authorization check. Because
-- SECURITY DEFINER bypasses RLS, any authenticated user could drive another
-- competition (generate/advance brackets, compute league rounds, build pools,
-- resolve pool/swiss matches, generate swiss rounds) just by passing its id.
--
-- Same class of bug fixed for tournament RPCs in 20260611_secure_tournament_rpcs.
-- Fix: helper is_inter_competition_manager(competition_id) = the competition
-- creator (created_by) OR a global admin/super_admin, enforced at the top of
-- each function. Bodies are otherwise unchanged.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_inter_competition_manager(p_competition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.inter_competitions c
      WHERE c.id = p_competition_id AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_inter_competition_manager(uuid) TO authenticated;


-- ── generate_inter_bracket_round_1 ──
CREATE OR REPLACE FUNCTION public.generate_inter_bracket_round_1(p_competition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_format text;
  v_participants uuid[];
  v_seeded uuid[];
  v_count int;
  v_match_num int := 1;
  v_top int;
  v_bot int;
BEGIN
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── advance_inter_bracket_round ──
CREATE OR REPLACE FUNCTION public.advance_inter_bracket_round(p_competition_id uuid, p_completed_round integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pending int;
  v_winners uuid[];
  v_match_num int := 1;
  v_count int;
  i int;
BEGIN
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── compute_inter_league_round ──
CREATE OR REPLACE FUNCTION public.compute_inter_league_round(p_competition_id uuid, p_round_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── generate_inter_pool_groups ──
CREATE OR REPLACE FUNCTION public.generate_inter_pool_groups(p_competition_id uuid, p_groups_count integer DEFAULT 2, p_advance_count integer DEFAULT 2)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── resolve_inter_pool_match ──
CREATE OR REPLACE FUNCTION public.resolve_inter_pool_match(p_match_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text DEFAULT 'reps'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_match record;
  v_winner_id uuid;
  v_loser_id uuid;
  v_draw boolean := false;
BEGIN
  IF NOT public.is_inter_competition_manager(
    (SELECT competition_id FROM public.inter_pool_matches WHERE id = p_match_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── generate_inter_swiss_round ──
CREATE OR REPLACE FUNCTION public.generate_inter_swiss_round(p_competition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;


-- ── resolve_inter_swiss_pairing ──
CREATE OR REPLACE FUNCTION public.resolve_inter_swiss_pairing(p_pairing_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text DEFAULT 'reps'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pairing RECORD;
  v_winner_id uuid;
  v_loser_id uuid;
  v_is_draw boolean := false;
BEGIN
  IF NOT public.is_inter_competition_manager(
    (SELECT competition_id FROM public.inter_swiss_pairings WHERE id = p_pairing_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

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
$function$;
