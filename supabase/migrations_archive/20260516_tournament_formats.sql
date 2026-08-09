-- ═══════════════════════════════════════════════════════════════════════
-- Tournament formats v2 (16 mai 2026)
--   bracket    = single-elimination (winners advance, losers eliminated)
--   swiss      = double-elimination (Winner Bracket + Loser Bracket)
--   league_div = league with divisions + promotion/relegation
-- + per-box format permission (gated by super-admin)
-- + require_video_proof option
-- ═══════════════════════════════════════════════════════════════════════

-- 1. tournaments: format + options ---------------------------------------
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'simple'
    CHECK (format IN ('simple','bracket','swiss','league_div')),
  ADD COLUMN IF NOT EXISTS require_video_proof boolean NOT NULL DEFAULT false,
  -- For 'swiss' grand final: pool of WOD ids the WB champion can pick from
  ADD COLUMN IF NOT EXISTS final_wod_pool uuid[] NOT NULL DEFAULT '{}';

-- 2. boxes: per-format permission gate (super-admin controlled) ----------
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS allowed_tournament_formats text[] NOT NULL
    DEFAULT ARRAY['simple']::text[];

-- 3. tournament_bracket_matches -----------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_bracket_matches (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round           int  NOT NULL,
  match_number    int  NOT NULL,
  side            text NOT NULL DEFAULT 'winner'
                  CHECK (side IN ('winner','loser','grand_final')),
  participant1_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  participant2_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  loser_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  wod_id          uuid REFERENCES public.tournament_wods(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','completed','bye')),
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, round, match_number, side)
);

CREATE INDEX IF NOT EXISTS idx_tbm_tournament ON public.tournament_bracket_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tbm_round      ON public.tournament_bracket_matches(tournament_id, round);

ALTER TABLE public.tournament_bracket_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bracket_matches_read"        ON public.tournament_bracket_matches;
DROP POLICY IF EXISTS "bracket_matches_owner_admin" ON public.tournament_bracket_matches;

CREATE POLICY "bracket_matches_read" ON public.tournament_bracket_matches
  FOR SELECT USING (true);

CREATE POLICY "bracket_matches_owner_admin" ON public.tournament_bracket_matches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.box_members bm ON bm.box_id = t.box_id
      WHERE t.id = tournament_bracket_matches.tournament_id
        AND bm.member_id = auth.uid()
        AND bm.role IN ('owner','coach')
    )
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 4. tournament_divisions (league_div) ----------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_divisions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name            text NOT NULL,
  level           int  NOT NULL,   -- 1 = top, 2 = D2, ...
  max_members     int  NOT NULL DEFAULT 16,
  promote_count   int  NOT NULL DEFAULT 0,
  relegate_count  int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, level)
);

CREATE INDEX IF NOT EXISTS idx_td_tournament ON public.tournament_divisions(tournament_id);

ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "divisions_read"        ON public.tournament_divisions;
DROP POLICY IF EXISTS "divisions_owner_admin" ON public.tournament_divisions;

CREATE POLICY "divisions_read" ON public.tournament_divisions
  FOR SELECT USING (true);

CREATE POLICY "divisions_owner_admin" ON public.tournament_divisions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.box_members bm ON bm.box_id = t.box_id
      WHERE t.id = tournament_divisions.tournament_id
        AND bm.member_id = auth.uid()
        AND bm.role IN ('owner','coach')
    )
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 5. tournament_division_members ---------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_division_members (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  division_id  uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points       numeric NOT NULL DEFAULT 0,
  rank         int,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(division_id, athlete_id)
);

CREATE INDEX IF NOT EXISTS idx_tdm_division ON public.tournament_division_members(division_id);
CREATE INDEX IF NOT EXISTS idx_tdm_athlete  ON public.tournament_division_members(athlete_id);

ALTER TABLE public.tournament_division_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "division_members_read"        ON public.tournament_division_members;
DROP POLICY IF EXISTS "division_members_owner_admin" ON public.tournament_division_members;

CREATE POLICY "division_members_read" ON public.tournament_division_members
  FOR SELECT USING (true);

CREATE POLICY "division_members_owner_admin" ON public.tournament_division_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tournament_divisions d
      JOIN public.tournaments t ON t.id = d.tournament_id
      JOIN public.box_members bm ON bm.box_id = t.box_id
      WHERE d.id = tournament_division_members.division_id
        AND bm.member_id = auth.uid()
        AND bm.role IN ('owner','coach')
    )
    OR EXISTS (SELECT 1 FROM public.profiles
               WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 6. RPC: generate_bracket_round_1 --------------------------------------
-- Pair up all registered participants into round 1 matches (WB for double-elim).
CREATE OR REPLACE FUNCTION public.generate_bracket_round_1(p_tournament_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_format text;
  v_participants uuid[];
  v_count int;
  v_match_num int := 1;
  i int;
BEGIN
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

-- 7. RPC: advance_bracket_round -----------------------------------------
-- Once all matches of round N have winner_id, generate round N+1.
-- Handles single-elim (bracket) and double-elim (swiss).
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

-- 8. RPC: promote_relegate_divisions ------------------------------------
-- End-of-season: top N of each division promote, bottom M relegate.
CREATE OR REPLACE FUNCTION public.promote_relegate_divisions(p_tournament_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  d record;
  upper_div uuid;
  lower_div uuid;
  promoted uuid[];
  relegated uuid[];
BEGIN
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

GRANT EXECUTE ON FUNCTION public.generate_bracket_round_1(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_bracket_round(uuid, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_relegate_divisions(uuid)        TO authenticated;
