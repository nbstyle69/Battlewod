-- ═══════════════════════════════════════════════════════════════════════
-- Audit DB1 — Authorization guard for tournament-management RPCs
--
-- generate_bracket_round_1 / advance_bracket_round / promote_relegate_divisions
-- / end_season_and_advance are SECURITY DEFINER and GRANTed to `authenticated`,
-- but had NO internal authorization check. Because SECURITY DEFINER bypasses
-- RLS, any authenticated user could drive another box's tournament
-- (regenerate brackets, advance rounds, run promotions/relegations, end a
-- season) just by passing its id.
--
-- Fix: a single helper `is_tournament_manager(tournament_id)` mirroring the
-- existing RLS on the bracket/division tables (owner or coach of the
-- tournament's box, OR a global admin/super_admin), enforced at the top of
-- each function. Bodies are otherwise unchanged.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tournament_manager(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.tournaments t
      JOIN public.box_members bm ON bm.box_id = t.box_id
      WHERE t.id = p_tournament_id
        AND bm.member_id = auth.uid()
        AND bm.role IN ('owner', 'coach')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_tournament_manager(uuid) TO authenticated;

-- ── generate_bracket_round_1 ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_bracket_round_1(p_tournament_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_participants uuid[];
  v_count int;
  v_match_num int := 1;
  i int;
BEGIN
  IF NOT public.is_tournament_manager(p_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

  SELECT format INTO v_format FROM public.tournaments WHERE id = p_tournament_id;
  IF v_format NOT IN ('bracket','swiss') THEN
    RAISE EXCEPTION 'Tournament format % does not use brackets', v_format;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_bracket_matches
             WHERE tournament_id = p_tournament_id AND status = 'completed') THEN
    RAISE EXCEPTION 'Cannot regenerate: tournament already has completed matches';
  END IF;
  DELETE FROM public.tournament_bracket_matches WHERE tournament_id = p_tournament_id;

  SELECT array_agg(athlete_id ORDER BY random()) INTO v_participants
    FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id;

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 participants to generate a bracket';
  END IF;

  i := 1;
  WHILE i <= v_count LOOP
    IF i + 1 <= v_count THEN
      INSERT INTO public.tournament_bracket_matches
        (tournament_id, round, match_number, side, participant1_id, participant2_id, status)
      VALUES (p_tournament_id, 1, v_match_num, 'winner',
              v_participants[i], v_participants[i+1], 'pending');
    ELSE
      -- BYE: auto-advance
      INSERT INTO public.tournament_bracket_matches
        (tournament_id, round, match_number, side, participant1_id, winner_id, status, completed_at)
      VALUES (p_tournament_id, 1, v_match_num, 'winner',
              v_participants[i], v_participants[i], 'bye', now());
    END IF;
    v_match_num := v_match_num + 1;
    i := i + 2;
  END LOOP;

  RETURN v_match_num - 1;
END;
$$;

-- ── advance_bracket_round ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_bracket_round(
  p_tournament_id uuid, p_completed_round int
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

-- ── promote_relegate_divisions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promote_relegate_divisions(p_tournament_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  d record;
  upper_div uuid;
  lower_div uuid;
  promoted uuid[];
  relegated uuid[];
BEGIN
  IF NOT public.is_tournament_manager(p_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

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
          ORDER BY points DESC, rank ASC
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
          ORDER BY points ASC, rank DESC
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
END;
$$;

-- ── end_season_and_advance (two-phase version) ─────────────────────────
CREATE OR REPLACE FUNCTION public.end_season_and_advance(p_tournament_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_season int;
  d record;
  upper_div uuid;
  lower_div uuid;
BEGIN
  IF NOT public.is_tournament_manager(p_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

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

  -- ── 2. Compute moves into temp table (NO mutation yet) ───────────────
  CREATE TEMP TABLE IF NOT EXISTS _season_moves (
    athlete_id      uuid PRIMARY KEY,
    new_division_id uuid NOT NULL
  ) ON COMMIT DROP;
  TRUNCATE TABLE _season_moves;

  FOR d IN
    SELECT * FROM public.tournament_divisions
    WHERE tournament_id = p_tournament_id
    ORDER BY level
  LOOP
    -- Promote top N to upper division (level - 1) if exists
    IF d.promote_count > 0 AND d.level > 1 THEN
      SELECT id INTO upper_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level - 1;
      IF upper_div IS NOT NULL THEN
        INSERT INTO _season_moves (athlete_id, new_division_id)
        SELECT athlete_id, upper_div
        FROM public.tournament_division_members
        WHERE division_id = d.id
        ORDER BY points DESC, COALESCE(rank, 999999) ASC
        LIMIT d.promote_count
        ON CONFLICT (athlete_id) DO NOTHING;
      END IF;
    END IF;

    -- Relegate bottom N to lower division (level + 1) if exists
    IF d.relegate_count > 0 THEN
      SELECT id INTO lower_div FROM public.tournament_divisions
        WHERE tournament_id = p_tournament_id AND level = d.level + 1;
      IF lower_div IS NOT NULL THEN
        INSERT INTO _season_moves (athlete_id, new_division_id)
        SELECT athlete_id, lower_div
        FROM public.tournament_division_members
        WHERE division_id = d.id
        ORDER BY points ASC, COALESCE(rank, 0) DESC
        LIMIT d.relegate_count
        ON CONFLICT (athlete_id) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Apply all moves atomically ────────────────────────────────────
  UPDATE public.tournament_division_members tdm
    SET division_id = sm.new_division_id,
        points      = 0,
        rank        = NULL
    FROM _season_moves sm,
         public.tournament_divisions tdiv
    WHERE tdm.athlete_id = sm.athlete_id
      AND tdm.division_id = tdiv.id
      AND tdiv.tournament_id = p_tournament_id;

  -- ── 4. Reset points & rank for everyone (clean slate) ────────────────
  UPDATE public.tournament_division_members tdm
    SET points = 0, rank = NULL
    FROM public.tournament_divisions tdiv
    WHERE tdiv.id = tdm.division_id
      AND tdiv.tournament_id = p_tournament_id;

  -- ── 5. Increment current_season ──────────────────────────────────────
  UPDATE public.tournaments
    SET current_season = v_season + 1
    WHERE id = p_tournament_id;

  RETURN v_season + 1;
END;
$$;
