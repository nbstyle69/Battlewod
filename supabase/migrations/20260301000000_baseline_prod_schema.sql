-- =====================================================================
-- BASELINE — schema reel de la production (projet lkwdlqlbrbxaiydkoxfp)
-- =====================================================================
-- Genere par `supabase db dump` sur la prod. Ce fichier REMPLACE le rejeu
-- des 140 migrations historiques, desormais dans supabase/migrations_archive/
-- (conservees pour l'historique, plus jamais rejouees).
--
-- Pourquoi : le rejeu produisait un schema FAUX. 20260331_programs.sql cree
-- la version « affiliation » de `programs` sans IF NOT EXISTS, puis
-- 20260414 (version marketplace, celle reellement en prod) est sautee par
-- son propre IF NOT EXISTS. Une base vierge ne pouvait pas reconstruire la
-- prod. Le baseline est desormais la seule source de verite du schema.
--
-- Toute migration future se place APRES ce fichier et doit rester rejouable
-- sur base vierge : la CI (.github/workflows/db-replay.yml) le verifie a
-- chaque PR.
--
-- Perimetre : schema public (tables, vues, fonctions, triggers, RLS, grants,
-- index, contraintes) + buckets et policies storage.
-- Hors perimetre (gere par la plateforme ou par de la donnee, pas par le
-- schema) : schemas auth/realtime, jobs pg_cron, secrets des edge functions.
-- =====================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_daily_official_template"("p_date" "date") RETURNS TABLE("wod_name" "text", "wod_type" "text", "duration" integer, "score_mode" "text", "movements" "text")
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  pool jsonb := '[
    {"wod_name":"Cindy","wod_type":"AMRAP","duration":20,"score_mode":"rounds",
     "movements":"AMRAP 20 min\n5 Pull-ups\n10 Push-ups\n15 Air squats"},
    {"wod_name":"Fran","wod_type":"For Time","duration":10,"score_mode":"time",
     "movements":"21-15-9\nThrusters (43/30 kg)\nPull-ups"},
    {"wod_name":"Helen","wod_type":"For Time","duration":15,"score_mode":"time",
     "movements":"3 rounds\n400 m Run\n21 Kettlebell swings (24/16 kg)\n12 Pull-ups"},
    {"wod_name":"EMOM 12 — Force","wod_type":"EMOM","duration":12,"score_mode":"reps",
     "movements":"EMOM 12 min\nMin 1 : 8 Deadlifts (80/55 kg)\nMin 2 : 10 Box jumps (60/50 cm)\nMin 3 : 12 Wall balls (9/6 kg)"},
    {"wod_name":"Chelsea","wod_type":"EMOM","duration":30,"score_mode":"rounds",
     "movements":"EMOM 30 min\n5 Pull-ups\n10 Push-ups\n15 Air squats"},
    {"wod_name":"Grace","wod_type":"For Time","duration":8,"score_mode":"time",
     "movements":"For Time\n30 Clean & Jerk (60/42 kg)"},
    {"wod_name":"Annie","wod_type":"For Time","duration":10,"score_mode":"time",
     "movements":"50-40-30-20-10\nDouble-unders\nSit-ups"},
    {"wod_name":"AMRAP 15 — Engine","wod_type":"AMRAP","duration":15,"score_mode":"rounds",
     "movements":"AMRAP 15 min\n12 Cal Row\n9 Burpees\n6 Toes-to-bar"},
    {"wod_name":"Karen","wod_type":"For Time","duration":12,"score_mode":"time",
     "movements":"For Time\n150 Wall balls (9/6 kg)"},
    {"wod_name":"AMRAP 12 — Gymnastique","wod_type":"AMRAP","duration":12,"score_mode":"rounds",
     "movements":"AMRAP 12 min\n7 Handstand push-ups\n14 Alternating lunges\n21 Double-unders"},
    {"wod_name":"EMOM 16 — Mixte","wod_type":"EMOM","duration":16,"score_mode":"reps",
     "movements":"EMOM 16 min\nMin 1 : 15 Cal Bike\nMin 2 : 12 Dumbbell snatch (22/15 kg)\nMin 3 : 10 Burpees over bar\nMin 4 : Repos"},
    {"wod_name":"Jackie","wod_type":"For Time","duration":12,"score_mode":"time",
     "movements":"For Time\n1000 m Row\n50 Thrusters (20/15 kg)\n30 Pull-ups"},
    {"wod_name":"AMRAP 18 — Hero-lite","wod_type":"AMRAP","duration":18,"score_mode":"rounds",
     "movements":"AMRAP 18 min\n10 Deadlifts (60/42 kg)\n10 Hang power cleans\n10 Front squats\n10 Push press"},
    {"wod_name":"Barbara-lite","wod_type":"For Time","duration":20,"score_mode":"time",
     "movements":"3 rounds\n20 Pull-ups\n30 Push-ups\n40 Sit-ups\n50 Air squats"}
  ]'::jsonb;
  v_idx int;
  v_item jsonb;
BEGIN
  -- Seed déterministe = hash de la date, modulo la taille du pool.
  v_idx := (('x' || substr(md5(p_date::text), 1, 8))::bit(32)::int & 2147483647)
           % jsonb_array_length(pool);
  v_item := pool -> v_idx;
  RETURN QUERY SELECT
    v_item->>'wod_name',
    v_item->>'wod_type',
    (v_item->>'duration')::int,
    v_item->>'score_mode',
    v_item->>'movements';
END;
$$;




CREATE OR REPLACE FUNCTION "public"."advance_bracket_round"("p_tournament_id" "uuid", "p_completed_round" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."advance_inter_bracket_round"("p_competition_id" "uuid", "p_completed_round" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."apply_bracket_match_elo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  k_match constant numeric := 32;
  v_win   uuid;
  v_lose  uuid;
  v_we    int;
  v_le    int;
  v_exp_w numeric;
  v_delta int;
  v_after_w int;
  v_after_l int;
  h       record;
BEGIN
  -- Reverse a previous result when the winner changes (reset or correction).
  IF TG_OP = 'UPDATE' AND OLD.winner_id IS DISTINCT FROM NEW.winner_id THEN
    FOR h IN SELECT * FROM tournament_match_elo_history WHERE match_id = OLD.id LOOP
      UPDATE profiles p
         SET elo           = GREATEST(100, p.elo - h.elo_delta),
             total_matches = GREATEST(0, p.total_matches - 1),
             wins          = CASE WHEN h.result = 'win' THEN GREATEST(0, p.wins - 1) ELSE p.wins END
       WHERE p.id = h.athlete_id;
    END LOOP;
    DELETE FROM tournament_match_elo_history WHERE match_id = OLD.id;
  END IF;

  -- Apply the new result for a real, completed 1v1 match.
  IF NEW.winner_id IS NOT NULL
     AND NEW.status = 'completed'
     AND NEW.side IN ('winner','loser','grand_final')
     AND NEW.participant1_id IS NOT NULL
     AND NEW.participant2_id IS NOT NULL
     AND NEW.participant1_id <> NEW.participant2_id
     AND NEW.winner_id IN (NEW.participant1_id, NEW.participant2_id) THEN

    v_win  := NEW.winner_id;
    v_lose := CASE WHEN NEW.winner_id = NEW.participant1_id
                   THEN NEW.participant2_id ELSE NEW.participant1_id END;

    SELECT COALESCE(elo, 1000) INTO v_we FROM profiles WHERE id = v_win;
    SELECT COALESCE(elo, 1000) INTO v_le FROM profiles WHERE id = v_lose;
    IF v_we IS NULL OR v_le IS NULL THEN
      RETURN NEW;
    END IF;

    v_exp_w := 1.0 / (1.0 + POWER(10, (v_le - v_we) / 400.0));
    v_delta := ROUND(k_match * (1 - v_exp_w))::int;
    IF v_delta < 1 THEN v_delta := 1; END IF;   -- guarantee a minimum swing

    v_after_w := GREATEST(100, v_we + v_delta);
    v_after_l := GREATEST(100, v_le - v_delta);

    INSERT INTO tournament_match_elo_history
      (match_id, tournament_id, athlete_id, opponent_id, result, elo_before, elo_after, elo_delta)
    VALUES
      (NEW.id, NEW.tournament_id, v_win,  v_lose, 'win',  v_we, v_after_w, v_after_w - v_we),
      (NEW.id, NEW.tournament_id, v_lose, v_win,  'loss', v_le, v_after_l, v_after_l - v_le)
    ON CONFLICT (match_id, athlete_id) DO NOTHING;

    UPDATE profiles SET elo = v_after_w, total_matches = total_matches + 1, wins = wins + 1 WHERE id = v_win;
    UPDATE profiles SET elo = v_after_l, total_matches = total_matches + 1                    WHERE id = v_lose;
  END IF;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."auto_assign_lowest_division"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_format       text;
  v_lowest_div   uuid;
BEGIN
  -- Only act on league_div tournaments
  SELECT format INTO v_format
  FROM public.tournaments
  WHERE id = NEW.tournament_id;

  IF v_format IS DISTINCT FROM 'league_div' THEN
    RETURN NEW;
  END IF;

  -- Lowest division = highest level number
  SELECT id INTO v_lowest_div
  FROM public.tournament_divisions
  WHERE tournament_id = NEW.tournament_id
  ORDER BY level DESC
  LIMIT 1;

  IF v_lowest_div IS NULL THEN
    RETURN NEW; -- no divisions yet, nothing to do
  END IF;

  -- Insert (idempotent thanks to UNIQUE(division_id, athlete_id))
  INSERT INTO public.tournament_division_members (division_id, athlete_id, points, rank)
  VALUES (v_lowest_div, NEW.athlete_id, 0, NULL)
  ON CONFLICT (division_id, athlete_id) DO NOTHING;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."book_appointment_slot"("p_slot_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_slot       public.box_appointment_slots%ROWTYPE;
  v_taken      int;
  v_followup   uuid;
  v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Verrouille le créneau pour sérialiser les réservations concurrentes.
  SELECT * INTO v_slot FROM public.box_appointment_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;
  IF v_slot.starts_at <= now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST';
  END IF;

  -- Le prospect doit être membre de la box.
  IF NOT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = v_slot.box_id AND member_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  SELECT count(*) INTO v_taken
  FROM public.appointment_bookings
  WHERE slot_id = p_slot_id AND status = 'booked';

  IF v_taken >= v_slot.capacity THEN
    RAISE EXCEPTION 'SLOT_FULL';
  END IF;

  SELECT id INTO v_followup
  FROM public.session_followups
  WHERE box_id = v_slot.box_id AND member_id = v_uid;

  INSERT INTO public.appointment_bookings (slot_id, box_id, member_id, followup_id, status)
  VALUES (p_slot_id, v_slot.box_id, v_uid, v_followup, 'booked')
  ON CONFLICT (slot_id, member_id) DO UPDATE SET status = 'booked'
  RETURNING id INTO v_booking_id;

  -- Avance le funnel.
  IF v_followup IS NOT NULL THEN
    UPDATE public.session_followups
    SET status = CASE WHEN status IN ('converted','lost') THEN status ELSE 'meeting_booked' END,
        updated_at = now()
    WHERE id = v_followup;
  END IF;

  RETURN v_booking_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."box_subscribes_programming"("p_programming_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_programming_subscriptions s
    JOIN public.boxes b ON b.id = s.subscriber_box_id
    WHERE s.programming_id = p_programming_id
      AND s.status = 'active'
      AND public.manages_box(b.id)
  );
$$;




CREATE OR REPLACE FUNCTION "public"."calculate_elo"("winner_elo" integer, "loser_elo" integer, "k_factor" integer DEFAULT 32) RETURNS TABLE("new_winner_elo" integer, "new_loser_elo" integer, "elo_change" integer)
    LANGUAGE "plpgsql"
    AS $$
declare
  expected_winner numeric;
  change integer;
begin
  expected_winner := 1.0 / (1 + power(10.0, (loser_elo - winner_elo) / 400.0));
  change := round(k_factor * (1 - expected_winner));
  return query select
    (winner_elo + change)::integer,
    (loser_elo - change)::integer,
    change;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."can_join_daily_tournament"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_tournaments dt
    WHERE dt.id = p_tournament_id
      AND dt.status = 'open'
      AND now() < dt.ends_at
      AND (dt.is_official                                          -- l'officiel est illimité
           OR (SELECT count(*) FROM daily_tournament_participants dp
                 WHERE dp.tournament_id = dt.id) < COALESCE(dt.max_players, 5))
      AND (COALESCE(dt.gender_target, 'mix') = 'mix'
           OR EXISTS (SELECT 1 FROM profiles p
                        WHERE p.id = auth.uid() AND p.gender = dt.gender_target))
  );
$$;




CREATE OR REPLACE FUNCTION "public"."can_join_inter_competition"("p_competition_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM inter_competitions ic
    WHERE ic.id = p_competition_id
      AND ic.status IN ('open', 'active')                          -- draft/closed = refus
      AND (ic.max_participants IS NULL
           OR (SELECT count(*) FROM inter_registrations ir
                 WHERE ir.competition_id = ic.id) < ic.max_participants)
  );
$$;




CREATE OR REPLACE FUNCTION "public"."can_join_tournament"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournaments t
    WHERE t.id = p_tournament_id
      AND t.status = 'open'                                        -- clôturé/actif = refus
      AND (SELECT count(*) FROM tournament_participants tp
             WHERE tp.tournament_id = t.id) < COALESCE(t.max_participants, 2147483647)
      AND (                                                        -- membre de la box (ou staff)
        EXISTS (SELECT 1 FROM boxes b WHERE b.id = t.box_id AND b.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM box_members bm
                     WHERE bm.box_id = t.box_id AND bm.member_id = auth.uid()
                       AND COALESCE(bm.status, 'active') = 'active')
        OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
      )
      AND (                                                        -- genre cible
        COALESCE(t.gender_target, 'mix') = 'mix'
        OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = auth.uid() AND p.gender = t.gender_target)
      )
  );
$$;




CREATE OR REPLACE FUNCTION "public"."check_daily_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_max int;
  v_used int;
  v_target uuid;
BEGIN
  v_target := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
                   ELSE auth.uid() END;
  IF v_target IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'used', 0);
  END IF;

  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = v_target
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0);
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = v_target
    AND cr.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date = p_date;

  RETURN jsonb_build_object('allowed', v_used < 1, 'used', v_used);
END;
$$;




CREATE OR REPLACE FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_max int;
  v_used int;
  v_monday date;
  v_sunday date;
BEGIN
  -- Get the member's plan limit
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = p_user_id
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  -- NULL max = unlimited
  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'max', null);
  END IF;

  -- Calculate current week (Monday to Sunday)
  v_monday := date_trunc('week', CURRENT_DATE)::date;
  v_sunday := v_monday + 6;

  -- Count confirmed reservations this week
  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = p_user_id
    AND cr.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  RETURN jsonb_build_object(
    'allowed', v_used < v_max,
    'used', v_used,
    'max', v_max
  );
END;
$$;




CREATE OR REPLACE FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_target_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_max int;
  v_used int;
  v_monday date;
  v_sunday date;
BEGIN
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = p_user_id
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'max', null);
  END IF;

  v_monday := date_trunc('week', p_target_date)::date;
  v_sunday := v_monday + 6;

  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = p_user_id
    AND cr.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  RETURN jsonb_build_object(
    'allowed', v_used < v_max,
    'used', v_used,
    'max', v_max
  );
END;
$$;




CREATE OR REPLACE FUNCTION "public"."complete_daily_tournament"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_t daily_tournaments%ROWTYPE;
  v_scores int;
BEGIN
  SELECT * INTO v_t FROM daily_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_t.status = 'completed' THEN RETURN true; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM daily_tournament_participants dp
    WHERE dp.tournament_id = p_tournament_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a participant of this tournament';
  END IF;

  SELECT count(*) INTO v_scores
  FROM daily_tournament_scores WHERE tournament_id = p_tournament_id;

  IF v_scores >= COALESCE(v_t.max_players, 5) OR now() >= v_t.ends_at THEN
    UPDATE daily_tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_box_elo"("p_wod_id" "uuid") RETURNS TABLE("member_id" "uuid", "elo_before" integer, "elo_after" integer, "elo_delta" integer, "rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_box_id     uuid;
  v_is_time    boolean;
  v_lb_enabled boolean;
  v_n          int;
  k_pairwise   constant numeric := 64;
  scaled_mult  constant numeric := 0.4;
BEGIN
  SELECT bw.box_id, (bw.wod_type = 'for-time'), COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN RAISE EXCEPTION 'WOD introuvable'; END IF;

  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id AND bm.member_id = auth.uid() AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('boxelo:' || p_wod_id::text));
  IF EXISTS (SELECT 1 FROM box_elo_history h WHERE h.wod_id = p_wod_id) THEN RETURN; END IF;

  CREATE TEMP TABLE _bx_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id, COALESCE(be.elo, 1000)::int AS elo, ws.score_value,
           COALESCE(ws.rx, false) AS rx
      FROM wod_scores ws
      LEFT JOIN box_elo be ON be.member_id = ws.member_id AND be.box_id = v_box_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _bx_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _bx_deltas ON COMMIT DROP AS
  SELECT a.member_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _bx_field a;

  INSERT INTO box_elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,   -- ← cohérence
         d.rank
    FROM _bx_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  INSERT INTO box_elo (member_id, box_id, elo, matches, wins, updated_at)
  SELECT d.member_id, v_box_id,
         GREATEST(100, d.elo_before + d.elo_delta),
         1,
         (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END),
         now()
    FROM _bx_deltas d
  ON CONFLICT (member_id, box_id) DO UPDATE
     SET elo        = EXCLUDED.elo,
         matches    = box_elo.matches + 1,
         wins       = box_elo.wins + EXCLUDED.wins,
         updated_at = now();

  RETURN QUERY
    SELECT d.member_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _bx_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_daily_tournament_elo"("p_tournament_id" "uuid") RETURNS TABLE("user_id" "uuid", "elo_before" integer, "elo_after" integer, "elo_delta" integer, "final_rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
DECLARE
  v_is_time   boolean;
  v_n         int;
  k_pairwise  constant numeric := 64;
  scaled_mult constant numeric := 0.4;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT (dt.score_mode = 'time') INTO v_is_time
    FROM daily_tournaments dt WHERE dt.id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournoi introuvable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dt:' || p_tournament_id::text));
  IF EXISTS (SELECT 1 FROM daily_tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _dt_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT s.user_id, COALESCE(p.elo, 1000)::int AS elo, s.score_value,
           COALESCE(s.rx, false) AS rx
      FROM daily_tournament_scores s JOIN profiles p ON p.id = s.user_id
     WHERE s.tournament_id = p_tournament_id
       AND COALESCE(s.status, 'pending') <> 'contested'
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk FROM ordered o
  )
  SELECT r.user_id, r.elo, r.rx, r.rnk::int AS rank FROM ranked r;

  SELECT COUNT(*) INTO v_n FROM _dt_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _dt_deltas ON COMMIT DROP AS
  SELECT a.user_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _dt_field a;

  -- ── PLANCHER 100 (idem compute_wod_elo) ──
  INSERT INTO daily_tournament_elo_history (tournament_id, user_id, elo_before, elo_after, elo_delta, final_rank)
  SELECT p_tournament_id, d.user_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,
         d.rank
    FROM _dt_deltas d
  ON CONFLICT (tournament_id, user_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _dt_deltas d
   WHERE p.id = d.user_id;

  RETURN QUERY
    SELECT d.user_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _dt_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_inter_competition_elo"("p_competition_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "final_rank" integer, "elo_before" integer, "elo_after" integer, "elo_change" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_n     int;
  v_wods  int;
  v_avg   int;
  k_inter constant numeric := 48;
BEGIN
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ic:' || p_competition_id::text));
  IF EXISTS (SELECT 1 FROM inter_elo_history h WHERE h.competition_id = p_competition_id) THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT s.wod_id) INTO v_wods
    FROM inter_standings s WHERE s.competition_id = p_competition_id;

  CREATE TEMP TABLE _ic_base ON COMMIT DROP AS
  SELECT s.athlete_id, COALESCE(p.elo, 1000)::int AS elo,
         SUM(s.rank)::numeric AS rank_sum, COUNT(*)::int AS wods_done
    FROM inter_standings s JOIN profiles p ON p.id = s.athlete_id
   WHERE s.competition_id = p_competition_id AND s.athlete_id IS NOT NULL
   GROUP BY s.athlete_id, p.elo;

  SELECT COUNT(*) INTO v_n FROM _ic_base;
  IF v_n < 2 THEN
    UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;
    RETURN;
  END IF;

  CREATE TEMP TABLE _ic_field ON COMMIT DROP AS
  SELECT b.athlete_id, b.elo,
         (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) AS points,
         ROW_NUMBER() OVER (
           ORDER BY (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) ASC, b.wods_done DESC, b.elo DESC
         )::int AS rank
    FROM _ic_base b;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _ic_field;

  CREATE TEMP TABLE _ic_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_inter * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _ic_field f;

  INSERT INTO inter_elo_history
    (competition_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_competition_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change),
         GREATEST(100, d.elo_before + d.elo_change) - d.elo_before   -- ← cohérence
    FROM _ic_deltas d
  ON CONFLICT (competition_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _ic_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_change) - d.elo_before AS elo_change
      FROM _ic_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_inter_league_round"("p_competition_id" "uuid", "p_round_number" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."compute_league_wod_elo"("p_tournament_wod_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "division_id" "uuid", "elo_before" integer, "elo_after" integer, "elo_delta" integer, "rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_tournament_id uuid;
  v_type          text;
  v_format        text;
  k_wod           constant numeric := 64;
BEGIN
  SELECT tw.tournament_id, tw.type INTO v_tournament_id, v_type
    FROM tournament_wods tw WHERE tw.id = p_tournament_wod_id;
  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  IF NOT is_tournament_manager(v_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = v_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RAISE EXCEPTION 'ELO par WOD réservé aux ligues (league_div)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lw:' || p_tournament_wod_id::text));

  IF EXISTS (SELECT 1 FROM tournament_wod_elo_history h WHERE h.tournament_wod_id = p_tournament_wod_id) THEN
    RETURN;
  END IF;

  -- Ranked field per division for this WOD (numeric, direction by WOD type).
  CREATE TEMP TABLE _lw_field ON COMMIT DROP AS
  WITH scored AS (
    SELECT ts.athlete_id,
           tdm.division_id,
           COALESCE(p.elo, 1000)::int AS elo,
           NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric AS num
      FROM tournament_scores ts
      JOIN tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
      JOIN tournament_divisions d ON d.id = tdm.division_id AND d.tournament_id = v_tournament_id
      JOIN profiles p ON p.id = ts.athlete_id
     WHERE ts.tournament_wod_id = p_tournament_wod_id
       AND ts.status = 'validated'
  ),
  ranked AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             PARTITION BY s.division_id
             ORDER BY
               CASE WHEN v_type = 'For Time'  THEN COALESCE(s.num,  'Infinity'::numeric) END ASC  NULLS LAST,
               CASE WHEN v_type <> 'For Time' THEN COALESCE(s.num, '-Infinity'::numeric) END DESC NULLS LAST
           )::int AS rank,
           COUNT(*) OVER (PARTITION BY s.division_id)::int AS div_n
      FROM scored s
  )
  SELECT athlete_id, division_id, elo, rank, div_n FROM ranked;

  -- Pairwise ELO within each division for this WOD.
  CREATE TEMP TABLE _lw_deltas ON COMMIT DROP AS
  SELECT a.athlete_id, a.division_id, a.elo AS elo_before, a.rank,
         ROUND(
           (k_wod / GREATEST(1, (a.div_n - 1))) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1
                                       WHEN a.rank = b.rank THEN 0.5
                                       ELSE 0 END), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
           )
         )::int AS elo_delta
    FROM _lw_field a
   WHERE a.div_n >= 2;

  INSERT INTO tournament_wod_elo_history
    (tournament_wod_id, tournament_id, division_id, athlete_id, elo_before, elo_after, elo_delta, rank)
  SELECT p_tournament_wod_id, v_tournament_id, d.division_id, d.athlete_id,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before, d.rank
    FROM _lw_deltas d
  ON CONFLICT (tournament_wod_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _lw_deltas d
   WHERE p.id = d.athlete_id;

  RETURN QUERY
    SELECT d.athlete_id, d.division_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _lw_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_tournament_elo"("p_tournament_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "final_rank" integer, "elo_before" integer, "elo_after" integer, "elo_change" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_n      int;
  v_avg    int;
  v_format text;
  k_tourn  constant numeric := 48;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = p_tournament_id;

  IF v_format IN ('bracket','swiss','league_div') THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('t:' || p_tournament_id::text));
  IF EXISTS (SELECT 1 FROM tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _t_field ON COMMIT DROP AS
  SELECT tp.athlete_id, COALESCE(p.elo, 1000)::int AS elo,
         ROW_NUMBER() OVER (ORDER BY tp.score DESC)::int AS rank
    FROM tournament_participants tp
    JOIN profiles p ON p.id = tp.athlete_id
   WHERE tp.tournament_id = p_tournament_id;

  SELECT COUNT(*) INTO v_n FROM _t_field;
  IF v_n < 2 THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _t_field;

  CREATE TEMP TABLE _t_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_tourn * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _t_field f;

  INSERT INTO tournament_elo_history
    (tournament_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_tournament_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change),
         GREATEST(100, d.elo_before + d.elo_change) - d.elo_before   -- ← cohérence
    FROM _t_deltas d
  ON CONFLICT (tournament_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _t_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_change) - d.elo_before AS elo_change
      FROM _t_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."compute_wod_elo"("p_wod_id" "uuid") RETURNS TABLE("member_id" "uuid", "elo_before" integer, "elo_after" integer, "elo_delta" integer, "rank" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_box_id       uuid;
  v_is_time      boolean;
  v_lb_enabled   boolean;
  v_n            int;
  k_pairwise     constant numeric := 64;
  scaled_mult    constant numeric := 0.4;
BEGIN
  SELECT bw.box_id, (bw.wod_type = 'for-time'), COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN RAISE EXCEPTION 'WOD introuvable'; END IF;

  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id AND bm.member_id = auth.uid() AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_wod_id::text));
  IF EXISTS (SELECT 1 FROM elo_history eh WHERE eh.wod_id = p_wod_id) THEN RETURN; END IF;

  CREATE TEMP TABLE _wod_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id, COALESCE(p.elo, 1000)::int AS elo, ws.score_value,
           COALESCE(ws.rx, false) AS rx
      FROM wod_scores ws JOIN profiles p ON p.id = ws.member_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _wod_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _wod_deltas ON COMMIT DROP AS
  SELECT a.member_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _wod_field a;

  -- ── PLANCHER 100 : elo_after plafonné, elo_delta recalculé pour cohérence ──
  INSERT INTO elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,
         d.rank
    FROM _wod_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _wod_deltas d
   WHERE p.id = d.member_id;

  RETURN QUERY
    SELECT d.member_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _wod_deltas d;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."consume_credit_on_reservation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_has_sub    boolean;
  v_has_any    boolean;
  v_credit_id  uuid;
BEGIN
  -- Un crédit n'est consommé que par une réservation confirmée.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Déjà rattachée à un crédit (ex. UPDATE sans changement d'accès) -> rien.
  IF NEW.credit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mode abonnement : le quota hebdo (trigger dédié) s'applique, pas les crédits.
  SELECT EXISTS (
    SELECT 1
    FROM box_members bm
    JOIN membership_plans mp ON mp.id = bm.plan_id
    WHERE bm.member_id = NEW.member_id
      AND bm.box_id = NEW.box_id
      AND bm.status = 'active'
      AND mp.plan_type = 'subscription'
      AND COALESCE(bm.subscription_status, '') IN ('active', 'trialing', 'past_due')
  ) INTO v_has_sub;

  IF v_has_sub THEN
    RETURN NEW;
  END IF;

  -- Cherche un crédit disponible (le plus proche de l'expiration d'abord).
  SELECT id INTO v_credit_id
  FROM member_class_credits
  WHERE member_id = NEW.member_id
    AND box_id = NEW.box_id
    AND status = 'active'
    AND expires_at > now()
    AND credits_used < credits_total
  ORDER BY expires_at ASC
  FOR UPDATE
  LIMIT 1;

  IF v_credit_id IS NOT NULL THEN
    UPDATE member_class_credits
    SET credits_used = credits_used + 1,
        status = CASE WHEN credits_used + 1 >= credits_total THEN 'exhausted' ELSE status END
    WHERE id = v_credit_id;
    NEW.credit_id := v_credit_id;
    RETURN NEW;
  END IF;

  -- Pas de crédit dispo : si le membre a DÉJÀ acheté des crédits pour cette box
  -- (mode crédit), on bloque. Sinon (membre libre/invité) : accès inchangé.
  SELECT EXISTS (
    SELECT 1 FROM member_class_credits
    WHERE member_id = NEW.member_id AND box_id = NEW.box_id
  ) INTO v_has_any;

  IF v_has_any THEN
    RAISE EXCEPTION 'NO_CREDITS_LEFT: aucun crédit valide (carnet épuisé ou expiré)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."delete_user_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- GARDE OWNER : boxes.owner_id est CASCADE → supprimer un owner supprime sa
  -- box et toutes les adhésions. On l'interdit tant que d'autres membres
  -- actifs en dépendent. (Owner seul : la suppression passe, la box part.)
  IF EXISTS (
    SELECT 1 FROM public.boxes b
    JOIN public.box_members m ON m.box_id = b.id
    WHERE b.owner_id = uid AND m.member_id <> uid AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'BOX_OWNER: transfère ou ferme ta box avant de supprimer ton compte'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RGPD storage : avatars + documents + pièces jointes de l'utilisateur.
  -- (Supprime les métadonnées et rend l'objet inaccessible ; le protocole
  --  vérifie qu'aucune URL ne le sert plus.)
  -- Le trigger plateforme storage.protect_objects_delete refuse tout DELETE
  -- direct (ERRCODE 42501) sauf si cette GUC locale est posée — c'est le
  -- mécanisme documenté pour une purge serveur légitime. LOCAL = limité à la
  -- transaction de cette RPC.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects
  WHERE (bucket_id = 'avatars'   AND (owner = uid OR name LIKE uid || '/%'))
     OR (bucket_id = 'documents' AND (owner = uid OR name LIKE uid || '/%'))
     OR (bucket_id = 'message-attachments' AND owner = uid);

  -- Tableaux de membres (pas de FK possible sur un uuid[]).
  UPDATE public.message_groups SET members = array_remove(members, uid)
  WHERE uid = ANY(members);

  -- Tout le reste est DÉCLARATIF : les FK (75 CASCADE historiques + celles du
  -- 3A.1) suppriment la donnée de l'utilisateur et anonymisent ses références
  -- dans le contenu des autres. Aucune table à énumérer, y compris futures.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."detect_trial_followups"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_inserted int;
BEGIN
  WITH first_attended AS (
    SELECT DISTINCT ON (cr.box_id, cr.member_id)
      cr.box_id, cr.member_id, cr.id AS reservation_id, cr.schedule_id, cs.scheduled_date
    FROM public.class_reservations cr
    JOIN public.class_schedules cs ON cs.id = cr.schedule_id
    WHERE cr.attended = true
    ORDER BY cr.box_id, cr.member_id, cs.scheduled_date ASC
  ),
  eligible AS (
    SELECT fa.*
    FROM first_attended fa
    WHERE NOT EXISTS (
      -- Pas d'abonnement de salle actif.
      SELECT 1 FROM public.box_members bm
      JOIN public.membership_plans mp ON mp.id = bm.plan_id
      WHERE bm.box_id = fa.box_id AND bm.member_id = fa.member_id
        AND bm.status = 'active' AND mp.plan_type = 'subscription'
        AND COALESCE(bm.subscription_status, '') IN ('active','trialing','past_due')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.session_followups sf
      WHERE sf.box_id = fa.box_id AND sf.member_id = fa.member_id
    )
  ),
  ins AS (
    INSERT INTO public.session_followups (box_id, member_id, schedule_id, reservation_id, first_seen_at, status)
    SELECT box_id, member_id, schedule_id, reservation_id,
           COALESCE(scheduled_date::timestamptz, now()), 'pending'
    FROM eligible
    ON CONFLICT (box_id, member_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."end_season_and_advance"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."enforce_reservation_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cap       int;
  v_confirmed int;
BEGIN
  -- Only relevant when the row would become confirmed.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent bookings for the same class.
  PERFORM pg_advisory_xact_lock(hashtext('resa:' || NEW.schedule_id::text));

  SELECT max_capacity INTO v_cap FROM class_schedules WHERE id = NEW.schedule_id;
  IF v_cap IS NULL THEN
    RETURN NEW; -- unknown schedule → let the FK constraint reject it
  END IF;

  SELECT COUNT(*) INTO v_confirmed
    FROM class_reservations
   WHERE schedule_id = NEW.schedule_id
     AND status = 'confirmed'
     AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_confirmed >= v_cap THEN
    NEW.status := 'waiting';
  END IF;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."enforce_weekly_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_max    int;
  v_used   int;
  v_date   date;
  v_monday date;
  v_sunday date;
BEGIN
  -- Seules les réservations confirmées consomment le quota.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Quota de la formule active du membre (NULL = illimité ou aucune formule).
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = NEW.member_id
    AND bm.box_id = NEW.box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT scheduled_date INTO v_date FROM class_schedules WHERE id = NEW.schedule_id;
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;
  v_monday := date_trunc('week', v_date)::date;
  v_sunday := v_monday + 6;

  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = NEW.member_id
    AND cr.box_id = NEW.box_id
    AND cr.status = 'confirmed'
    AND (TG_OP = 'INSERT' OR cr.id <> NEW.id)
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  IF v_used >= v_max THEN
    RAISE EXCEPTION 'WEEKLY_LIMIT_REACHED: %/% séances cette semaine', v_used, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."ensure_daily_official_wod"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_date  date;
  v_dow   int;
  v_start timestamptz;
  v_id    uuid;
  v_is_admin boolean;
  tpl     record;
BEGIN
  -- Autorisation : cron/service (auth.uid() NULL) OU admin/super_admin.
  IF auth.uid() IS NOT NULL THEN
    SELECT (role IN ('admin', 'super_admin')) INTO v_is_admin
      FROM profiles WHERE id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Réservé aux administrateurs';
    END IF;
  END IF;

  v_date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_dow  := EXTRACT(DOW FROM v_date)::int;   -- 0 = dimanche

  -- Pas de WOD le dimanche (jour de repos).
  IF v_dow = 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotence : déjà déployé aujourd'hui ?
  SELECT id INTO v_id FROM daily_tournaments
    WHERE is_official AND official_date = v_date;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  -- Verrou pour éviter les doublons si le cron rejoue en concurrence.
  PERFORM pg_advisory_xact_lock(hashtext('official_wod:' || v_date::text));
  SELECT id INTO v_id FROM daily_tournaments
    WHERE is_official AND official_date = v_date;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO tpl FROM _daily_official_template(v_date);

  -- Minuit Europe/Paris du jour → +24h.
  v_start := (v_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Paris';

  INSERT INTO daily_tournaments (
    creator_id, wod_name, wod_type, duration, level, movements,
    score_mode, max_players, status, elo_reward,
    is_official, official_date, starts_at, ends_at
  ) VALUES (
    NULL, tpl.wod_name, tpl.wod_type, tpl.duration, 'rx', tpl.movements,
    tpl.score_mode, 1000000, 'open', 0,
    true, v_date, v_start, v_start + interval '24 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."extend_all_class_schedules"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total INT := 0;
  v_box RECORD;
BEGIN
  FOR v_box IN
    SELECT DISTINCT box_id
    FROM schedule_templates
    WHERE is_active = TRUE
  LOOP
    v_total := v_total + public.generate_class_schedules_from_templates(v_box.box_id, 8);
  END LOOP;
  RETURN v_total;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."fn_message_group_members_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE message_groups
  SET members = array_remove(members, OLD.member_id)
  WHERE id = OLD.group_id;
  RETURN OLD;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."fn_message_group_members_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE message_groups
  SET members = array_append(members, NEW.member_id)
  WHERE id = NEW.group_id
    AND NOT (NEW.member_id = ANY(members));
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."generate_bracket_round_1"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."generate_class_schedules_from_templates"("p_box_id" "uuid", "p_weeks_ahead" integer DEFAULT 8) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted INT := 0;
  v_start_date DATE := CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1));
  v_end_date DATE;
BEGIN
  IF p_weeks_ahead IS NULL OR p_weeks_ahead < 1 THEN
    p_weeks_ahead := 8;
  END IF;

  v_end_date := v_start_date + (p_weeks_ahead * 7) - 1;

  WITH ins AS (
    INSERT INTO class_schedules
      (box_id, title, description, coach, scheduled_date, start_time, end_time, max_capacity)
    SELECT
      t.box_id, t.title, t.description, t.coach,
      d::date, t.start_time, t.end_time, t.max_capacity
    FROM schedule_templates t
    CROSS JOIN generate_series(v_start_date, v_end_date, INTERVAL '1 day') AS d
    WHERE t.box_id = p_box_id
      AND t.is_active = TRUE
      AND EXTRACT(ISODOW FROM d)::INT = t.day_of_week
      AND NOT EXISTS (
        SELECT 1 FROM class_schedules cs
        WHERE cs.box_id = t.box_id
          AND cs.scheduled_date = d::date
          AND cs.start_time = t.start_time
          AND cs.title = t.title
      )
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."generate_inter_bracket_round_1"("p_competition_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."generate_inter_pool_groups"("p_competition_id" "uuid", "p_groups_count" integer DEFAULT 2, "p_advance_count" integer DEFAULT 2) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."generate_inter_swiss_round"("p_competition_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."get_box_billing"("p_box_id" "uuid") RETURNS TABLE("id" "uuid", "member_id" "uuid", "amount_cents" integer, "platform_fee_cents" integer, "has_stripe_sub" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bm.id, bm.member_id, bm.amount_cents, bm.platform_fee_cents,
         (bm.stripe_subscription_id IS NOT NULL)
  FROM public.box_members bm
  WHERE bm.box_id = p_box_id
    AND (
      public.is_box_owner(p_box_id)
      OR public.is_box_owner_member(p_box_id)
      OR public.is_super_admin()
    );
$$;




CREATE OR REPLACE FUNCTION "public"."get_box_dunning"("p_box_id" "uuid") RETURNS TABLE("id" "uuid", "username" "text", "email" "text", "plan_name" "text", "amount_cents" integer, "payment_method_type" "text", "past_due_since" timestamp with time zone, "dunning_attempts" integer, "dunning_reminders_sent" integer, "dunning_last_reminder_at" timestamp with time zone, "last_payment_error" "text", "has_stripe_sub" boolean, "suspended" boolean, "grace_days" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    bm.id,
    p.username,
    p.email,
    mp.name,
    bm.amount_cents,
    bm.payment_method_type,
    bm.past_due_since,
    bm.dunning_attempts,
    bm.dunning_reminders_sent,
    bm.dunning_last_reminder_at,
    bm.last_payment_error,
    (bm.stripe_subscription_id is not null),
    -- Accès suspendu dès que l'impayé dépasse le délai de grâce de la box.
    (bm.past_due_since is not null
      and now() >= bm.past_due_since + make_interval(days => coalesce(b.dunning_grace_days, 7))),
    b.dunning_grace_days
  from public.box_members bm
  join public.boxes b on b.id = bm.box_id
  left join public.profiles p on p.id = bm.member_id
  left join public.membership_plans mp on mp.id = bm.plan_id
  where bm.box_id = p_box_id
    and bm.subscription_status = 'past_due'
    and (
      public.is_box_owner(p_box_id)
      or public.is_box_owner_member(p_box_id)
      or public.is_super_admin()
    )
  order by bm.past_due_since asc nulls last;
$$;




CREATE OR REPLACE FUNCTION "public"."get_box_mate_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT DISTINCT bm2.member_id FROM public.box_members bm2
  WHERE bm2.box_id IN (
    SELECT bm.box_id FROM public.box_members bm
    WHERE bm.member_id = auth.uid() AND bm.status = 'active'
  ) AND bm2.status = 'active';
$$;




CREATE OR REPLACE FUNCTION "public"."get_my_membership_billing"() RETURNS TABLE("id" "uuid", "box_id" "uuid", "amount_cents" integer, "platform_fee_cents" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bm.id, bm.box_id, bm.amount_cents, bm.platform_fee_cents
  FROM public.box_members bm
  WHERE bm.member_id = auth.uid();
$$;




CREATE OR REPLACE FUNCTION "public"."get_total_box_count"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT count(*)::int FROM boxes;
$$;




CREATE OR REPLACE FUNCTION "public"."get_tournament_participants"("p_tournament_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "score" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT athlete_id, score
  FROM   tournament_participants
  WHERE  tournament_id = p_tournament_id
  ORDER  BY score DESC NULLS LAST;
$$;




CREATE OR REPLACE FUNCTION "public"."get_tournament_validated_scores"("p_tournament_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "tournament_wod_id" "uuid", "score_value" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT athlete_id, tournament_wod_id, score_value
  FROM   tournament_scores
  WHERE  tournament_id = p_tournament_id
  AND    status = 'validated';
$$;




CREATE OR REPLACE FUNCTION "public"."get_user_box_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bm.box_id FROM box_members bm
  WHERE bm.member_id = auth.uid() AND bm.status = 'active'
  LIMIT 1;
$$;




CREATE OR REPLACE FUNCTION "public"."get_user_box_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bm.box_id FROM public.box_members bm
  WHERE bm.member_id = auth.uid() AND bm.status = 'active';
$$;




CREATE OR REPLACE FUNCTION "public"."increment_movement_stats"("p_user_id" "uuid", "p_movement" "text", "p_reps" integer, "p_weight" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_target uuid;
BEGIN
  -- Cible forcée : un appelant client ne peut cumuler QUE pour lui-même (auth.uid()).
  -- Seul le backend de confiance (service_role) peut viser un p_user_id explicite.
  v_target := CASE WHEN auth.role() = 'service_role'
                     THEN COALESCE(p_user_id, auth.uid())
                   ELSE auth.uid() END;
  IF v_target IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_movement_stats (user_id, movement, total_reps, best_weight, updated_at)
  VALUES (v_target, p_movement, p_reps, p_weight, now())
  ON CONFLICT (user_id, movement) DO UPDATE SET
    total_reps = user_movement_stats.total_reps + p_reps,
    best_weight = GREATEST(user_movement_stats.best_weight, p_weight),
    updated_at = now();
END;
$$;




CREATE OR REPLACE FUNCTION "public"."is_blocked_pair"("u1" "uuid", "u2" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = u1 AND blocked_id = u2)
       OR (blocker_id = u2 AND blocked_id = u1)
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_admin"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id
        AND member_id = auth.uid()
        AND role IN ('owner','coach')
        AND COALESCE(status, 'active') = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')   -- box_owner RETIRÉ
    );
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_coach"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND role = 'coach'
      AND status = 'active'
  )
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_member"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND status = 'active'
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_owner"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM boxes WHERE id = p_box_id AND owner_id = auth.uid()
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_owner_member"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  )
$$;




CREATE OR REPLACE FUNCTION "public"."is_box_staff"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.boxes
      WHERE id = p_box_id AND owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id
        AND member_id = auth.uid()
        AND role IN ('owner', 'coach')
        AND COALESCE(status, 'active') = 'active'
    );
$$;




CREATE OR REPLACE FUNCTION "public"."is_inter_competition_manager"("p_competition_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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




CREATE OR REPLACE FUNCTION "public"."is_privileged_backend"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT current_user IN (
    'service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin'
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;




CREATE OR REPLACE FUNCTION "public"."is_support_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.support_admins WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    );
$$;




CREATE OR REPLACE FUNCTION "public"."is_tournament_manager"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = p_tournament_id
      AND public.is_box_admin(t.box_id)
  );
$$;




CREATE OR REPLACE FUNCTION "public"."join_box_by_invite"("p_invite_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_box_id uuid;
  v_owner  uuid;
  v_status text;
  v_role   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, owner_id INTO v_box_id, v_owner
  FROM public.boxes
  WHERE upper(invite_code) = upper(btrim(p_invite_code)) AND is_active = true;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'Code invalide ou box introuvable';
  END IF;

  -- Un owner « primaire » qui rejoint sa propre box par le code ne doit pas se
  -- retrouver simple membre (même cas qu'aux lots 1C-a / 1C-c).
  v_role := CASE WHEN v_owner = auth.uid() THEN 'owner' ELSE 'member' END;

  SELECT status INTO v_status
  FROM public.box_members
  WHERE box_id = v_box_id AND member_id = auth.uid();

  -- 1. Jamais membre → adhésion normale.
  IF v_status IS NULL THEN
    INSERT INTO public.box_members (box_id, member_id, status, role)
    VALUES (v_box_id, auth.uid(), 'active', v_role)
    ON CONFLICT (box_id, member_id) DO NOTHING;   -- course entre deux appels
    RETURN v_box_id;
  END IF;

  -- 2. Exclu → refus EXPLICITE. Sans ce garde-fou, la réactivation du point 3
  --    réadmettrait un membre banni via le code d'invitation de la box.
  IF v_status = 'banned' THEN
    RAISE EXCEPTION 'BANNED: votre acces a cette box a ete revoque'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Déjà membre → idempotent (l'app peut rappeler le code sans effet de bord).
  IF v_status = 'active' THEN
    RETURN v_box_id;
  END IF;

  -- 4. Ex-membre (`inactive`) → réactivation PROPRE.
  --    Aucun élément d'abonnement n'est ressuscité : ni forfait, ni identifiants
  --    Stripe, ni engagement, ni compteurs de relance. Le membre revient comme
  --    un nouvel arrivant et souscrira à nouveau s'il le souhaite.
  UPDATE public.box_members SET
    status                            = 'active',
    role                              = v_role,
    plan_id                           = NULL,
    subscription_status               = NULL,
    stripe_subscription_id            = NULL,
    stripe_checkout_session_id        = NULL,
    subscription_current_period_end   = NULL,
    amount_cents                      = NULL,
    platform_fee_cents                = NULL,
    subscription_cancel_at_period_end = false,
    commitment_end_date               = NULL,
    subscription_paused               = false,
    pause_started_at                  = NULL,
    pause_resumes_at                  = NULL,
    payment_method_type               = NULL,
    past_due_since                    = NULL,
    dunning_attempts                  = 0,
    last_payment_error                = NULL,
    dunning_reminders_sent            = 0,
    dunning_last_reminder_at          = NULL
  WHERE box_id = v_box_id AND member_id = auth.uid();

  RETURN v_box_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."manages_box"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.box_members
        WHERE box_id = p_box_id AND member_id = auth.uid()
          AND role IN ('owner', 'coach') AND COALESCE(status, 'active') = 'active'
      );
$$;




CREATE OR REPLACE FUNCTION "public"."manages_box_funnel"("p_box_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id AND member_id = auth.uid()
        AND role IN ('owner', 'coach') AND COALESCE(status, 'active') = 'active'
    );
$$;




CREATE OR REPLACE FUNCTION "public"."materialize_box_programming"("p_target_monday" "date" DEFAULT NULL::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_monday    date;
  v_reveal    timestamptz;
  v_inserted  integer := 0;
  sub         record;
  wodrow      record;
  v_weeknum   int;
BEGIN
  -- Lundi de la semaine à venir (par défaut : le prochain lundi).
  v_monday := COALESCE(
    p_target_monday,
    ((now() AT TIME ZONE 'Europe/Paris')::date
      - EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Paris'))::int + 1) + 7
  );
  -- Révélation : dimanche 18h Europe/Paris précédant cette semaine.
  v_reveal := ((v_monday - 1)::text || ' 18:00:00 Europe/Paris')::timestamptz;

  FOR sub IN
    SELECT s.*, p.weeks_count
    FROM public.box_programming_subscriptions s
    JOIN public.box_programming p ON p.id = s.programming_id
    WHERE s.status = 'active'
  LOOP
    -- Semaine due par rotation (boucle sur weeks_count).
    v_weeknum := (((v_monday - sub.week_anchor) / 7) % GREATEST(sub.weeks_count, 1)) + 1;

    FOR wodrow IN
      SELECT * FROM public.box_programming_wods
      WHERE programming_id = sub.programming_id AND week_number = v_weeknum
    LOOP
      INSERT INTO public.box_wods (
        box_id, created_by, title, description, wod_type,
        scheduled_date, time_cap_seconds, rounds, is_published,
        publish_at, sort_order, source_programming_id, source_programming_wod_id
      )
      VALUES (
        sub.subscriber_box_id, sub.created_by, wodrow.title, wodrow.description,
        wodrow.wod_type, v_monday + (wodrow.day_of_week - 1),
        wodrow.time_cap_seconds, wodrow.rounds, true,
        v_reveal, wodrow.sort_order, sub.programming_id, wodrow.id
      )
      ON CONFLICT (box_id, scheduled_date, source_programming_wod_id)
        WHERE source_programming_wod_id IS NOT NULL DO NOTHING;

      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."owner_box_count"("p_owner_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT count(*)::int FROM public.boxes WHERE owner_id = p_owner_id;
$$;




CREATE OR REPLACE FUNCTION "public"."peer_review_daily_score"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_score daily_tournament_scores%ROWTYPE;
BEGIN
  IF p_action NOT IN ('validated', 'contested') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot review your own score';
  END IF;
  SELECT * INTO v_score FROM daily_tournament_scores
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'score not found'; END IF;
  IF v_score.status <> 'pending' THEN
    RAISE EXCEPTION 'score already reviewed';
  END IF;
  -- Le relecteur doit être participant du même tournoi, encore ouvert.
  IF NOT EXISTS (
    SELECT 1 FROM daily_tournament_participants dp
    JOIN daily_tournaments dt ON dt.id = dp.tournament_id
    WHERE dp.tournament_id = p_tournament_id
      AND dp.user_id = auth.uid()
      AND dt.status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'not a participant of this tournament';
  END IF;

  UPDATE daily_tournament_scores
  SET status = p_action,
      contested_by = CASE WHEN p_action = 'contested' THEN auth.uid() ELSE contested_by END,
      contest_reason = CASE WHEN p_action = 'contested' THEN p_reason ELSE contest_reason END
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."prevent_client_box_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La création de box se fait sur athlex.app (owner via abonnement web).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;




CREATE OR REPLACE FUNCTION "public"."prevent_client_subscription_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Les abonnements de box sont gérés côté serveur (Stripe / athlex.app).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;




CREATE OR REPLACE FUNCTION "public"."prevent_role_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL OR NEW.role NOT IN ('member', 'athlete') THEN
      NEW.role := 'member';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
    -- Colonnes de compétition : écriture réservée aux RPC serveur (definer).
    NEW.elo           := OLD.elo;
    NEW.wins          := OLD.wins;
    NEW.losses        := OLD.losses;
    NEW.total_matches := OLD.total_matches;
  END IF;

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."promote_relegate_divisions"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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




CREATE OR REPLACE FUNCTION "public"."promote_waiting_reservation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r        record;
  v_status text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'confirmed' THEN
    RETURN OLD;
  END IF;

  -- Candidats par ancienneté. La borne évite un balayage sans fin si une file
  -- entière est inéligible ; au-delà, personne n'est promu et l'annulation
  -- aboutit quand même (c'est le comportement voulu).
  <<promo>>
  FOR r IN
    SELECT id FROM class_reservations
    WHERE schedule_id = OLD.schedule_id AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT 20
  LOOP
    BEGIN
      UPDATE class_reservations SET status = 'confirmed' WHERE id = r.id;

      SELECT status INTO v_status FROM class_reservations WHERE id = r.id;
      IF v_status = 'confirmed' THEN
        EXIT promo;                     -- promu, terminé
      END IF;

      -- Statut resté 'waiting' : enforce_reservation_capacity a jugé le
      -- créneau plein. Inutile d'essayer les suivants.
      EXIT promo;

    EXCEPTION WHEN OTHERS THEN
      -- Candidat inéligible : NO_CREDITS_LEFT (carnet épuisé) ou
      -- WEEKLY_LIMIT_REACHED (quota atteint). On passe au suivant.
      -- L'annulation du membre partant ne doit jamais échouer à cause de
      -- l'état d'un tiers : c'est TOUT l'objet de ce correctif.
      RAISE NOTICE 'liste attente: candidat % ignore (%)', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN OLD;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."reactivate_box_member"("p_box_id" "uuid", "p_member_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: reserve aux gestionnaires de la box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.box_members SET
    status                            = 'active',
    plan_id                           = NULL,
    subscription_status               = NULL,
    stripe_subscription_id            = NULL,
    stripe_checkout_session_id        = NULL,
    subscription_current_period_end   = NULL,
    amount_cents                      = NULL,
    platform_fee_cents                = NULL,
    subscription_cancel_at_period_end = false,
    commitment_end_date               = NULL,
    subscription_paused               = false,
    pause_started_at                  = NULL,
    pause_resumes_at                  = NULL,
    payment_method_type               = NULL,
    past_due_since                    = NULL,
    dunning_attempts                  = 0,
    last_payment_error                = NULL,
    dunning_reminders_sent            = 0,
    dunning_last_reminder_at          = NULL
  WHERE box_id = p_box_id AND member_id = p_member_id AND status <> 'active';

  RETURN FOUND;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."recalc_division_points"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_format text;
BEGIN
  SELECT format INTO v_format FROM public.tournaments WHERE id = p_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RETURN;
  END IF;

  UPDATE public.tournament_division_members tdm
  SET points = 0
  FROM public.tournament_divisions d
  WHERE d.id = tdm.division_id
    AND d.tournament_id = p_tournament_id;

  WITH ranked AS (
    SELECT
      tdm.id AS member_id,
      ROW_NUMBER() OVER (
        PARTITION BY ts.tournament_wod_id, tdm.division_id
        ORDER BY
          CASE WHEN tw.type = 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric, 'Infinity'::numeric)
          END ASC NULLS LAST,
          CASE WHEN tw.type <> 'For Time'
               THEN COALESCE(NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric, '-Infinity'::numeric)
          END DESC NULLS LAST
      ) AS rk
    FROM public.tournament_scores ts
    JOIN public.tournament_wods tw ON tw.id = ts.tournament_wod_id
    JOIN public.tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
    JOIN public.tournament_divisions d ON d.id = tdm.division_id
    WHERE d.tournament_id = p_tournament_id
      AND ts.tournament_id = p_tournament_id
      AND ts.status = 'validated'
  ),
  totals AS (
    SELECT member_id, SUM(GREATEST(1, 100 - (rk::int - 1) * 3)) AS pts
    FROM ranked
    GROUP BY member_id
  )
  UPDATE public.tournament_division_members tdm
  SET points = totals.pts
  FROM totals
  WHERE tdm.id = totals.member_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."refund_credit_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_start timestamptz;
BEGIN
  IF OLD.credit_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT (cs.scheduled_date + cs.start_time::time) AT TIME ZONE 'Europe/Paris'
    INTO v_start
  FROM class_schedules cs
  WHERE cs.id = OLD.schedule_id;

  -- Remboursement seulement si annulation au moins 5 h avant le début.
  IF v_start IS NOT NULL AND v_start - now() >= interval '5 hours' THEN
    UPDATE member_class_credits
    SET credits_used = GREATEST(credits_used - 1, 0),
        status = CASE
          WHEN status = 'exhausted' AND expires_at > now() THEN 'active'
          ELSE status
        END
    WHERE id = OLD.credit_id;
  END IF;

  RETURN OLD;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."release_reservations_on_revoke"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_member uuid;
  v_box    uuid;
  v_freed  int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_member := OLD.member_id;
    v_box    := OLD.box_id;
  ELSE
    -- Seule la SORTIE de l'état actif nous intéresse : une bascule
    -- banned → inactive, ou une simple mise à jour de plan, ne doit rien libérer.
    IF OLD.status = 'active' AND NEW.status IN ('inactive', 'banned') THEN
      v_member := NEW.member_id;
      v_box    := NEW.box_id;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  DELETE FROM public.class_reservations cr
  USING public.class_schedules cs
  WHERE cs.id = cr.schedule_id
    AND cr.member_id = v_member
    AND cr.box_id    = v_box
    AND cs.scheduled_date >= CURRENT_DATE;

  GET DIAGNOSTICS v_freed = ROW_COUNT;
  IF v_freed > 0 THEN
    RAISE NOTICE 'revocation: % reservation(s) future(s) liberee(s) pour le membre %', v_freed, v_member;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_report_id uuid;
BEGIN
  INSERT INTO public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details)
  VALUES (auth.uid(), p_reported_user_id, p_content_type, p_content_id, p_reason, p_details)
  RETURNING id INTO v_report_id;
  RETURN v_report_id;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."resolve_inter_pool_match"("p_match_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text" DEFAULT 'reps'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."resolve_inter_swiss_pairing"("p_pairing_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text" DEFAULT 'reps'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;




CREATE OR REPLACE FUNCTION "public"."submit_followup_feedback"("p_followup_id" "uuid", "p_rating" smallint, "p_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.session_followups
  SET rating = p_rating,
      feedback_comment = p_comment,
      responded_at = now(),
      status = CASE WHEN status = 'pending' THEN 'responded' ELSE status END,
      updated_at = now()
  WHERE id = p_followup_id AND member_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';
  END IF;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."support_touch_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.sender_role = 'admin' THEN
    UPDATE public.support_tickets
      SET last_message_at = NEW.created_at,
          requester_unread = true,
          status = CASE WHEN status = 'resolved' THEN status ELSE 'answered' END
      WHERE id = NEW.ticket_id;
  ELSE
    UPDATE public.support_tickets
      SET last_message_at = NEW.created_at,
          admin_unread = true,
          status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
      WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."sync_auth_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.email is distinct from old.email then
    update public.profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."sync_member_plan_groups"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_member  uuid := NEW.member_id;
  v_box     uuid := NEW.box_id;
  v_target  uuid[];
  v_managed uuid[];
BEGIN
  IF v_member IS NULL OR v_box IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(mpg.group_id), '{}') INTO v_target
  FROM membership_plan_groups mpg
  WHERE mpg.plan_id = NEW.plan_id;

  SELECT COALESCE(array_agg(DISTINCT mpg.group_id), '{}') INTO v_managed
  FROM membership_plan_groups mpg
  JOIN membership_plans mp ON mp.id = mpg.plan_id
  WHERE mp.box_id = v_box;

  -- Ajout aux groupes de la formule
  UPDATE message_groups
  SET members = (SELECT array_agg(DISTINCT e) FROM unnest(members || v_member) e)
  WHERE id = ANY(v_target)
    AND NOT (v_member = ANY(members));

  -- Retrait des groupes gérés non couverts par la formule
  UPDATE message_groups
  SET members = array_remove(members, v_member)
  WHERE id = ANY(v_managed)
    AND NOT (id = ANY(v_target))
    AND v_member = ANY(members);

  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."tournament_wods_set_season"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_season int;
BEGIN
  IF NEW.season_number IS NULL OR NEW.season_number = 1 THEN
    SELECT COALESCE(current_season, 1) INTO v_season
    FROM public.tournaments WHERE id = NEW.tournament_id;
    NEW.season_number := COALESCE(v_season, 1);
  END IF;
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."trg_recalc_division_points"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tournament_id uuid;
BEGIN
  v_tournament_id := COALESCE(NEW.tournament_id, OLD.tournament_id);
  IF v_tournament_id IS NOT NULL THEN
    PERFORM public.recalc_division_points(v_tournament_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;




CREATE OR REPLACE FUNCTION "public"."update_box_member_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = NEW.box_id AND status = 'active'
    ) WHERE id = NEW.box_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = OLD.box_id AND status = 'active'
    ) WHERE id = OLD.box_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = NEW.box_id AND status = 'active'
    ) WHERE id = NEW.box_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;




CREATE OR REPLACE FUNCTION "public"."update_box_subscription_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."update_elo_after_match"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  w_elo integer;
  l_elo integer;
  elo_result record;
  loser_id uuid;
begin
  if new.status = 'completed' and new.winner_id is not null and old.status != 'completed' then
    if new.winner_id = new.athlete1_id then
      loser_id := new.athlete2_id;
    else
      loser_id := new.athlete1_id;
    end if;

    select COALESCE(elo, 1000) into w_elo from profiles where id = new.winner_id;
    select COALESCE(elo, 1000) into l_elo from profiles where id = loser_id;

    select * into elo_result from calculate_elo(w_elo, l_elo);

    update profiles set
      elo = GREATEST(100, elo_result.new_winner_elo),
      wins = wins + 1,
      total_matches = total_matches + 1
    where id = new.winner_id;

    update profiles set
      elo = GREATEST(100, elo_result.new_loser_elo),
      losses = losses + 1,
      total_matches = total_matches + 1
    where id = loser_id;

    update matches set elo_change = elo_result.elo_change where id = new.id;
  end if;
  return new;
end;
$$;




CREATE OR REPLACE FUNCTION "public"."update_inter_competitions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;




CREATE OR REPLACE FUNCTION "public"."update_user_elo"("p_user_id" "uuid", "p_new_elo" integer, "p_increment_matches" integer DEFAULT 1, "p_increment_wins" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE profiles
  SET
    elo           = p_new_elo,
    total_matches = total_matches + p_increment_matches,
    wins          = wins + p_increment_wins
  WHERE id = p_user_id;
END;
$$;



SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_changelog" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "type" "text" DEFAULT 'update'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "app_changelog_type_check" CHECK (("type" = ANY (ARRAY['fix'::"text", 'feature'::"text", 'update'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."appointment_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "box_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "followup_id" "uuid",
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_bookings_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'cancelled'::"text", 'done'::"text", 'no_show'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."athlete_badges" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "athlete_id" "uuid",
    "badge_key" "text" NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."athlete_streaks" (
    "athlete_id" "uuid" NOT NULL,
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "week_session_count" integer DEFAULT 0 NOT NULL,
    "week_start" "date" DEFAULT ("date_trunc"('week'::"text", "now"()))::"date" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."badges_catalog" (
    "badge_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" DEFAULT '🏅'::"text" NOT NULL,
    "category" "text" DEFAULT 'activity'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_appointment_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "capacity" smallint DEFAULT 1 NOT NULL,
    "coach" "text",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "box_appointment_slots_capacity_check" CHECK (("capacity" > 0)),
    CONSTRAINT "box_appointment_slots_check" CHECK (("ends_at" > "starts_at"))
);




CREATE TABLE IF NOT EXISTS "public"."box_article_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_article_likes" (
    "article_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "uploaded_by" "uuid",
    "title" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_size" bigint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."box_elo" (
    "member_id" "uuid" NOT NULL,
    "box_id" "uuid" NOT NULL,
    "elo" integer DEFAULT 1000 NOT NULL,
    "matches" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "elo_before" integer DEFAULT 1000 NOT NULL,
    "elo_after" integer DEFAULT 1000 NOT NULL,
    "elo_delta" integer DEFAULT 0 NOT NULL,
    "rank" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "member_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text",
    "plan_id" "uuid",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "subscription_status" "text",
    "stripe_subscription_id" "text",
    "stripe_checkout_session_id" "text",
    "subscription_current_period_end" timestamp with time zone,
    "amount_cents" integer,
    "platform_fee_cents" integer,
    "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "commitment_end_date" timestamp with time zone,
    "subscription_paused" boolean DEFAULT false NOT NULL,
    "pause_started_at" timestamp with time zone,
    "pause_resumes_at" timestamp with time zone,
    "payment_method_type" "text",
    "past_due_since" timestamp with time zone,
    "dunning_attempts" integer DEFAULT 0 NOT NULL,
    "last_payment_error" "text",
    "dunning_reminders_sent" integer DEFAULT 0 NOT NULL,
    "dunning_last_reminder_at" timestamp with time zone,
    CONSTRAINT "box_members_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'coach'::"text", 'owner'::"text"]))),
    CONSTRAINT "box_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'banned'::"text", 'inactive'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."box_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "title" "text",
    "body" "text" NOT NULL,
    "type" "text" DEFAULT 'info'::"text",
    "target_group_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."box_notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "target" "text" DEFAULT 'all'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."box_programming" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "publisher_box_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "discipline" "text",
    "level" "text",
    "days_per_week" smallint,
    "weeks_count" smallint DEFAULT 1 NOT NULL,
    "billing" "text" DEFAULT 'free'::"text" NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'eur'::"text" NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "box_programming_billing_check" CHECK (("billing" = ANY (ARRAY['free'::"text", 'one_time'::"text", 'monthly'::"text"]))),
    CONSTRAINT "box_programming_days_per_week_check" CHECK ((("days_per_week" IS NULL) OR (("days_per_week" >= 1) AND ("days_per_week" <= 7)))),
    CONSTRAINT "box_programming_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "box_programming_weeks_count_check" CHECK ((("weeks_count" >= 1) AND ("weeks_count" <= 52)))
);




CREATE TABLE IF NOT EXISTS "public"."box_programming_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programming_id" "uuid" NOT NULL,
    "subscriber_box_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "week_anchor" "date" DEFAULT (((("now"() AT TIME ZONE 'Europe/Paris'::"text"))::"date" - (EXTRACT(isodow FROM ("now"() AT TIME ZONE 'Europe/Paris'::"text")))::integer) + 1) NOT NULL,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "current_period_end" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "box_programming_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'past_due'::"text", 'expired'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."box_programming_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "programming_id" "uuid" NOT NULL,
    "week_number" smallint DEFAULT 1 NOT NULL,
    "day_of_week" smallint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "wod_type" "text",
    "time_cap_seconds" integer,
    "rounds" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "box_programming_wods_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7))),
    CONSTRAINT "box_programming_wods_week_number_check" CHECK ((("week_number" >= 1) AND ("week_number" <= 52)))
);




CREATE TABLE IF NOT EXISTS "public"."box_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "plan_tier" "text" DEFAULT 'trial'::"text" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "is_early_adopter" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "box_subscriptions_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['trial'::"text", 'complete'::"text"]))),
    CONSTRAINT "box_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."box_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "wod_type" "text",
    "scheduled_date" "date" NOT NULL,
    "time_cap_seconds" integer,
    "rounds" integer,
    "notes" "text",
    "is_published" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "block" "text",
    "block_name" "text",
    "leaderboard_enabled" boolean DEFAULT true NOT NULL,
    "publish_at" timestamp with time zone,
    "video_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "emom_interval_minutes" smallint,
    "tabata_work_seconds" smallint,
    "tabata_rest_seconds" smallint,
    "source_programming_id" "uuid",
    "source_programming_wod_id" "uuid",
    CONSTRAINT "box_wods_emom_interval_check" CHECK ((("emom_interval_minutes" IS NULL) OR (("emom_interval_minutes" >= 1) AND ("emom_interval_minutes" <= 5)))),
    CONSTRAINT "box_wods_tabata_rest_check" CHECK ((("tabata_rest_seconds" IS NULL) OR (("tabata_rest_seconds" >= 0) AND ("tabata_rest_seconds" <= 300)))),
    CONSTRAINT "box_wods_tabata_work_check" CHECK ((("tabata_work_seconds" IS NULL) OR (("tabata_work_seconds" >= 5) AND ("tabata_work_seconds" <= 300))))
);




COMMENT ON COLUMN "public"."box_wods"."emom_interval_minutes" IS 'EMOM interval in minutes (1=EMOM, 2=E2MOM, 3=E3MOM, 4=E4MOM, 5=E5MOM).';



COMMENT ON COLUMN "public"."box_wods"."tabata_work_seconds" IS 'Tabata work phase duration in seconds.';



COMMENT ON COLUMN "public"."box_wods"."tabata_rest_seconds" IS 'Tabata rest phase duration in seconds.';



CREATE TABLE IF NOT EXISTS "public"."boxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "invite_code" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "daily_publish_hour" integer DEFAULT 6,
    "weekly_publish_day" integer DEFAULT 0,
    "weekly_publish_hour" integer DEFAULT 18,
    "address" "text",
    "website_url" "text",
    "contact_email" "text",
    "phone" "text",
    "google_maps_url" "text",
    "founded_at" "date",
    "city" "text",
    "postal_code" "text",
    "country" "text" DEFAULT 'FR'::"text",
    "latitude" double precision,
    "longitude" double precision,
    "sport_type" "text"[] DEFAULT '{}'::"text"[],
    "services" "text"[] DEFAULT '{}'::"text"[],
    "cover_url" "text",
    "instagram_url" "text",
    "is_listed" boolean DEFAULT true,
    "tagline" "text",
    "opening_hours" "jsonb",
    "member_count" integer DEFAULT 0,
    "slug" "text",
    "stripe_account_id" "text",
    "stripe_onboarding_complete" boolean DEFAULT false,
    "allowed_tournament_formats" "text"[] DEFAULT ARRAY['simple'::"text"] NOT NULL,
    "terms_pdf_url" "text",
    "dunning_grace_days" integer DEFAULT 7 NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."changelog_reads" (
    "user_id" "uuid" NOT NULL,
    "changelog_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."class_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid",
    "member_id" "uuid",
    "box_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "attended" boolean,
    "credit_id" "uuid",
    CONSTRAINT "class_reservations_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'waiting'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."class_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "coach" "text",
    "scheduled_date" "date" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "max_capacity" integer DEFAULT 15 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."competition_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "member_id" "uuid",
    "team_name" "text",
    "registered_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'registered'::"text",
    CONSTRAINT "competition_participants_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'waitlist'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."competition_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "wod_id" "uuid",
    "member_id" "uuid",
    "score_value" numeric NOT NULL,
    "rank" integer,
    "points" integer,
    "submitted_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "format" "text",
    "scoring_type" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "max_participants" integer,
    "cover_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "competitions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'ongoing'::"text", 'finished'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."daily_tournament_elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "elo_before" integer DEFAULT 1000 NOT NULL,
    "elo_after" integer DEFAULT 1000 NOT NULL,
    "elo_delta" integer DEFAULT 0 NOT NULL,
    "final_rank" integer DEFAULT 1 NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."daily_tournament_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."daily_tournament_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score_value" numeric NOT NULL,
    "rx" boolean DEFAULT true,
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "video_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "contested_by" "uuid",
    "contest_reason" "text"
);




CREATE TABLE IF NOT EXISTS "public"."daily_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid",
    "wod_name" "text" NOT NULL,
    "wod_type" "text" NOT NULL,
    "duration" integer DEFAULT 0 NOT NULL,
    "level" "text" DEFAULT 'rx'::"text" NOT NULL,
    "movements" "text" NOT NULL,
    "scoring" "text",
    "score_mode" "text" DEFAULT 'time'::"text" NOT NULL,
    "max_players" integer DEFAULT 5 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "elo_reward" integer DEFAULT 25 NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone DEFAULT ("now"() + '12:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "gender_target" "text" DEFAULT 'mix'::"text",
    "is_official" boolean DEFAULT false NOT NULL,
    "official_date" "date",
    CONSTRAINT "daily_tournaments_gender_target_check" CHECK (("gender_target" = ANY (ARRAY['male'::"text", 'female'::"text", 'mix'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "elo_before" integer DEFAULT 1000 NOT NULL,
    "elo_after" integer DEFAULT 1000 NOT NULL,
    "elo_delta" integer DEFAULT 0 NOT NULL,
    "rank" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "member_id" "uuid",
    "registered_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'registered'::"text",
    CONSTRAINT "event_registrations_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'waitlist'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "event_date" timestamp with time zone NOT NULL,
    "location" "text",
    "max_participants" integer,
    "registration_deadline" timestamp with time zone,
    "is_competition" boolean DEFAULT false,
    "cover_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "addressee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_check" CHECK (("requester_id" <> "addressee_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."generated_wod_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score_type" "text" DEFAULT 'time'::"text" NOT NULL,
    "score_value" numeric NOT NULL,
    "rx" boolean DEFAULT true,
    "notes" "text",
    "completed_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."generated_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sport" "text" DEFAULT 'functional'::"text" NOT NULL,
    "wod_name" "text" NOT NULL,
    "wod_type" "text" NOT NULL,
    "duration" integer DEFAULT 0 NOT NULL,
    "level" "text" DEFAULT 'rx'::"text" NOT NULL,
    "format" "text" DEFAULT 'Solo'::"text" NOT NULL,
    "movements" "text" NOT NULL,
    "scoring" "text",
    "coach_tip" "text",
    "team_note" "text",
    "equipment" "text"[] DEFAULT '{}'::"text"[],
    "is_favorite" boolean DEFAULT false,
    "is_benchmark" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."group_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "attachment_url" "text"
);




CREATE TABLE IF NOT EXISTS "public"."inter_bracket_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "match_number" integer NOT NULL,
    "side" "text" DEFAULT 'winner'::"text" NOT NULL,
    "participant1_id" "uuid",
    "participant2_id" "uuid",
    "winner_id" "uuid",
    "loser_id" "uuid",
    "wod_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inter_bracket_matches_side_check" CHECK (("side" = ANY (ARRAY['winner'::"text", 'loser'::"text", 'grand_final'::"text"]))),
    CONSTRAINT "inter_bracket_matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text", 'bye'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_competition_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "order_index" integer DEFAULT 1 NOT NULL,
    "time_cap" integer,
    "scoring_type" "text" DEFAULT 'reps'::"text",
    "revealed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_competition_wods_scoring_type_check" CHECK (("scoring_type" = ANY (ARRAY['reps'::"text", 'time'::"text", 'weight'::"text", 'rounds_reps'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "format" "text" DEFAULT 'league'::"text" NOT NULL,
    "type" "text" DEFAULT 'individual'::"text" NOT NULL,
    "team_size" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "registration_open_at" timestamp with time zone,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "max_participants" integer,
    "banner_url" "text",
    "rules" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_competitions_format_check" CHECK (("format" = ANY (ARRAY['league'::"text", 'bracket'::"text", 'pool'::"text", 'swiss'::"text"]))),
    CONSTRAINT "inter_competitions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'active'::"text", 'closed'::"text"]))),
    CONSTRAINT "inter_competitions_team_size_check" CHECK ((("team_size" >= 1) AND ("team_size" <= 5))),
    CONSTRAINT "inter_competitions_type_check" CHECK (("type" = ANY (ARRAY['individual'::"text", 'team'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "final_rank" integer NOT NULL,
    "participants_count" integer NOT NULL,
    "avg_opponent_elo" integer NOT NULL,
    "elo_before" integer NOT NULL,
    "elo_after" integer NOT NULL,
    "elo_change" integer NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."inter_league_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "title" "text",
    "wod_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inter_league_rounds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_league_standings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "total_points" numeric DEFAULT 0 NOT NULL,
    "rounds_played" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "podiums" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."inter_pool_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "group_name" "text" NOT NULL,
    "group_index" integer NOT NULL,
    "advance_count" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."inter_pool_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "athlete1_id" "uuid" NOT NULL,
    "athlete2_id" "uuid" NOT NULL,
    "wod_id" "uuid",
    "score1" numeric,
    "score2" numeric,
    "winner_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inter_pool_matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_pool_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "draws" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "score_for" numeric DEFAULT 0 NOT NULL,
    "score_against" numeric DEFAULT 0 NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."inter_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "athlete_id" "uuid",
    "team_id" "uuid",
    "box_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_registrations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disqualified'::"text", 'withdrawn'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "wod_id" "uuid",
    "athlete_id" "uuid",
    "team_id" "uuid",
    "score_value" numeric,
    "score_display" "text",
    "video_url" "text",
    "video_local_uri" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_scores_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'validated'::"text", 'rejected'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "level" "text" DEFAULT 'scaled'::"text" NOT NULL,
    "role" "text" DEFAULT 'athlete'::"text" NOT NULL,
    "elo" integer DEFAULT 1000 NOT NULL,
    "total_matches" integer DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "full_name" "text",
    "bio" "text",
    "referral_code" "text" DEFAULT "upper"("substring"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 6)),
    "referred_by" "uuid",
    "personal_records" "jsonb" DEFAULT '{}'::"jsonb",
    "gender" "text",
    "total_scores_submitted" integer DEFAULT 0 NOT NULL,
    "total_wods_generated" integer DEFAULT 0 NOT NULL,
    "total_timer_sessions" integer DEFAULT 0 NOT NULL,
    "total_messages_sent" integer DEFAULT 0 NOT NULL,
    "total_tournaments" integer DEFAULT 0 NOT NULL,
    "total_tournament_wins" integer DEFAULT 0 NOT NULL,
    "total_friends" integer DEFAULT 0 NOT NULL,
    "featured_badges" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_level_check" CHECK (("level" = ANY (ARRAY['scaled'::"text", 'inter'::"text", 'rx'::"text", 'rx+'::"text", 'elite'::"text", 'pro'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'box_owner'::"text", 'member'::"text", 'athlete'::"text", 'admin'::"text"])))
);




CREATE OR REPLACE VIEW "public"."inter_standings" AS
 SELECT "s"."competition_id",
    "s"."wod_id",
    "s"."athlete_id",
    "s"."team_id",
    "p"."username",
    "p"."level",
    "b"."name" AS "box_name",
    "s"."score_value",
    "s"."score_display",
    "s"."status",
    "s"."submitted_at",
    "w"."scoring_type",
    "rank"() OVER (PARTITION BY "s"."competition_id", "s"."wod_id" ORDER BY
        CASE
            WHEN ("w"."scoring_type" = 'time'::"text") THEN "s"."score_value"
            ELSE (- "s"."score_value")
        END) AS "rank"
   FROM ((("public"."inter_scores" "s"
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "s"."athlete_id")))
     LEFT JOIN "public"."inter_competition_wods" "w" ON (("w"."id" = "s"."wod_id")))
     LEFT JOIN "public"."boxes" "b" ON (("b"."id" = ( SELECT "inter_registrations"."box_id"
           FROM "public"."inter_registrations"
          WHERE (("inter_registrations"."competition_id" = "s"."competition_id") AND ("inter_registrations"."athlete_id" = "s"."athlete_id"))
         LIMIT 1))))
  WHERE ("s"."status" = 'validated'::"text");




CREATE TABLE IF NOT EXISTS "public"."inter_swiss_pairings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "athlete1_id" "uuid",
    "athlete2_id" "uuid",
    "wod_id" "uuid",
    "score1" numeric,
    "score2" numeric,
    "winner_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_swiss_pairings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text", 'bye'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_swiss_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "round_number" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    CONSTRAINT "inter_swiss_rounds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_swiss_standings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "points" numeric DEFAULT 0 NOT NULL,
    "buchholz" numeric DEFAULT 0 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "draws" integer DEFAULT 0 NOT NULL,
    "losses" integer DEFAULT 0 NOT NULL,
    "rounds_played" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."inter_team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "answered_at" timestamp with time zone,
    CONSTRAINT "inter_team_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."inter_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid",
    "name" "text" NOT NULL,
    "captain_id" "uuid",
    "box_id" "uuid",
    "status" "text" DEFAULT 'forming'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inter_teams_status_check" CHECK (("status" = ANY (ARRAY['forming'::"text", 'ready'::"text", 'disqualified'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "athlete1_id" "uuid",
    "athlete2_id" "uuid",
    "wod_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "winner_id" "uuid",
    "athlete1_score" numeric,
    "athlete2_score" numeric,
    "athlete1_video_url" "text",
    "athlete2_video_url" "text",
    "athlete1_validated" boolean DEFAULT false,
    "athlete2_validated" boolean DEFAULT false,
    "elo_change" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."matchmaking_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "elo" integer NOT NULL,
    "level" "text" NOT NULL,
    "match_id" "uuid",
    "opponent_username" "text",
    "opponent_elo" integer,
    "opponent_level" "text",
    "wod_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."member_class_credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "credits_total" integer NOT NULL,
    "credits_used" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "stripe_checkout_session_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payment_intent" "text",
    CONSTRAINT "member_class_credits_credits_total_check" CHECK (("credits_total" > 0)),
    CONSTRAINT "member_class_credits_credits_used_check" CHECK (("credits_used" >= 0)),
    CONSTRAINT "member_class_credits_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'exhausted'::"text", 'refunded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."membership_cancellation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "reason_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "message" "text",
    "document_path" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "review_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_cancellation_requests_reason_type_check" CHECK (("reason_type" = ANY (ARRAY['moving'::"text", 'medical'::"text", 'other'::"text"]))),
    CONSTRAINT "membership_cancellation_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."membership_plan_groups" (
    "plan_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."membership_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "max_sessions_per_week" integer,
    "color" "text" DEFAULT '#C9A227'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "price_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'eur'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "stripe_product_id" "text",
    "stripe_price_id" "text",
    "plan_type" "text" DEFAULT 'subscription'::"text" NOT NULL,
    "credits" integer,
    "validity_days" integer,
    "commitment_months" integer DEFAULT 0 NOT NULL,
    "terms" "text",
    CONSTRAINT "membership_plans_commitment_months_nonneg" CHECK (("commitment_months" >= 0)),
    CONSTRAINT "membership_plans_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['subscription'::"text", 'drop_in'::"text", 'pack'::"text"])))
);




COMMENT ON COLUMN "public"."membership_plans"."commitment_months" IS 'Durée d''engagement minimale en mois (0 = sans engagement).';



COMMENT ON COLUMN "public"."membership_plans"."terms" IS 'Conditions / mentions contractuelles affichées à la souscription.';



CREATE TABLE IF NOT EXISTS "public"."membership_promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "percent_off" numeric,
    "amount_off_cents" integer,
    "currency" "text" DEFAULT 'eur'::"text" NOT NULL,
    "duration" "text" DEFAULT 'once'::"text" NOT NULL,
    "duration_in_months" integer,
    "max_redemptions" integer,
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "stripe_coupon_id" "text",
    "stripe_promotion_code_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_promo_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'amount'::"text"]))),
    CONSTRAINT "membership_promo_codes_duration_check" CHECK (("duration" = ANY (ARRAY['once'::"text", 'repeating'::"text", 'forever'::"text"]))),
    CONSTRAINT "promo_amount_valid" CHECK ((("discount_type" <> 'amount'::"text") OR (("amount_off_cents" IS NOT NULL) AND ("amount_off_cents" > 0)))),
    CONSTRAINT "promo_max_redemptions_valid" CHECK ((("max_redemptions" IS NULL) OR ("max_redemptions" > 0))),
    CONSTRAINT "promo_percent_valid" CHECK ((("discount_type" <> 'percent'::"text") OR (("percent_off" IS NOT NULL) AND ("percent_off" > (0)::numeric) AND ("percent_off" <= (100)::numeric)))),
    CONSTRAINT "promo_repeating_valid" CHECK ((("duration" <> 'repeating'::"text") OR (("duration_in_months" IS NOT NULL) AND ("duration_in_months" > 0))))
);




CREATE TABLE IF NOT EXISTS "public"."message_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "members" "uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "color" "text" DEFAULT '#6366F1'::"text",
    "wod_visibility_mode" "text" DEFAULT 'weekly'::"text" NOT NULL,
    CONSTRAINT "message_groups_wod_visibility_mode_check" CHECK (("wod_visibility_mode" = ANY (ARRAY['daily'::"text", 'weekly'::"text"])))
);




CREATE OR REPLACE VIEW "public"."message_group_members" AS
 SELECT "mg"."id" AS "group_id",
    "m"."m" AS "member_id",
    "mg"."box_id"
   FROM "public"."message_groups" "mg",
    LATERAL "unnest"("mg"."members") "m"("m");




CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text",
    "member_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."message_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_message_id" "uuid",
    "box_id" "uuid",
    "sender_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "group_id" "uuid",
    "content" "text" NOT NULL,
    "message_type" "text",
    "is_announcement" boolean DEFAULT false,
    "attachment_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_by" "uuid"[] DEFAULT '{}'::"uuid"[],
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['general'::"text", 'group'::"text", 'direct'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."mini_tournaments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "level" "text" NOT NULL,
    "max_participants" integer DEFAULT 5 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "wod_id" "uuid",
    "created_by" "uuid",
    "day" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mini_tournaments_level_check" CHECK (("level" = ANY (ARRAY['scaled'::"text", 'inter'::"text", 'rx'::"text", 'rx+'::"text", 'gx'::"text", 'pro'::"text"]))),
    CONSTRAINT "mini_tournaments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."movement_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "movement" "text" NOT NULL,
    "total_reps" integer DEFAULT 0 NOT NULL,
    "weight_kg" numeric,
    "source_type" "text" DEFAULT 'wod'::"text" NOT NULL,
    "source_id" "uuid",
    "logged_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."movement_rep_counts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "movement_key" "text" NOT NULL,
    "movement_label" "text" NOT NULL,
    "total_reps" integer DEFAULT 0 NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE OR REPLACE VIEW "public"."movement_totals" AS
 SELECT "user_id",
    "movement",
    "sum"("total_reps") AS "lifetime_reps"
   FROM "public"."movement_logs"
  GROUP BY "user_id", "movement";




CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "daily_reminder" boolean DEFAULT true,
    "reminder_hour" integer DEFAULT 9,
    "friend_requests" boolean DEFAULT true,
    "tournament_updates" boolean DEFAULT true,
    "score_updates" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "score_comments" boolean DEFAULT true,
    "score_reactions" boolean DEFAULT true
);




CREATE TABLE IF NOT EXISTS "public"."owner_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "plan_tier" "text" DEFAULT 'multi'::"text" NOT NULL,
    "box_quota" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "owner_subscriptions_plan_tier_check" CHECK (("plan_tier" = ANY (ARRAY['solo'::"text", 'multi'::"text"]))),
    CONSTRAINT "owner_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "description" "text",
    "website_url" "text",
    "instagram_url" "text",
    "offer_title" "text",
    "offer_description" "text",
    "offer_code" "text",
    "category" "text" DEFAULT 'other'::"text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "partners_category_check" CHECK (("category" = ANY (ARRAY['nutrition'::"text", 'equipment'::"text", 'apparel'::"text", 'supplements'::"text", 'recovery'::"text", 'coaching'::"text", 'software'::"text", 'other'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."personal_records" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "athlete_id" "uuid",
    "movement" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."physical_competitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "date" "text",
    "location" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "mode" "text" DEFAULT 'qualification'::"text" NOT NULL,
    "logo_url" "text",
    "registration_url" "text",
    "format" "text" DEFAULT 'individual'::"text",
    "price" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "start_date" "text",
    "end_date" "text",
    "start_time" "text",
    "end_time" "text",
    "team_size" integer,
    "has_individual" boolean DEFAULT false,
    "has_team" boolean DEFAULT false,
    "individual_genders" "jsonb" DEFAULT '[]'::"jsonb",
    "team_genders" "jsonb" DEFAULT '[]'::"jsonb",
    "team_sizes" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "physical_competitions_format_check" CHECK (("format" = ANY (ARRAY['individual'::"text", 'team'::"text", 'both'::"text"]))),
    CONSTRAINT "physical_competitions_mode_check" CHECK (("mode" = ANY (ARRAY['qualification'::"text", 'info'::"text"]))),
    CONSTRAINT "physical_competitions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'closed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."physical_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "timer_type" "text" DEFAULT 'for-time'::"text" NOT NULL,
    "total_seconds" integer DEFAULT 900 NOT NULL,
    "max_time" integer DEFAULT 0,
    "interval_seconds" integer DEFAULT 0,
    "rounds" integer DEFAULT 3,
    "work_time" integer DEFAULT 40,
    "rest_time" integer DEFAULT 20,
    "with_camera" boolean DEFAULT true,
    "order_index" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."program_affiliates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "category" "text" DEFAULT 'functional'::"text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."program_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "stripe_payment_intent" "text",
    "amount_cents" integer,
    "platform_fee_cents" integer,
    "status" "text" DEFAULT 'active'::"text",
    "purchased_at" timestamp with time zone DEFAULT "now"(),
    "stripe_subscription_id" "text",
    "stripe_checkout_session_id" "text",
    CONSTRAINT "program_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'expired'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."program_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_wod_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "score_type" "text" DEFAULT 'reps'::"text" NOT NULL,
    "score_value" integer NOT NULL,
    "rx" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."program_wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "day_number" integer,
    "scheduled_date" "date",
    "week_number" integer,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "wod_type" "text" DEFAULT 'custom'::"text",
    "scoring_type" "text",
    "time_cap_seconds" integer,
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "day_or_date" CHECK ((("day_number" IS NOT NULL) OR ("scheduled_date" IS NOT NULL)))
);




CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "price_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'eur'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "duration_weeks" integer,
    "days_per_week" integer DEFAULT 5,
    "invite_code" "text" NOT NULL,
    "stripe_price_id" "text",
    "image_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_product_id" "text",
    CONSTRAINT "programs_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "programs_type_check" CHECK (("type" = ANY (ARRAY['fixed'::"text", 'ongoing'::"text"])))
);




CREATE OR REPLACE VIEW "public"."public_leaderboard" WITH ("security_invoker"='true') AS
 SELECT "id",
    "username",
    "avatar_url",
    "level",
    "elo",
    "role",
    "wins",
    "losses",
    "total_matches"
   FROM "public"."profiles"
  WHERE ("role" = 'member'::"text");




CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid",
    "content_type" "text" NOT NULL,
    "content_id" "uuid",
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "admin_notes" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reports_content_type_check" CHECK (("content_type" = ANY (ARRAY['video'::"text", 'message'::"text", 'profile'::"text", 'comment'::"text", 'score'::"text", 'box'::"text"]))),
    CONSTRAINT "reports_reason_check" CHECK (("reason" = ANY (ARRAY['spam'::"text", 'harassment'::"text", 'inappropriate'::"text", 'hate'::"text", 'cheating'::"text", 'nudity'::"text", 'violence'::"text", 'other'::"text"]))),
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."schedule_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "coach" "text",
    "day_of_week" integer NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "max_capacity" integer DEFAULT 15 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "schedule_templates_day_of_week_check" CHECK ((("day_of_week" >= 1) AND ("day_of_week" <= 7)))
);




CREATE TABLE IF NOT EXISTS "public"."score_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "score_id" "uuid",
    "box_id" "uuid",
    "author_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."score_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "score_id" "uuid",
    "user_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."scores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "wod_id" "uuid",
    "match_id" "uuid",
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "video_url" "text",
    "validated" boolean DEFAULT false,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scores_unit_check" CHECK (("unit" = ANY (ARRAY['reps'::"text", 'time'::"text", 'kg'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."session_followups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "schedule_id" "uuid",
    "reservation_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rating" smallint,
    "feedback_comment" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "converted_plan_id" "uuid",
    "reminder_h_sent" boolean DEFAULT false NOT NULL,
    "reminder_d1_sent" boolean DEFAULT false NOT NULL,
    "reminder_d3_sent" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_followups_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "session_followups_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'responded'::"text", 'meeting_booked'::"text", 'offer_sent'::"text", 'converted'::"text", 'lost'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."support_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['requester'::"text", 'admin'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "type" "text" DEFAULT 'question'::"text" NOT NULL,
    "subject" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_unread" boolean DEFAULT true NOT NULL,
    "requester_unread" boolean DEFAULT false NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'answered'::"text", 'resolved'::"text"]))),
    CONSTRAINT "support_tickets_type_check" CHECK (("type" = ANY (ARRAY['question'::"text", 'bug'::"text", 'improvement'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournament_bracket_matches" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "match_number" integer NOT NULL,
    "side" "text" DEFAULT 'winner'::"text" NOT NULL,
    "participant1_id" "uuid",
    "participant2_id" "uuid",
    "winner_id" "uuid",
    "loser_id" "uuid",
    "wod_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_bracket_matches_side_check" CHECK (("side" = ANY (ARRAY['winner'::"text", 'loser'::"text", 'grand_final'::"text"]))),
    CONSTRAINT "tournament_bracket_matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'completed'::"text", 'bye'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournament_division_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "division_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "points" numeric DEFAULT 0 NOT NULL,
    "rank" integer,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."tournament_divisions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "level" integer NOT NULL,
    "max_members" integer DEFAULT 16 NOT NULL,
    "promote_count" integer DEFAULT 0 NOT NULL,
    "relegate_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."tournament_elo_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "final_rank" integer NOT NULL,
    "participants_count" integer NOT NULL,
    "avg_opponent_elo" integer NOT NULL,
    "elo_before" integer NOT NULL,
    "elo_after" integer NOT NULL,
    "elo_change" integer NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."tournament_match_elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "opponent_id" "uuid",
    "result" "text" NOT NULL,
    "elo_before" integer NOT NULL,
    "elo_after" integer NOT NULL,
    "elo_delta" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_match_elo_history_result_check" CHECK (("result" = ANY (ARRAY['win'::"text", 'loss'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournament_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "score" integer DEFAULT 0,
    "registered_at" timestamp with time zone DEFAULT "now"()
);




CREATE TABLE IF NOT EXISTS "public"."tournament_scores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "tournament_wod_id" "uuid" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "score_value" "text" NOT NULL,
    "tiebreak_value" numeric,
    "video_url" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deadline_at" timestamp with time zone,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone,
    "ai_analysis" "text",
    "elo_points" integer DEFAULT 0 NOT NULL,
    "admin_message" "text",
    CONSTRAINT "tournament_scores_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'validated'::"text", 'rejected'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournament_season_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "season_number" integer NOT NULL,
    "division_id" "uuid",
    "division_level" integer NOT NULL,
    "division_name" "text" NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "final_rank" integer NOT NULL,
    "final_points" numeric DEFAULT 0 NOT NULL,
    "outcome" "text" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_season_history_outcome_check" CHECK (("outcome" = ANY (ARRAY['champion'::"text", 'promoted'::"text", 'relegated'::"text", 'stayed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournament_wod_elo_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_wod_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "division_id" "uuid",
    "athlete_id" "uuid" NOT NULL,
    "elo_before" integer NOT NULL,
    "elo_after" integer NOT NULL,
    "elo_delta" integer NOT NULL,
    "rank" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."tournament_wods" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 10 NOT NULL,
    "movements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "scoring" "text" DEFAULT 'Voir description'::"text" NOT NULL,
    "deadline_hours" integer DEFAULT 24 NOT NULL,
    "opens_at" timestamp with time zone,
    "closes_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timer_type" "text" DEFAULT 'stopwatch'::"text",
    "time_cap_seconds" integer,
    "rounds" integer,
    "work_seconds" integer DEFAULT 20,
    "rest_seconds" integer DEFAULT 10,
    "division_id" "uuid",
    "season_number" integer DEFAULT 1 NOT NULL,
    "bracket_stage" integer,
    "reps_per_round" integer,
    CONSTRAINT "tournament_wods_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'closed'::"text"]))),
    CONSTRAINT "tournament_wods_type_check" CHECK (("type" = ANY (ARRAY['AMRAP'::"text", 'For Time'::"text", 'EMOM'::"text", 'Tabata'::"text", 'Max Reps'::"text", 'Strength'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "max_participants" integer DEFAULT 16 NOT NULL,
    "level" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "prize" "text",
    "start_date" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "box_id" "uuid",
    "end_date" "date",
    "rules" "text",
    "gender_target" "text" DEFAULT 'mix'::"text",
    "banner_url" "text",
    "format" "text" DEFAULT 'simple'::"text" NOT NULL,
    "require_video_proof" boolean DEFAULT false NOT NULL,
    "final_wod_pool" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "current_season" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "tournaments_format_check" CHECK (("format" = ANY (ARRAY['simple'::"text", 'bracket'::"text", 'swiss'::"text", 'league_div'::"text"]))),
    CONSTRAINT "tournaments_gender_target_check" CHECK (("gender_target" = ANY (ARRAY['male'::"text", 'female'::"text", 'mix'::"text"]))),
    CONSTRAINT "tournaments_level_check" CHECK (("level" = ANY (ARRAY['scaled'::"text", 'inter'::"text", 'rx'::"text", 'rx+'::"text", 'gx'::"text", 'pro'::"text"]))),
    CONSTRAINT "tournaments_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'active'::"text", 'completed'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);




CREATE TABLE IF NOT EXISTS "public"."user_generation_settings" (
    "user_id" "uuid" NOT NULL,
    "goal" "text" DEFAULT 'balanced'::"text" NOT NULL,
    "level_adjust" numeric DEFAULT 0 NOT NULL,
    "avoid_zones" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gym_declaration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_params" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_generation_settings_goal_check" CHECK (("goal" = ANY (ARRAY['balanced'::"text", 'progress'::"text", 'race'::"text"]))),
    CONSTRAINT "user_generation_settings_level_adjust_check" CHECK ((("level_adjust" >= '-0.10'::numeric) AND ("level_adjust" <= 0.10)))
);




CREATE TABLE IF NOT EXISTS "public"."user_movement_prefs" (
    "user_id" "uuid" NOT NULL,
    "movement" "text" NOT NULL,
    "score" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_movement_prefs_score_check" CHECK ((("score" >= ('-1'::integer)::numeric) AND ("score" <= (1)::numeric)))
);




CREATE TABLE IF NOT EXISTS "public"."user_movement_stats" (
    "user_id" "uuid" NOT NULL,
    "movement" "text" NOT NULL,
    "total_reps" bigint DEFAULT 0 NOT NULL,
    "best_weight" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."user_races" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "race_date" "date" NOT NULL,
    "format" "text" DEFAULT 'Solo'::"text" NOT NULL,
    "category" "text" DEFAULT 'Men'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_races_category_check" CHECK (("category" = ANY (ARRAY['Women'::"text", 'Women Pro'::"text", 'Men'::"text", 'Men Pro'::"text"]))),
    CONSTRAINT "user_races_format_check" CHECK (("format" = ANY (ARRAY['Solo'::"text", 'Doubles'::"text", 'Relais'::"text", 'Mixed Relais'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."user_wod_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "seed" bigint NOT NULL,
    "signature" "text" NOT NULL,
    "movements" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text",
    "rpe" "text",
    "rank" integer,
    "is_challenge" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_wod_feedback_action_check" CHECK (("action" = ANY (ARRAY['shown'::"text", 'chosen'::"text", 'skipped'::"text", 'completed'::"text"]))),
    CONSTRAINT "user_wod_feedback_rpe_check" CHECK (("rpe" = ANY (ARRAY['easy'::"text", 'perfect'::"text", 'hard'::"text"]))),
    CONSTRAINT "user_wod_feedback_sport_check" CHECK (("sport" = ANY (ARRAY['functional'::"text", 'hybrid'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."wod_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "box_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."wod_group_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."wod_program_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL
);




CREATE TABLE IF NOT EXISTS "public"."wod_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid",
    "member_id" "uuid",
    "box_id" "uuid",
    "score_type" "text",
    "score_value" numeric NOT NULL,
    "rx" boolean DEFAULT true,
    "scaled" boolean DEFAULT false,
    "notes" "text",
    "video_url" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wod_scores_score_type_check" CHECK (("score_type" = ANY (ARRAY['time'::"text", 'reps'::"text", 'weight'::"text", 'rounds'::"text"])))
);




CREATE TABLE IF NOT EXISTS "public"."wods" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 5 NOT NULL,
    "level" "text" NOT NULL,
    "movements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "equipment" "text"[] DEFAULT '{}'::"text"[],
    "scoring" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wods_level_check" CHECK (("level" = ANY (ARRAY['scaled'::"text", 'inter'::"text", 'rx'::"text", 'rx+'::"text", 'gx'::"text", 'pro'::"text"]))),
    CONSTRAINT "wods_type_check" CHECK (("type" = ANY (ARRAY['AMRAP'::"text", 'For Time'::"text", 'EMOM'::"text", 'Tabata'::"text", 'Max Reps'::"text"])))
);




ALTER TABLE ONLY "public"."app_changelog"
    ADD CONSTRAINT "app_changelog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_slot_id_member_id_key" UNIQUE ("slot_id", "member_id");



ALTER TABLE ONLY "public"."athlete_badges"
    ADD CONSTRAINT "athlete_badges_athlete_id_badge_key_key" UNIQUE ("athlete_id", "badge_key");



ALTER TABLE ONLY "public"."athlete_badges"
    ADD CONSTRAINT "athlete_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_streaks"
    ADD CONSTRAINT "athlete_streaks_pkey" PRIMARY KEY ("athlete_id");



ALTER TABLE ONLY "public"."badges_catalog"
    ADD CONSTRAINT "badges_catalog_pkey" PRIMARY KEY ("badge_key");



ALTER TABLE ONLY "public"."box_appointment_slots"
    ADD CONSTRAINT "box_appointment_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_article_comments"
    ADD CONSTRAINT "box_article_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_article_likes"
    ADD CONSTRAINT "box_article_likes_pkey" PRIMARY KEY ("article_id", "user_id");



ALTER TABLE ONLY "public"."box_articles"
    ADD CONSTRAINT "box_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_documents"
    ADD CONSTRAINT "box_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_elo_history"
    ADD CONSTRAINT "box_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_elo_history"
    ADD CONSTRAINT "box_elo_history_wod_id_member_id_key" UNIQUE ("wod_id", "member_id");



ALTER TABLE ONLY "public"."box_elo"
    ADD CONSTRAINT "box_elo_pkey" PRIMARY KEY ("member_id", "box_id");



ALTER TABLE ONLY "public"."box_members"
    ADD CONSTRAINT "box_members_box_id_member_id_key" UNIQUE ("box_id", "member_id");



ALTER TABLE ONLY "public"."box_members"
    ADD CONSTRAINT "box_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_messages"
    ADD CONSTRAINT "box_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_notifications"
    ADD CONSTRAINT "box_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_programming"
    ADD CONSTRAINT "box_programming_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_programming_subscriptions"
    ADD CONSTRAINT "box_programming_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_programming_subscriptions"
    ADD CONSTRAINT "box_programming_subscriptions_programming_id_subscriber_box_key" UNIQUE ("programming_id", "subscriber_box_id");



ALTER TABLE ONLY "public"."box_programming_wods"
    ADD CONSTRAINT "box_programming_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_subscriptions"
    ADD CONSTRAINT "box_subscriptions_box_id_key" UNIQUE ("box_id");



ALTER TABLE ONLY "public"."box_subscriptions"
    ADD CONSTRAINT "box_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_wods"
    ADD CONSTRAINT "box_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boxes"
    ADD CONSTRAINT "boxes_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."boxes"
    ADD CONSTRAINT "boxes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."boxes"
    ADD CONSTRAINT "boxes_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."changelog_reads"
    ADD CONSTRAINT "changelog_reads_pkey" PRIMARY KEY ("user_id", "changelog_id");



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_schedule_id_member_id_key" UNIQUE ("schedule_id", "member_id");



ALTER TABLE ONLY "public"."class_schedules"
    ADD CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_competition_id_member_id_key" UNIQUE ("competition_id", "member_id");



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competition_scores"
    ADD CONSTRAINT "competition_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tournament_elo_history"
    ADD CONSTRAINT "daily_tournament_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tournament_elo_history"
    ADD CONSTRAINT "daily_tournament_elo_history_tournament_id_user_id_key" UNIQUE ("tournament_id", "user_id");



ALTER TABLE ONLY "public"."daily_tournament_participants"
    ADD CONSTRAINT "daily_tournament_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tournament_participants"
    ADD CONSTRAINT "daily_tournament_participants_tournament_id_user_id_key" UNIQUE ("tournament_id", "user_id");



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_tournament_id_user_id_key" UNIQUE ("tournament_id", "user_id");



ALTER TABLE ONLY "public"."daily_tournaments"
    ADD CONSTRAINT "daily_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."elo_history"
    ADD CONSTRAINT "elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."elo_history"
    ADD CONSTRAINT "elo_history_wod_id_member_id_key" UNIQUE ("wod_id", "member_id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_member_id_key" UNIQUE ("event_id", "member_id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_sender_id_receiver_id_key" UNIQUE ("sender_id", "receiver_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_addressee_id_key" UNIQUE ("requester_id", "addressee_id");



ALTER TABLE ONLY "public"."generated_wod_scores"
    ADD CONSTRAINT "generated_wod_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_wod_scores"
    ADD CONSTRAINT "generated_wod_scores_wod_id_user_id_completed_at_key" UNIQUE ("wod_id", "user_id", "completed_at");



ALTER TABLE ONLY "public"."generated_wods"
    ADD CONSTRAINT "generated_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_messages"
    ADD CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_competition_id_round_match_number_sid_key" UNIQUE ("competition_id", "round", "match_number", "side");



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_competition_wods"
    ADD CONSTRAINT "inter_competition_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_competitions"
    ADD CONSTRAINT "inter_competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_elo_history"
    ADD CONSTRAINT "inter_elo_history_competition_id_athlete_id_key" UNIQUE ("competition_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_elo_history"
    ADD CONSTRAINT "inter_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_league_rounds"
    ADD CONSTRAINT "inter_league_rounds_competition_id_round_number_key" UNIQUE ("competition_id", "round_number");



ALTER TABLE ONLY "public"."inter_league_rounds"
    ADD CONSTRAINT "inter_league_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_league_standings"
    ADD CONSTRAINT "inter_league_standings_competition_id_athlete_id_key" UNIQUE ("competition_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_league_standings"
    ADD CONSTRAINT "inter_league_standings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_pool_groups"
    ADD CONSTRAINT "inter_pool_groups_competition_id_group_index_key" UNIQUE ("competition_id", "group_index");



ALTER TABLE ONLY "public"."inter_pool_groups"
    ADD CONSTRAINT "inter_pool_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_group_id_athlete1_id_athlete2_id_key" UNIQUE ("group_id", "athlete1_id", "athlete2_id");



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_pool_members"
    ADD CONSTRAINT "inter_pool_members_group_id_athlete_id_key" UNIQUE ("group_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_pool_members"
    ADD CONSTRAINT "inter_pool_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_competition_id_athlete_id_key" UNIQUE ("competition_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_competition_id_team_id_key" UNIQUE ("competition_id", "team_id");



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_unique_athlete_wod" UNIQUE ("competition_id", "wod_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_round_id_athlete1_id_key" UNIQUE ("round_id", "athlete1_id");



ALTER TABLE ONLY "public"."inter_swiss_rounds"
    ADD CONSTRAINT "inter_swiss_rounds_competition_id_round_number_key" UNIQUE ("competition_id", "round_number");



ALTER TABLE ONLY "public"."inter_swiss_rounds"
    ADD CONSTRAINT "inter_swiss_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_swiss_standings"
    ADD CONSTRAINT "inter_swiss_standings_competition_id_athlete_id_key" UNIQUE ("competition_id", "athlete_id");



ALTER TABLE ONLY "public"."inter_swiss_standings"
    ADD CONSTRAINT "inter_swiss_standings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_team_members"
    ADD CONSTRAINT "inter_team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inter_team_members"
    ADD CONSTRAINT "inter_team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."inter_teams"
    ADD CONSTRAINT "inter_teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."member_class_credits"
    ADD CONSTRAINT "member_class_credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_cancellation_requests"
    ADD CONSTRAINT "membership_cancellation_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_plan_groups"
    ADD CONSTRAINT "membership_plan_groups_pkey" PRIMARY KEY ("plan_id", "group_id");



ALTER TABLE ONLY "public"."membership_plans"
    ADD CONSTRAINT "membership_plans_box_id_name_key" UNIQUE ("box_id", "name");



ALTER TABLE ONLY "public"."membership_plans"
    ADD CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_promo_codes"
    ADD CONSTRAINT "membership_promo_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_groups"
    ADD CONSTRAINT "message_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_member_id_emoji_key" UNIQUE ("message_id", "member_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_replies"
    ADD CONSTRAINT "message_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mini_tournaments"
    ADD CONSTRAINT "mini_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_logs"
    ADD CONSTRAINT "movement_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_rep_counts"
    ADD CONSTRAINT "movement_rep_counts_athlete_id_movement_key_key" UNIQUE ("athlete_id", "movement_key");



ALTER TABLE ONLY "public"."movement_rep_counts"
    ADD CONSTRAINT "movement_rep_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."owner_subscriptions"
    ADD CONSTRAINT "owner_subscriptions_owner_id_key" UNIQUE ("owner_id");



ALTER TABLE ONLY "public"."owner_subscriptions"
    ADD CONSTRAINT "owner_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partners"
    ADD CONSTRAINT "partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_records"
    ADD CONSTRAINT "personal_records_athlete_id_movement_key" UNIQUE ("athlete_id", "movement");



ALTER TABLE ONLY "public"."personal_records"
    ADD CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physical_competitions"
    ADD CONSTRAINT "physical_competitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physical_wods"
    ADD CONSTRAINT "physical_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."program_affiliates"
    ADD CONSTRAINT "program_affiliates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_members"
    ADD CONSTRAINT "program_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_members"
    ADD CONSTRAINT "program_members_program_id_user_id_key" UNIQUE ("program_id", "user_id");



ALTER TABLE ONLY "public"."program_scores"
    ADD CONSTRAINT "program_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_scores"
    ADD CONSTRAINT "program_scores_program_wod_id_user_id_key" UNIQUE ("program_wod_id", "user_id");



ALTER TABLE ONLY "public"."program_wods"
    ADD CONSTRAINT "program_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."score_comments"
    ADD CONSTRAINT "score_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."score_reactions"
    ADD CONSTRAINT "score_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."score_reactions"
    ADD CONSTRAINT "score_reactions_score_id_user_id_emoji_key" UNIQUE ("score_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_box_id_member_id_key" UNIQUE ("box_id", "member_id");



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_admins"
    ADD CONSTRAINT "support_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_tournament_id_round_match_number_key" UNIQUE ("tournament_id", "round", "match_number", "side");



ALTER TABLE ONLY "public"."tournament_division_members"
    ADD CONSTRAINT "tournament_division_members_division_id_athlete_id_key" UNIQUE ("division_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_division_members"
    ADD CONSTRAINT "tournament_division_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_divisions"
    ADD CONSTRAINT "tournament_divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_divisions"
    ADD CONSTRAINT "tournament_divisions_tournament_id_level_key" UNIQUE ("tournament_id", "level");



ALTER TABLE ONLY "public"."tournament_elo_history"
    ADD CONSTRAINT "tournament_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_elo_history"
    ADD CONSTRAINT "tournament_elo_history_tournament_id_athlete_id_key" UNIQUE ("tournament_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_match_elo_history"
    ADD CONSTRAINT "tournament_match_elo_history_match_id_athlete_id_key" UNIQUE ("match_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_match_elo_history"
    ADD CONSTRAINT "tournament_match_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_participants"
    ADD CONSTRAINT "tournament_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_participants"
    ADD CONSTRAINT "tournament_participants_tournament_id_athlete_id_key" UNIQUE ("tournament_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_tournament_wod_id_athlete_id_key" UNIQUE ("tournament_wod_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_season_history"
    ADD CONSTRAINT "tournament_season_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_season_history"
    ADD CONSTRAINT "tournament_season_history_tournament_id_season_number_athle_key" UNIQUE ("tournament_id", "season_number", "athlete_id");



ALTER TABLE ONLY "public"."tournament_wod_elo_history"
    ADD CONSTRAINT "tournament_wod_elo_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_wod_elo_history"
    ADD CONSTRAINT "tournament_wod_elo_history_tournament_wod_id_athlete_id_key" UNIQUE ("tournament_wod_id", "athlete_id");



ALTER TABLE ONLY "public"."tournament_wods"
    ADD CONSTRAINT "tournament_wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_generation_settings"
    ADD CONSTRAINT "user_generation_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_movement_prefs"
    ADD CONSTRAINT "user_movement_prefs_pkey" PRIMARY KEY ("user_id", "movement");



ALTER TABLE ONLY "public"."user_movement_stats"
    ADD CONSTRAINT "user_movement_stats_pkey" PRIMARY KEY ("user_id", "movement");



ALTER TABLE ONLY "public"."user_races"
    ADD CONSTRAINT "user_races_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_wod_feedback"
    ADD CONSTRAINT "user_wod_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_completions"
    ADD CONSTRAINT "wod_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_completions"
    ADD CONSTRAINT "wod_completions_wod_id_member_id_key" UNIQUE ("wod_id", "member_id");



ALTER TABLE ONLY "public"."wod_group_access"
    ADD CONSTRAINT "wod_group_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_group_access"
    ADD CONSTRAINT "wod_group_access_wod_id_group_id_key" UNIQUE ("wod_id", "group_id");



ALTER TABLE ONLY "public"."wod_program_access"
    ADD CONSTRAINT "wod_program_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_program_access"
    ADD CONSTRAINT "wod_program_access_wod_id_program_id_key" UNIQUE ("wod_id", "program_id");



ALTER TABLE ONLY "public"."wod_scores"
    ADD CONSTRAINT "wod_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_scores"
    ADD CONSTRAINT "wod_scores_wod_id_member_id_key" UNIQUE ("wod_id", "member_id");



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_pkey" PRIMARY KEY ("id");



CREATE INDEX "box_members_past_due_since_idx" ON "public"."box_members" USING "btree" ("box_id", "past_due_since") WHERE ("past_due_since" IS NOT NULL);



CREATE INDEX "idx_affiliates_active_order" ON "public"."program_affiliates" USING "btree" ("is_active", "sort_order");



CREATE INDEX "idx_app_changelog_created_by" ON "public"."app_changelog" USING "btree" ("created_by");



CREATE INDEX "idx_appointment_bookings_box" ON "public"."appointment_bookings" USING "btree" ("box_id", "status");



CREATE INDEX "idx_appointment_bookings_slot" ON "public"."appointment_bookings" USING "btree" ("slot_id");



CREATE INDEX "idx_appointment_slots_box_time" ON "public"."box_appointment_slots" USING "btree" ("box_id", "starts_at");



CREATE INDEX "idx_article_comments" ON "public"."box_article_comments" USING "btree" ("article_id", "created_at");



CREATE INDEX "idx_article_likes" ON "public"."box_article_likes" USING "btree" ("article_id");



CREATE INDEX "idx_articles_box" ON "public"."box_articles" USING "btree" ("box_id", "created_at" DESC);



CREATE INDEX "idx_athlete_badges_athlete_id" ON "public"."athlete_badges" USING "btree" ("athlete_id");



CREATE INDEX "idx_athlete_badges_key" ON "public"."athlete_badges" USING "btree" ("badge_key");



CREATE INDEX "idx_box_article_comments_user_id" ON "public"."box_article_comments" USING "btree" ("user_id");



CREATE INDEX "idx_box_article_likes_user_id" ON "public"."box_article_likes" USING "btree" ("user_id");



CREATE INDEX "idx_box_articles_author_id" ON "public"."box_articles" USING "btree" ("author_id");



CREATE INDEX "idx_box_documents_box" ON "public"."box_documents" USING "btree" ("box_id");



CREATE INDEX "idx_box_documents_user" ON "public"."box_documents" USING "btree" ("uploaded_by");



CREATE INDEX "idx_box_elo_box" ON "public"."box_elo" USING "btree" ("box_id", "elo" DESC);



CREATE INDEX "idx_box_elo_history_box" ON "public"."box_elo_history" USING "btree" ("box_id", "created_at" DESC);



CREATE INDEX "idx_box_elo_history_member" ON "public"."box_elo_history" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "idx_box_members_member_id" ON "public"."box_members" USING "btree" ("member_id");



CREATE INDEX "idx_box_members_plan_id" ON "public"."box_members" USING "btree" ("plan_id");



CREATE INDEX "idx_box_members_stripe_sub" ON "public"."box_members" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_box_messages_box_id" ON "public"."box_messages" USING "btree" ("box_id");



CREATE INDEX "idx_box_messages_target_group_id" ON "public"."box_messages" USING "btree" ("target_group_id");



CREATE INDEX "idx_box_notifications_created_by" ON "public"."box_notifications" USING "btree" ("created_by");



CREATE INDEX "idx_box_notifs_box" ON "public"."box_notifications" USING "btree" ("box_id", "created_at" DESC);



CREATE INDEX "idx_box_prog_subs_prog" ON "public"."box_programming_subscriptions" USING "btree" ("programming_id", "status");



CREATE INDEX "idx_box_prog_subs_subscriber" ON "public"."box_programming_subscriptions" USING "btree" ("subscriber_box_id", "status");



CREATE INDEX "idx_box_programming_catalogue" ON "public"."box_programming" USING "btree" ("is_published", "discipline", "level");



CREATE INDEX "idx_box_programming_publisher" ON "public"."box_programming" USING "btree" ("publisher_box_id");



CREATE INDEX "idx_box_programming_wods_prog" ON "public"."box_programming_wods" USING "btree" ("programming_id", "week_number", "day_of_week", "sort_order");



CREATE INDEX "idx_box_subscriptions_box_id" ON "public"."box_subscriptions" USING "btree" ("box_id");



CREATE INDEX "idx_box_subscriptions_status" ON "public"."box_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_box_subscriptions_stripe_customer" ON "public"."box_subscriptions" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_box_wods_block" ON "public"."box_wods" USING "btree" ("box_id", "scheduled_date", "block_name");



CREATE INDEX "idx_box_wods_created_by" ON "public"."box_wods" USING "btree" ("created_by");



CREATE INDEX "idx_boxes_city" ON "public"."boxes" USING "btree" ("city");



CREATE INDEX "idx_boxes_is_listed" ON "public"."boxes" USING "btree" ("is_listed") WHERE ("is_listed" = true);



CREATE INDEX "idx_boxes_owner_id" ON "public"."boxes" USING "btree" ("owner_id");



CREATE INDEX "idx_boxes_slug" ON "public"."boxes" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_boxes_sport_type" ON "public"."boxes" USING "gin" ("sport_type");



CREATE INDEX "idx_cancel_req_box" ON "public"."membership_cancellation_requests" USING "btree" ("box_id");



CREATE INDEX "idx_cancel_req_member" ON "public"."membership_cancellation_requests" USING "btree" ("member_id");



CREATE INDEX "idx_changelog_created_at" ON "public"."app_changelog" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_changelog_reads_changelog_id" ON "public"."changelog_reads" USING "btree" ("changelog_id");



CREATE INDEX "idx_changelog_reads_user" ON "public"."changelog_reads" USING "btree" ("user_id");



CREATE INDEX "idx_class_reservations_box_id" ON "public"."class_reservations" USING "btree" ("box_id");



CREATE INDEX "idx_class_reservations_credit_id" ON "public"."class_reservations" USING "btree" ("credit_id");



CREATE INDEX "idx_class_reservations_member_id" ON "public"."class_reservations" USING "btree" ("member_id");



CREATE INDEX "idx_class_schedules_box_id" ON "public"."class_schedules" USING "btree" ("box_id");



CREATE INDEX "idx_competition_participants_member_id" ON "public"."competition_participants" USING "btree" ("member_id");



CREATE INDEX "idx_competition_scores_competition_id" ON "public"."competition_scores" USING "btree" ("competition_id");



CREATE INDEX "idx_competition_scores_member_id" ON "public"."competition_scores" USING "btree" ("member_id");



CREATE INDEX "idx_competition_scores_wod_id" ON "public"."competition_scores" USING "btree" ("wod_id");



CREATE INDEX "idx_competitions_box_id" ON "public"."competitions" USING "btree" ("box_id");



CREATE INDEX "idx_competitions_created_by" ON "public"."competitions" USING "btree" ("created_by");



CREATE INDEX "idx_daily_t_creator" ON "public"."daily_tournaments" USING "btree" ("creator_id");



CREATE INDEX "idx_daily_t_ends" ON "public"."daily_tournaments" USING "btree" ("ends_at");



CREATE INDEX "idx_daily_t_official" ON "public"."daily_tournaments" USING "btree" ("is_official", "status");



CREATE INDEX "idx_daily_t_status" ON "public"."daily_tournaments" USING "btree" ("status");



CREATE INDEX "idx_daily_tourn_elo_tourn" ON "public"."daily_tournament_elo_history" USING "btree" ("tournament_id");



CREATE INDEX "idx_daily_tourn_elo_user" ON "public"."daily_tournament_elo_history" USING "btree" ("user_id", "calculated_at" DESC);



CREATE INDEX "idx_daily_tournament_scores_contested_by" ON "public"."daily_tournament_scores" USING "btree" ("contested_by");



CREATE INDEX "idx_daily_tournament_scores_user_id" ON "public"."daily_tournament_scores" USING "btree" ("user_id");



CREATE INDEX "idx_dtp_tournament" ON "public"."daily_tournament_participants" USING "btree" ("tournament_id");



CREATE INDEX "idx_dtp_user" ON "public"."daily_tournament_participants" USING "btree" ("user_id");



CREATE INDEX "idx_dts_tournament" ON "public"."daily_tournament_scores" USING "btree" ("tournament_id");



CREATE INDEX "idx_elo_history_box_id" ON "public"."elo_history" USING "btree" ("box_id");



CREATE INDEX "idx_elo_history_member" ON "public"."elo_history" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "idx_elo_history_tournament_id" ON "public"."tournament_elo_history" USING "btree" ("tournament_id");



CREATE INDEX "idx_elo_history_wod" ON "public"."elo_history" USING "btree" ("wod_id");



CREATE INDEX "idx_event_registrations_member_id" ON "public"."event_registrations" USING "btree" ("member_id");



CREATE INDEX "idx_events_box_id" ON "public"."events" USING "btree" ("box_id");



CREATE INDEX "idx_events_created_by" ON "public"."events" USING "btree" ("created_by");



CREATE INDEX "idx_friend_requests_receiver_id" ON "public"."friend_requests" USING "btree" ("receiver_id");



CREATE INDEX "idx_friendships_addressee_id" ON "public"."friendships" USING "btree" ("addressee_id");



CREATE INDEX "idx_gen_scores_date" ON "public"."generated_wod_scores" USING "btree" ("completed_at" DESC);



CREATE INDEX "idx_gen_scores_user" ON "public"."generated_wod_scores" USING "btree" ("user_id");



CREATE INDEX "idx_gen_scores_wod" ON "public"."generated_wod_scores" USING "btree" ("wod_id");



CREATE INDEX "idx_gen_wods_created" ON "public"."generated_wods" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_gen_wods_fav" ON "public"."generated_wods" USING "btree" ("user_id", "is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "idx_gen_wods_user" ON "public"."generated_wods" USING "btree" ("user_id");



CREATE INDEX "idx_group_messages_group_id" ON "public"."group_messages" USING "btree" ("group_id", "created_at");



CREATE INDEX "idx_ibm_competition" ON "public"."inter_bracket_matches" USING "btree" ("competition_id");



CREATE INDEX "idx_ibm_round" ON "public"."inter_bracket_matches" USING "btree" ("competition_id", "round");



CREATE INDEX "idx_ilr_comp" ON "public"."inter_league_rounds" USING "btree" ("competition_id");



CREATE INDEX "idx_ils_comp" ON "public"."inter_league_standings" USING "btree" ("competition_id", "total_points" DESC);



CREATE INDEX "idx_inter_bracket_matches_loser_id" ON "public"."inter_bracket_matches" USING "btree" ("loser_id");



CREATE INDEX "idx_inter_bracket_matches_participant1_id" ON "public"."inter_bracket_matches" USING "btree" ("participant1_id");



CREATE INDEX "idx_inter_bracket_matches_participant2_id" ON "public"."inter_bracket_matches" USING "btree" ("participant2_id");



CREATE INDEX "idx_inter_bracket_matches_winner_id" ON "public"."inter_bracket_matches" USING "btree" ("winner_id");



CREATE INDEX "idx_inter_bracket_matches_wod_id" ON "public"."inter_bracket_matches" USING "btree" ("wod_id");



CREATE INDEX "idx_inter_competition_wods_competition_id" ON "public"."inter_competition_wods" USING "btree" ("competition_id");



CREATE INDEX "idx_inter_competitions_created_by" ON "public"."inter_competitions" USING "btree" ("created_by");



CREATE INDEX "idx_inter_elo_history_athlete" ON "public"."inter_elo_history" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_elo_history_competition" ON "public"."inter_elo_history" USING "btree" ("competition_id");



CREATE INDEX "idx_inter_league_rounds_wod_id" ON "public"."inter_league_rounds" USING "btree" ("wod_id");



CREATE INDEX "idx_inter_league_standings_athlete_id" ON "public"."inter_league_standings" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_league_standings_team_id" ON "public"."inter_league_standings" USING "btree" ("team_id");



CREATE INDEX "idx_inter_pool_matches_athlete1_id" ON "public"."inter_pool_matches" USING "btree" ("athlete1_id");



CREATE INDEX "idx_inter_pool_matches_athlete2_id" ON "public"."inter_pool_matches" USING "btree" ("athlete2_id");



CREATE INDEX "idx_inter_pool_matches_winner_id" ON "public"."inter_pool_matches" USING "btree" ("winner_id");



CREATE INDEX "idx_inter_pool_matches_wod_id" ON "public"."inter_pool_matches" USING "btree" ("wod_id");



CREATE INDEX "idx_inter_pool_members_athlete_id" ON "public"."inter_pool_members" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_registrations_athlete_id" ON "public"."inter_registrations" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_registrations_box_id" ON "public"."inter_registrations" USING "btree" ("box_id");



CREATE INDEX "idx_inter_registrations_team_id" ON "public"."inter_registrations" USING "btree" ("team_id");



CREATE INDEX "idx_inter_scores_athlete_id" ON "public"."inter_scores" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_scores_reviewed_by" ON "public"."inter_scores" USING "btree" ("reviewed_by");



CREATE INDEX "idx_inter_scores_team_id" ON "public"."inter_scores" USING "btree" ("team_id");



CREATE INDEX "idx_inter_scores_wod_id" ON "public"."inter_scores" USING "btree" ("wod_id");



CREATE INDEX "idx_inter_swiss_pairings_athlete1_id" ON "public"."inter_swiss_pairings" USING "btree" ("athlete1_id");



CREATE INDEX "idx_inter_swiss_pairings_athlete2_id" ON "public"."inter_swiss_pairings" USING "btree" ("athlete2_id");



CREATE INDEX "idx_inter_swiss_pairings_competition_id" ON "public"."inter_swiss_pairings" USING "btree" ("competition_id");



CREATE INDEX "idx_inter_swiss_pairings_winner_id" ON "public"."inter_swiss_pairings" USING "btree" ("winner_id");



CREATE INDEX "idx_inter_swiss_pairings_wod_id" ON "public"."inter_swiss_pairings" USING "btree" ("wod_id");



CREATE INDEX "idx_inter_swiss_standings_athlete_id" ON "public"."inter_swiss_standings" USING "btree" ("athlete_id");



CREATE INDEX "idx_inter_team_members_user_id" ON "public"."inter_team_members" USING "btree" ("user_id");



CREATE INDEX "idx_inter_teams_box_id" ON "public"."inter_teams" USING "btree" ("box_id");



CREATE INDEX "idx_inter_teams_captain_id" ON "public"."inter_teams" USING "btree" ("captain_id");



CREATE INDEX "idx_inter_teams_competition_id" ON "public"."inter_teams" USING "btree" ("competition_id");



CREATE INDEX "idx_ipg_comp" ON "public"."inter_pool_groups" USING "btree" ("competition_id");



CREATE INDEX "idx_ipm_group" ON "public"."inter_pool_members" USING "btree" ("group_id", "points" DESC);



CREATE INDEX "idx_ipmat_comp" ON "public"."inter_pool_matches" USING "btree" ("competition_id");



CREATE INDEX "idx_ipmat_group" ON "public"."inter_pool_matches" USING "btree" ("group_id");



CREATE INDEX "idx_matches_athlete1_id" ON "public"."matches" USING "btree" ("athlete1_id");



CREATE INDEX "idx_matches_athlete2_id" ON "public"."matches" USING "btree" ("athlete2_id");



CREATE INDEX "idx_matches_winner_id" ON "public"."matches" USING "btree" ("winner_id");



CREATE INDEX "idx_matches_wod_id" ON "public"."matches" USING "btree" ("wod_id");



CREATE INDEX "idx_member_class_credits_box_id" ON "public"."member_class_credits" USING "btree" ("box_id");



CREATE INDEX "idx_member_class_credits_lookup" ON "public"."member_class_credits" USING "btree" ("member_id", "box_id", "status", "expires_at");



CREATE INDEX "idx_member_class_credits_payment_intent" ON "public"."member_class_credits" USING "btree" ("stripe_payment_intent") WHERE ("stripe_payment_intent" IS NOT NULL);



CREATE INDEX "idx_member_class_credits_plan_id" ON "public"."member_class_credits" USING "btree" ("plan_id");



CREATE INDEX "idx_membership_plan_groups_group_id" ON "public"."membership_plan_groups" USING "btree" ("group_id");



CREATE INDEX "idx_message_groups_box_id" ON "public"."message_groups" USING "btree" ("box_id");



CREATE INDEX "idx_message_groups_created_by" ON "public"."message_groups" USING "btree" ("created_by");



CREATE INDEX "idx_message_reactions_member_id" ON "public"."message_reactions" USING "btree" ("member_id");



CREATE INDEX "idx_message_replies_box_id" ON "public"."message_replies" USING "btree" ("box_id");



CREATE INDEX "idx_message_replies_parent_message_id" ON "public"."message_replies" USING "btree" ("parent_message_id");



CREATE INDEX "idx_message_replies_sender_id" ON "public"."message_replies" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_box_id" ON "public"."messages" USING "btree" ("box_id");



CREATE INDEX "idx_messages_group_id" ON "public"."messages" USING "btree" ("group_id");



CREATE INDEX "idx_messages_receiver_id" ON "public"."messages" USING "btree" ("receiver_id");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_mini_tournaments_created_by" ON "public"."mini_tournaments" USING "btree" ("created_by");



CREATE INDEX "idx_mini_tournaments_wod_id" ON "public"."mini_tournaments" USING "btree" ("wod_id");



CREATE INDEX "idx_movement_logs_movement" ON "public"."movement_logs" USING "btree" ("user_id", "movement");



CREATE INDEX "idx_movement_logs_user" ON "public"."movement_logs" USING "btree" ("user_id");



CREATE INDEX "idx_movement_reps_athlete_id" ON "public"."movement_rep_counts" USING "btree" ("athlete_id");



CREATE INDEX "idx_owner_subscriptions_customer" ON "public"."owner_subscriptions" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_owner_subscriptions_owner" ON "public"."owner_subscriptions" USING "btree" ("owner_id");



CREATE INDEX "idx_partners_active" ON "public"."partners" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_partners_category" ON "public"."partners" USING "btree" ("category");



CREATE INDEX "idx_physical_competitions_created_by" ON "public"."physical_competitions" USING "btree" ("created_by");



CREATE INDEX "idx_physical_wods_competition_id" ON "public"."physical_wods" USING "btree" ("competition_id");



CREATE INDEX "idx_pm_session" ON "public"."program_members" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "idx_pm_user" ON "public"."program_members" USING "btree" ("user_id", "status");



CREATE INDEX "idx_profiles_referred_by" ON "public"."profiles" USING "btree" ("referred_by");



CREATE INDEX "idx_program_scores_user_id" ON "public"."program_scores" USING "btree" ("user_id");



CREATE INDEX "idx_programs_box" ON "public"."programs" USING "btree" ("box_id", "is_active");



CREATE INDEX "idx_programs_code" ON "public"."programs" USING "btree" ("invite_code");



CREATE INDEX "idx_programs_owner_id" ON "public"."programs" USING "btree" ("owner_id");



CREATE INDEX "idx_promo_box" ON "public"."membership_promo_codes" USING "btree" ("box_id");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_pw_date" ON "public"."program_wods" USING "btree" ("program_id", "scheduled_date");



CREATE INDEX "idx_pw_prog" ON "public"."program_wods" USING "btree" ("program_id", "day_number");



CREATE INDEX "idx_reactions_message" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_reports_created" ON "public"."reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reports_reported_user" ON "public"."reports" USING "btree" ("reported_user_id");



CREATE INDEX "idx_reports_reporter" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "idx_reports_resolved_by" ON "public"."reports" USING "btree" ("resolved_by");



CREATE INDEX "idx_reports_status" ON "public"."reports" USING "btree" ("status");



CREATE INDEX "idx_reservations_schedule_attended" ON "public"."class_reservations" USING "btree" ("schedule_id", "attended");



CREATE INDEX "idx_schedule_templates_box_id" ON "public"."schedule_templates" USING "btree" ("box_id");



CREATE INDEX "idx_score_comments_author_id" ON "public"."score_comments" USING "btree" ("author_id");



CREATE INDEX "idx_score_comments_box_id" ON "public"."score_comments" USING "btree" ("box_id");



CREATE INDEX "idx_score_comments_score_id" ON "public"."score_comments" USING "btree" ("score_id");



CREATE INDEX "idx_score_reactions_user_id" ON "public"."score_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_scores_athlete_id" ON "public"."scores" USING "btree" ("athlete_id");



CREATE INDEX "idx_scores_match_id" ON "public"."scores" USING "btree" ("match_id");



CREATE INDEX "idx_scores_validated_by" ON "public"."scores" USING "btree" ("validated_by");



CREATE INDEX "idx_scores_wod_id" ON "public"."scores" USING "btree" ("wod_id");



CREATE INDEX "idx_session_followups_box_status" ON "public"."session_followups" USING "btree" ("box_id", "status");



CREATE INDEX "idx_session_followups_member" ON "public"."session_followups" USING "btree" ("member_id");



CREATE INDEX "idx_streaks_athlete" ON "public"."athlete_streaks" USING "btree" ("athlete_id");



CREATE INDEX "idx_support_messages_ticket" ON "public"."support_messages" USING "btree" ("ticket_id");



CREATE INDEX "idx_support_tickets_box_id" ON "public"."support_tickets" USING "btree" ("box_id");



CREATE INDEX "idx_support_tickets_creator" ON "public"."support_tickets" USING "btree" ("created_by");



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "idx_tbm_round" ON "public"."tournament_bracket_matches" USING "btree" ("tournament_id", "round");



CREATE INDEX "idx_tbm_tournament" ON "public"."tournament_bracket_matches" USING "btree" ("tournament_id");



CREATE INDEX "idx_td_tournament" ON "public"."tournament_divisions" USING "btree" ("tournament_id");



CREATE INDEX "idx_tdm_athlete" ON "public"."tournament_division_members" USING "btree" ("athlete_id");



CREATE INDEX "idx_tdm_division" ON "public"."tournament_division_members" USING "btree" ("division_id");



CREATE INDEX "idx_tmeh_athlete" ON "public"."tournament_match_elo_history" USING "btree" ("athlete_id");



CREATE INDEX "idx_tmeh_tournament" ON "public"."tournament_match_elo_history" USING "btree" ("tournament_id");



CREATE INDEX "idx_tournament_bracket_matches_loser_id" ON "public"."tournament_bracket_matches" USING "btree" ("loser_id");



CREATE INDEX "idx_tournament_bracket_matches_participant1_id" ON "public"."tournament_bracket_matches" USING "btree" ("participant1_id");



CREATE INDEX "idx_tournament_bracket_matches_participant2_id" ON "public"."tournament_bracket_matches" USING "btree" ("participant2_id");



CREATE INDEX "idx_tournament_bracket_matches_winner_id" ON "public"."tournament_bracket_matches" USING "btree" ("winner_id");



CREATE INDEX "idx_tournament_bracket_matches_wod_id" ON "public"."tournament_bracket_matches" USING "btree" ("wod_id");



CREATE INDEX "idx_tournament_elo_history_athlete_id" ON "public"."tournament_elo_history" USING "btree" ("athlete_id");



CREATE INDEX "idx_tournament_participants_athlete_id" ON "public"."tournament_participants" USING "btree" ("athlete_id");



CREATE INDEX "idx_tournament_scores_athlete_id" ON "public"."tournament_scores" USING "btree" ("athlete_id");



CREATE INDEX "idx_tournament_scores_status" ON "public"."tournament_scores" USING "btree" ("status");



CREATE INDEX "idx_tournament_scores_tournament_id" ON "public"."tournament_scores" USING "btree" ("tournament_id");



CREATE INDEX "idx_tournament_scores_validated_by" ON "public"."tournament_scores" USING "btree" ("validated_by");



CREATE INDEX "idx_tournament_scores_wod_id" ON "public"."tournament_scores" USING "btree" ("tournament_wod_id");



CREATE INDEX "idx_tournament_season_history_division_id" ON "public"."tournament_season_history" USING "btree" ("division_id");



CREATE INDEX "idx_tournament_wods_bracket_stage" ON "public"."tournament_wods" USING "btree" ("tournament_id", "bracket_stage");



CREATE INDEX "idx_tournament_wods_division" ON "public"."tournament_wods" USING "btree" ("division_id");



CREATE INDEX "idx_tournament_wods_tournament_id" ON "public"."tournament_wods" USING "btree" ("tournament_id");



CREATE INDEX "idx_tournaments_box_id" ON "public"."tournaments" USING "btree" ("box_id");



CREATE INDEX "idx_tournaments_created_by" ON "public"."tournaments" USING "btree" ("created_by");



CREATE INDEX "idx_tsh_athlete" ON "public"."tournament_season_history" USING "btree" ("athlete_id");



CREATE INDEX "idx_tsh_tournament" ON "public"."tournament_season_history" USING "btree" ("tournament_id", "season_number");



CREATE INDEX "idx_tweh_athlete" ON "public"."tournament_wod_elo_history" USING "btree" ("athlete_id");



CREATE INDEX "idx_tweh_tournament" ON "public"."tournament_wod_elo_history" USING "btree" ("tournament_id");



CREATE INDEX "idx_user_blocks_blocked" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_user_blocks_blocker" ON "public"."user_blocks" USING "btree" ("blocker_id");



CREATE INDEX "idx_wod_group_access_group" ON "public"."wod_group_access" USING "btree" ("group_id");



CREATE INDEX "idx_wod_group_access_wod" ON "public"."wod_group_access" USING "btree" ("wod_id");



CREATE INDEX "idx_wod_program_access_program" ON "public"."wod_program_access" USING "btree" ("program_id");



CREATE INDEX "idx_wod_program_access_wod" ON "public"."wod_program_access" USING "btree" ("wod_id");



CREATE INDEX "idx_wod_scores_box_id" ON "public"."wod_scores" USING "btree" ("box_id");



CREATE INDEX "idx_wod_scores_member_id" ON "public"."wod_scores" USING "btree" ("member_id");



CREATE INDEX "idx_wods_created_by" ON "public"."wods" USING "btree" ("created_by");



CREATE INDEX "tournament_wods_tid_season_idx" ON "public"."tournament_wods" USING "btree" ("tournament_id", "season_number");



CREATE UNIQUE INDEX "uniq_box_wods_from_programming" ON "public"."box_wods" USING "btree" ("box_id", "scheduled_date", "source_programming_wod_id") WHERE ("source_programming_wod_id" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_cancel_req_pending" ON "public"."membership_cancellation_requests" USING "btree" ("box_id", "member_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uniq_official_wod_per_day" ON "public"."daily_tournaments" USING "btree" ("official_date") WHERE "is_official";



CREATE UNIQUE INDEX "uniq_promo_code_per_box" ON "public"."membership_promo_codes" USING "btree" ("box_id", "upper"("code"));



CREATE UNIQUE INDEX "uq_member_class_credits_session" ON "public"."member_class_credits" USING "btree" ("stripe_checkout_session_id") WHERE ("stripe_checkout_session_id" IS NOT NULL);



CREATE INDEX "user_races_user_idx" ON "public"."user_races" USING "btree" ("user_id", "race_date");



CREATE INDEX "uwf_user_action_idx" ON "public"."user_wod_feedback" USING "btree" ("user_id", "action", "created_at" DESC);



CREATE INDEX "uwf_user_sig_idx" ON "public"."user_wod_feedback" USING "btree" ("user_id", "signature");



CREATE INDEX "wod_completions_box_id_idx" ON "public"."wod_completions" USING "btree" ("box_id");



CREATE INDEX "wod_completions_member_id_idx" ON "public"."wod_completions" USING "btree" ("member_id");



CREATE INDEX "wod_completions_wod_id_idx" ON "public"."wod_completions" USING "btree" ("wod_id");



CREATE OR REPLACE TRIGGER "on_match_completed" AFTER UPDATE ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."update_elo_after_match"();



CREATE OR REPLACE TRIGGER "trg_auto_assign_lowest_division" AFTER INSERT ON "public"."tournament_participants" FOR EACH ROW EXECUTE FUNCTION "public"."auto_assign_lowest_division"();



CREATE OR REPLACE TRIGGER "trg_box_member_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."box_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_box_member_count"();



CREATE OR REPLACE TRIGGER "trg_box_subscriptions_updated_at" BEFORE UPDATE ON "public"."box_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_box_subscription_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bracket_match_elo" AFTER INSERT OR UPDATE OF "winner_id", "status" ON "public"."tournament_bracket_matches" FOR EACH ROW EXECUTE FUNCTION "public"."apply_bracket_match_elo"();



CREATE OR REPLACE TRIGGER "trg_enforce_capacity" BEFORE INSERT OR UPDATE OF "status" ON "public"."class_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_reservation_capacity"();



CREATE OR REPLACE TRIGGER "trg_enforce_weekly_limit" BEFORE INSERT OR UPDATE OF "status" ON "public"."class_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_weekly_limit"();



CREATE OR REPLACE TRIGGER "trg_inter_competitions_updated_at" BEFORE UPDATE ON "public"."inter_competitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_inter_competitions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_message_group_members_delete" INSTEAD OF DELETE ON "public"."message_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."fn_message_group_members_delete"();



CREATE OR REPLACE TRIGGER "trg_message_group_members_insert" INSTEAD OF INSERT ON "public"."message_group_members" FOR EACH ROW EXECUTE FUNCTION "public"."fn_message_group_members_insert"();



CREATE OR REPLACE TRIGGER "trg_prevent_client_box_insert" BEFORE INSERT ON "public"."boxes" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_client_box_insert"();



CREATE OR REPLACE TRIGGER "trg_prevent_client_subscription_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."box_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_client_subscription_write"();



CREATE OR REPLACE TRIGGER "trg_prevent_role_escalation" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_escalation"();



CREATE OR REPLACE TRIGGER "trg_promote_waiting" AFTER DELETE ON "public"."class_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."promote_waiting_reservation"();



CREATE OR REPLACE TRIGGER "trg_recalc_division_points_on_scores" AFTER INSERT OR DELETE OR UPDATE OF "status", "score_value" ON "public"."tournament_scores" FOR EACH ROW EXECUTE FUNCTION "public"."trg_recalc_division_points"();



CREATE OR REPLACE TRIGGER "trg_refund_credit" BEFORE DELETE ON "public"."class_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."refund_credit_on_cancel"();



CREATE OR REPLACE TRIGGER "trg_release_reservations_on_revoke" AFTER DELETE OR UPDATE OF "status" ON "public"."box_members" FOR EACH ROW EXECUTE FUNCTION "public"."release_reservations_on_revoke"();



CREATE OR REPLACE TRIGGER "trg_support_touch_ticket" AFTER INSERT ON "public"."support_messages" FOR EACH ROW EXECUTE FUNCTION "public"."support_touch_ticket"();



CREATE OR REPLACE TRIGGER "trg_sync_member_plan_groups" AFTER INSERT OR UPDATE OF "plan_id" ON "public"."box_members" FOR EACH ROW EXECUTE FUNCTION "public"."sync_member_plan_groups"();



CREATE OR REPLACE TRIGGER "trg_tournament_wods_set_season" BEFORE INSERT ON "public"."tournament_wods" FOR EACH ROW EXECUTE FUNCTION "public"."tournament_wods_set_season"();



CREATE OR REPLACE TRIGGER "trg_zzz_consume_credit" BEFORE INSERT OR UPDATE OF "status" ON "public"."class_reservations" FOR EACH ROW EXECUTE FUNCTION "public"."consume_credit_on_reservation"();



ALTER TABLE ONLY "public"."app_changelog"
    ADD CONSTRAINT "app_changelog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_followup_id_fkey" FOREIGN KEY ("followup_id") REFERENCES "public"."session_followups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_bookings"
    ADD CONSTRAINT "appointment_bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."box_appointment_slots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_badges"
    ADD CONSTRAINT "athlete_badges_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_streaks"
    ADD CONSTRAINT "athlete_streaks_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_appointment_slots"
    ADD CONSTRAINT "box_appointment_slots_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_appointment_slots"
    ADD CONSTRAINT "box_appointment_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_article_comments"
    ADD CONSTRAINT "box_article_comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."box_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_article_comments"
    ADD CONSTRAINT "box_article_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_article_likes"
    ADD CONSTRAINT "box_article_likes_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."box_articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_article_likes"
    ADD CONSTRAINT "box_article_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_articles"
    ADD CONSTRAINT "box_articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_articles"
    ADD CONSTRAINT "box_articles_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_documents"
    ADD CONSTRAINT "box_documents_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_documents"
    ADD CONSTRAINT "box_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_elo"
    ADD CONSTRAINT "box_elo_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_elo_history"
    ADD CONSTRAINT "box_elo_history_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_elo_history"
    ADD CONSTRAINT "box_elo_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_elo_history"
    ADD CONSTRAINT "box_elo_history_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_elo"
    ADD CONSTRAINT "box_elo_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_members"
    ADD CONSTRAINT "box_members_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_members"
    ADD CONSTRAINT "box_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_members"
    ADD CONSTRAINT "box_members_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_messages"
    ADD CONSTRAINT "box_messages_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_messages"
    ADD CONSTRAINT "box_messages_target_group_id_fkey" FOREIGN KEY ("target_group_id") REFERENCES "public"."message_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_notifications"
    ADD CONSTRAINT "box_notifications_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_notifications"
    ADD CONSTRAINT "box_notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_programming"
    ADD CONSTRAINT "box_programming_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_programming"
    ADD CONSTRAINT "box_programming_publisher_box_id_fkey" FOREIGN KEY ("publisher_box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_programming_subscriptions"
    ADD CONSTRAINT "box_programming_subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_programming_subscriptions"
    ADD CONSTRAINT "box_programming_subscriptions_programming_id_fkey" FOREIGN KEY ("programming_id") REFERENCES "public"."box_programming"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_programming_subscriptions"
    ADD CONSTRAINT "box_programming_subscriptions_subscriber_box_id_fkey" FOREIGN KEY ("subscriber_box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_programming_wods"
    ADD CONSTRAINT "box_programming_wods_programming_id_fkey" FOREIGN KEY ("programming_id") REFERENCES "public"."box_programming"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_subscriptions"
    ADD CONSTRAINT "box_subscriptions_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_wods"
    ADD CONSTRAINT "box_wods_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_wods"
    ADD CONSTRAINT "box_wods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_wods"
    ADD CONSTRAINT "box_wods_source_programming_id_fkey" FOREIGN KEY ("source_programming_id") REFERENCES "public"."box_programming"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."box_wods"
    ADD CONSTRAINT "box_wods_source_programming_wod_id_fkey" FOREIGN KEY ("source_programming_wod_id") REFERENCES "public"."box_programming_wods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."boxes"
    ADD CONSTRAINT "boxes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."changelog_reads"
    ADD CONSTRAINT "changelog_reads_changelog_id_fkey" FOREIGN KEY ("changelog_id") REFERENCES "public"."app_changelog"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."changelog_reads"
    ADD CONSTRAINT "changelog_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."member_class_credits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_reservations"
    ADD CONSTRAINT "class_reservations_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."class_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_schedules"
    ADD CONSTRAINT "class_schedules_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_participants"
    ADD CONSTRAINT "competition_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_scores"
    ADD CONSTRAINT "competition_scores_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_scores"
    ADD CONSTRAINT "competition_scores_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competition_scores"
    ADD CONSTRAINT "competition_scores_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id");



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitions"
    ADD CONSTRAINT "competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_tournament_elo_history"
    ADD CONSTRAINT "daily_tournament_elo_history_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."daily_tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_elo_history"
    ADD CONSTRAINT "daily_tournament_elo_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_participants"
    ADD CONSTRAINT "daily_tournament_participants_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."daily_tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_participants"
    ADD CONSTRAINT "daily_tournament_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_participants"
    ADD CONSTRAINT "daily_tournament_participants_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_contested_by_fkey" FOREIGN KEY ("contested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."daily_tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournament_scores"
    ADD CONSTRAINT "daily_tournament_scores_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournaments"
    ADD CONSTRAINT "daily_tournaments_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_tournaments"
    ADD CONSTRAINT "daily_tournaments_creator_id_profiles_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."elo_history"
    ADD CONSTRAINT "elo_history_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."elo_history"
    ADD CONSTRAINT "elo_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."elo_history"
    ADD CONSTRAINT "elo_history_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_wod_scores"
    ADD CONSTRAINT "generated_wod_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_wod_scores"
    ADD CONSTRAINT "generated_wod_scores_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."generated_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_wods"
    ADD CONSTRAINT "generated_wods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_messages"
    ADD CONSTRAINT "group_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."message_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_loser_id_fkey" FOREIGN KEY ("loser_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_participant1_id_fkey" FOREIGN KEY ("participant1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_participant2_id_fkey" FOREIGN KEY ("participant2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_bracket_matches"
    ADD CONSTRAINT "inter_bracket_matches_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."inter_competition_wods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_competition_wods"
    ADD CONSTRAINT "inter_competition_wods_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_competitions"
    ADD CONSTRAINT "inter_competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_elo_history"
    ADD CONSTRAINT "inter_elo_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_elo_history"
    ADD CONSTRAINT "inter_elo_history_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_league_rounds"
    ADD CONSTRAINT "inter_league_rounds_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_league_rounds"
    ADD CONSTRAINT "inter_league_rounds_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."inter_competition_wods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_league_standings"
    ADD CONSTRAINT "inter_league_standings_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_league_standings"
    ADD CONSTRAINT "inter_league_standings_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_league_standings"
    ADD CONSTRAINT "inter_league_standings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."inter_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_groups"
    ADD CONSTRAINT "inter_pool_groups_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_athlete1_id_fkey" FOREIGN KEY ("athlete1_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_athlete2_id_fkey" FOREIGN KEY ("athlete2_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."inter_pool_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_pool_matches"
    ADD CONSTRAINT "inter_pool_matches_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."inter_competition_wods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_pool_members"
    ADD CONSTRAINT "inter_pool_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_pool_members"
    ADD CONSTRAINT "inter_pool_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."inter_pool_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_registrations"
    ADD CONSTRAINT "inter_registrations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."inter_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."inter_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_scores"
    ADD CONSTRAINT "inter_scores_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."inter_competition_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_athlete1_id_fkey" FOREIGN KEY ("athlete1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_athlete2_id_fkey" FOREIGN KEY ("athlete2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."inter_swiss_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_swiss_pairings"
    ADD CONSTRAINT "inter_swiss_pairings_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."inter_competition_wods"("id");



ALTER TABLE ONLY "public"."inter_swiss_rounds"
    ADD CONSTRAINT "inter_swiss_rounds_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_swiss_standings"
    ADD CONSTRAINT "inter_swiss_standings_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_swiss_standings"
    ADD CONSTRAINT "inter_swiss_standings_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_team_members"
    ADD CONSTRAINT "inter_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."inter_teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_team_members"
    ADD CONSTRAINT "inter_team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_teams"
    ADD CONSTRAINT "inter_teams_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inter_teams"
    ADD CONSTRAINT "inter_teams_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inter_teams"
    ADD CONSTRAINT "inter_teams_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."inter_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_athlete1_id_fkey" FOREIGN KEY ("athlete1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_athlete2_id_fkey" FOREIGN KEY ("athlete2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id");



ALTER TABLE ONLY "public"."matchmaking_queue"
    ADD CONSTRAINT "matchmaking_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_class_credits"
    ADD CONSTRAINT "member_class_credits_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_class_credits"
    ADD CONSTRAINT "member_class_credits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_class_credits"
    ADD CONSTRAINT "member_class_credits_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."membership_cancellation_requests"
    ADD CONSTRAINT "membership_cancellation_requests_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_cancellation_requests"
    ADD CONSTRAINT "membership_cancellation_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_cancellation_requests"
    ADD CONSTRAINT "membership_cancellation_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."membership_plan_groups"
    ADD CONSTRAINT "membership_plan_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."message_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_plan_groups"
    ADD CONSTRAINT "membership_plan_groups_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_plans"
    ADD CONSTRAINT "membership_plans_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."membership_promo_codes"
    ADD CONSTRAINT "membership_promo_codes_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_groups"
    ADD CONSTRAINT "message_groups_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_groups"
    ADD CONSTRAINT "message_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_replies"
    ADD CONSTRAINT "message_replies_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id");



ALTER TABLE ONLY "public"."message_replies"
    ADD CONSTRAINT "message_replies_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_replies"
    ADD CONSTRAINT "message_replies_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."message_groups"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mini_tournaments"
    ADD CONSTRAINT "mini_tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mini_tournaments"
    ADD CONSTRAINT "mini_tournaments_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id");



ALTER TABLE ONLY "public"."movement_logs"
    ADD CONSTRAINT "movement_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_rep_counts"
    ADD CONSTRAINT "movement_rep_counts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_subscriptions"
    ADD CONSTRAINT "owner_subscriptions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_records"
    ADD CONSTRAINT "personal_records_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."physical_competitions"
    ADD CONSTRAINT "physical_competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."physical_wods"
    ADD CONSTRAINT "physical_wods_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."physical_competitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."program_members"
    ADD CONSTRAINT "program_members_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_members"
    ADD CONSTRAINT "program_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_scores"
    ADD CONSTRAINT "program_scores_program_wod_id_fkey" FOREIGN KEY ("program_wod_id") REFERENCES "public"."program_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_scores"
    ADD CONSTRAINT "program_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_wods"
    ADD CONSTRAINT "program_wods_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_templates"
    ADD CONSTRAINT "schedule_templates_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."score_comments"
    ADD CONSTRAINT "score_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."score_comments"
    ADD CONSTRAINT "score_comments_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id");



ALTER TABLE ONLY "public"."score_comments"
    ADD CONSTRAINT "score_comments_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "public"."wod_scores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."score_reactions"
    ADD CONSTRAINT "score_reactions_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "public"."wod_scores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."score_reactions"
    ADD CONSTRAINT "score_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scores"
    ADD CONSTRAINT "scores_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id");



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_converted_plan_id_fkey" FOREIGN KEY ("converted_plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."class_reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_followups"
    ADD CONSTRAINT "session_followups_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."class_schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_admins"
    ADD CONSTRAINT "support_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_loser_id_fkey" FOREIGN KEY ("loser_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_participant1_id_fkey" FOREIGN KEY ("participant1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_participant2_id_fkey" FOREIGN KEY ("participant2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_bracket_matches"
    ADD CONSTRAINT "tournament_bracket_matches_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."tournament_wods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_division_members"
    ADD CONSTRAINT "tournament_division_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_division_members"
    ADD CONSTRAINT "tournament_division_members_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_divisions"
    ADD CONSTRAINT "tournament_divisions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_elo_history"
    ADD CONSTRAINT "tournament_elo_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_elo_history"
    ADD CONSTRAINT "tournament_elo_history_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_match_elo_history"
    ADD CONSTRAINT "tournament_match_elo_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_match_elo_history"
    ADD CONSTRAINT "tournament_match_elo_history_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."tournament_bracket_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_participants"
    ADD CONSTRAINT "tournament_participants_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_participants"
    ADD CONSTRAINT "tournament_participants_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_tournament_wod_id_fkey" FOREIGN KEY ("tournament_wod_id") REFERENCES "public"."tournament_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_scores"
    ADD CONSTRAINT "tournament_scores_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_season_history"
    ADD CONSTRAINT "tournament_season_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_season_history"
    ADD CONSTRAINT "tournament_season_history_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_season_history"
    ADD CONSTRAINT "tournament_season_history_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_wod_elo_history"
    ADD CONSTRAINT "tournament_wod_elo_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_wod_elo_history"
    ADD CONSTRAINT "tournament_wod_elo_history_tournament_wod_id_fkey" FOREIGN KEY ("tournament_wod_id") REFERENCES "public"."tournament_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_wods"
    ADD CONSTRAINT "tournament_wods_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_wods"
    ADD CONSTRAINT "tournament_wods_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_generation_settings"
    ADD CONSTRAINT "user_generation_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_movement_prefs"
    ADD CONSTRAINT "user_movement_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_movement_stats"
    ADD CONSTRAINT "user_movement_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_races"
    ADD CONSTRAINT "user_races_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_wod_feedback"
    ADD CONSTRAINT "user_wod_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_completions"
    ADD CONSTRAINT "wod_completions_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_completions"
    ADD CONSTRAINT "wod_completions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_completions"
    ADD CONSTRAINT "wod_completions_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_group_access"
    ADD CONSTRAINT "wod_group_access_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."message_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_group_access"
    ADD CONSTRAINT "wod_group_access_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_program_access"
    ADD CONSTRAINT "wod_program_access_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_program_access"
    ADD CONSTRAINT "wod_program_access_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_scores"
    ADD CONSTRAINT "wod_scores_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id");



ALTER TABLE ONLY "public"."wod_scores"
    ADD CONSTRAINT "wod_scores_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_scores"
    ADD CONSTRAINT "wod_scores_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."box_wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can manage WODs" ON "public"."wods" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage tournaments" ON "public"."tournaments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can validate scores" ON "public"."scores" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Anyone can view daily tournaments" ON "public"."daily_tournaments" FOR SELECT USING (true);



CREATE POLICY "Anyone can view participants" ON "public"."daily_tournament_participants" FOR SELECT USING (true);



CREATE POLICY "Anyone can view scores" ON "public"."daily_tournament_scores" FOR SELECT USING (true);



CREATE POLICY "Athletes can create matches" ON "public"."matches" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete1_id"));



CREATE POLICY "Athletes can create mini tournaments" ON "public"."mini_tournaments" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Athletes can insert PRs" ON "public"."personal_records" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Athletes can join tournaments" ON "public"."tournament_participants" FOR INSERT WITH CHECK ((("auth"."uid"() = "athlete_id") AND "public"."can_join_tournament"("tournament_id")));



CREATE POLICY "Athletes can submit scores" ON "public"."scores" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Athletes can update PRs" ON "public"."personal_records" FOR UPDATE USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Athletes can update their matches" ON "public"."matches" FOR UPDATE USING ((("auth"."uid"() = "athlete1_id") OR ("auth"."uid"() = "athlete2_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Athletes can view own scores" ON "public"."scores" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Athletes can view their own matches" ON "public"."matches" FOR SELECT USING ((("auth"."uid"() = "athlete1_id") OR ("auth"."uid"() = "athlete2_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Authenticated users create daily tournaments" ON "public"."daily_tournaments" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Badges viewable by owner" ON "public"."athlete_badges" FOR SELECT USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Creator can update own tournament" ON "public"."daily_tournaments" FOR UPDATE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Manage own queue" ON "public"."matchmaking_queue" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Members can view elo_history of their box" ON "public"."elo_history" FOR SELECT USING (("box_id" IN ( SELECT "bm"."box_id"
   FROM "public"."box_members" "bm"
  WHERE (("bm"."member_id" = "auth"."uid"()) AND ("bm"."status" = 'active'::"text")))));



CREATE POLICY "Mini tournaments viewable by everyone" ON "public"."mini_tournaments" FOR SELECT USING (true);



CREATE POLICY "PRs viewable by owner" ON "public"."personal_records" FOR SELECT USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Read queue" ON "public"."matchmaking_queue" FOR SELECT USING (true);



CREATE POLICY "Tournaments viewable by everyone" ON "public"."tournaments" FOR SELECT USING (true);



CREATE POLICY "Users can delete own generated wods" ON "public"."generated_wods" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own scores" ON "public"."generated_wod_scores" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own generated wods" ON "public"."generated_wods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own scores" ON "public"."generated_wod_scores" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own generated wods" ON "public"."generated_wods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own scores" ON "public"."generated_wod_scores" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own generated wods" ON "public"."generated_wods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own scores" ON "public"."generated_wod_scores" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users join tournaments" ON "public"."daily_tournament_participants" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND "public"."can_join_daily_tournament"("tournament_id")));



CREATE POLICY "Users leave tournaments" ON "public"."daily_tournament_participants" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own notification prefs" ON "public"."notification_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own push tokens" ON "public"."push_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users submit own scores" ON "public"."daily_tournament_scores" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update own scores" ON "public"."daily_tournament_scores" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "WODs are viewable by everyone" ON "public"."wods" FOR SELECT USING (true);



CREATE POLICY "accept_or_decline" ON "public"."friendships" FOR UPDATE USING (("addressee_id" = "auth"."uid"()));



CREATE POLICY "admin_delete_scores" ON "public"."inter_scores" FOR DELETE USING ((("athlete_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "admin_manage_partners" ON "public"."partners" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))) WITH CHECK (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))));



CREATE POLICY "admin_manage_pm" ON "public"."program_members" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))));



CREATE POLICY "admin_manage_program_wods" ON "public"."program_wods" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))));



CREATE POLICY "admin_manage_programs" ON "public"."programs" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))));



CREATE POLICY "admin_manage_registrations" ON "public"."inter_registrations" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "admin_validate_scores" ON "public"."inter_scores" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "affiliates_delete" ON "public"."program_affiliates" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "affiliates_insert" ON "public"."program_affiliates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "affiliates_read" ON "public"."program_affiliates" FOR SELECT USING (true);



CREATE POLICY "affiliates_update" ON "public"."program_affiliates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "anyone_can_view_competitions" ON "public"."inter_competitions" FOR SELECT USING ((("status" <> 'draft'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "anyone_can_view_registrations" ON "public"."inter_registrations" FOR SELECT USING (true);



CREATE POLICY "anyone_can_view_revealed_wods" ON "public"."inter_competition_wods" FOR SELECT USING (((("revealed_at" IS NOT NULL) AND ("revealed_at" <= "now"())) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "anyone_can_view_teams" ON "public"."inter_teams" FOR SELECT USING (true);



CREATE POLICY "anyone_read_active_partners" ON "public"."partners" FOR SELECT USING (("is_active" = true));



CREATE POLICY "anyone_read_listed_boxes" ON "public"."boxes" FOR SELECT USING (("is_listed" = true));



ALTER TABLE "public"."app_changelog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_config_read" ON "public"."app_config" FOR SELECT USING (true);



ALTER TABLE "public"."appointment_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointment_bookings_cancel" ON "public"."appointment_bookings" FOR UPDATE USING ((("member_id" = "auth"."uid"()) OR "public"."manages_box_funnel"("box_id"))) WITH CHECK ((("member_id" = "auth"."uid"()) OR "public"."manages_box_funnel"("box_id")));



CREATE POLICY "appointment_bookings_select" ON "public"."appointment_bookings" FOR SELECT USING ((("member_id" = "auth"."uid"()) OR "public"."manages_box_funnel"("box_id")));



CREATE POLICY "appointment_slots_manage" ON "public"."box_appointment_slots" USING ("public"."manages_box_funnel"("box_id")) WITH CHECK ("public"."manages_box_funnel"("box_id"));



CREATE POLICY "appointment_slots_select" ON "public"."box_appointment_slots" FOR SELECT USING (("public"."manages_box_funnel"("box_id") OR ("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE (("box_members"."member_id" = "auth"."uid"()) AND ("box_members"."status" = 'active'::"text"))))));



CREATE POLICY "articles_coach_manage" ON "public"."box_articles" USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "articles_coach_read" ON "public"."box_articles" FOR SELECT USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "articles_coowner_manage" ON "public"."box_articles" USING ("public"."is_box_owner_member"("box_id")) WITH CHECK ("public"."is_box_owner_member"("box_id"));



CREATE POLICY "articles_member_read" ON "public"."box_articles" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "articles_owner_all" ON "public"."box_articles" USING ("public"."is_box_owner"("box_id"));



ALTER TABLE "public"."athlete_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_read_own_participation" ON "public"."tournament_participants" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "athlete_register_self" ON "public"."inter_registrations" FOR INSERT WITH CHECK (((("athlete_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "inter_teams"."id"
   FROM "public"."inter_teams"
  WHERE ("inter_teams"."captain_id" = "auth"."uid"())))) AND "public"."can_join_inter_competition"("competition_id")));



ALTER TABLE "public"."athlete_streaks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_submit_score" ON "public"."inter_scores" FOR INSERT WITH CHECK ((("athlete_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "itm"."team_id"
   FROM "public"."inter_team_members" "itm"
  WHERE (("itm"."user_id" = "auth"."uid"()) AND ("itm"."status" = 'accepted'::"text"))))));



CREATE POLICY "athlete_view_own_score" ON "public"."inter_scores" FOR SELECT USING ((("athlete_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "itm"."team_id"
   FROM "public"."inter_team_members" "itm"
  WHERE ("itm"."user_id" = "auth"."uid"()))) OR ("status" = 'validated'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "authenticated_read_all_participants" ON "public"."tournament_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_read_participants" ON "public"."tournament_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "author_delete_comment" ON "public"."score_comments" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "author_delete_reply" ON "public"."message_replies" FOR DELETE USING (("sender_id" = "auth"."uid"()));



CREATE POLICY "badges_admin_write" ON "public"."athlete_badges" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))));



ALTER TABLE "public"."badges_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badges_catalog_public_read" ON "public"."badges_catalog" FOR SELECT USING (true);



CREATE POLICY "badges_public_read" ON "public"."athlete_badges" FOR SELECT USING (true);



ALTER TABLE "public"."box_appointment_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_article_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_article_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_elo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_elo_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_elo_history_read" ON "public"."box_elo_history" FOR SELECT USING ((("member_id" = "auth"."uid"()) OR ("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE (("box_members"."member_id" = "auth"."uid"()) AND ("box_members"."status" = 'active'::"text")))) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "box_elo_read" ON "public"."box_elo" FOR SELECT USING ((("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE (("box_members"."member_id" = "auth"."uid"()) AND ("box_members"."status" = 'active'::"text")))) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "box_general_messages" ON "public"."messages" FOR SELECT USING (((("message_type" = 'general'::"text") AND ("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids"))) OR ("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "box_member_read_replies" ON "public"."message_replies" FOR SELECT USING ((("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));



CREATE POLICY "box_member_see_completions" ON "public"."wod_completions" FOR SELECT USING ((("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE (("box_members"."member_id" = "auth"."uid"()) AND ("box_members"."status" = 'active'::"text")))) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))) OR ("member_id" = "auth"."uid"())));



CREATE POLICY "box_member_see_reservations" ON "public"."class_reservations" FOR SELECT USING ((("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));



CREATE POLICY "box_member_see_schedules" ON "public"."class_schedules" FOR SELECT USING ((("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."box_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_members_comments" ON "public"."score_comments" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "box_members_coowner_manage" ON "public"."box_members" USING ("public"."is_box_owner_member"("box_id")) WITH CHECK ("public"."is_box_owner_member"("box_id"));



CREATE POLICY "box_members_owner_view" ON "public"."box_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."boxes"
  WHERE (("boxes"."id" = "box_members"."box_id") AND ("boxes"."owner_id" = "auth"."uid"())))));



CREATE POLICY "box_members_see_profiles" ON "public"."profiles" FOR SELECT USING ((("id" IN ( SELECT "public"."get_box_mate_ids"() AS "get_box_mate_ids")) OR ("id" = "auth"."uid"())));



CREATE POLICY "box_members_see_scores" ON "public"."wod_scores" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "box_members_self_leave" ON "public"."box_members" FOR DELETE USING (("member_id" = "auth"."uid"()));



ALTER TABLE "public"."box_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_messages_member_read" ON "public"."box_messages" FOR SELECT USING (("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE ("box_members"."member_id" = "auth"."uid"()))));



CREATE POLICY "box_messages_owner_all" ON "public"."box_messages" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."box_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_notifs_member_read" ON "public"."box_notifications" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."box_members"
  WHERE (("box_members"."box_id" = "box_notifications"."box_id") AND ("box_members"."member_id" = "auth"."uid"()) AND ("box_members"."status" = 'active'::"text")))) AND (("target" = 'all'::"text") OR ("target" = ("auth"."uid"())::"text"))));



CREATE POLICY "box_notifs_owner" ON "public"."box_notifications" USING ("public"."is_box_owner"("box_id"));



CREATE POLICY "box_owner_full" ON "public"."boxes" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "box_owner_insert_group_messages" ON "public"."group_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("group_id" IN ( SELECT "message_groups"."id"
   FROM "public"."message_groups"
  WHERE ("message_groups"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "box_owner_manage_schedules" ON "public"."class_schedules" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "box_owner_manage_templates" ON "public"."schedule_templates" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "box_owner_read_group_messages" ON "public"."group_messages" FOR SELECT USING (("group_id" IN ( SELECT "message_groups"."id"
   FROM "public"."message_groups"
  WHERE ("message_groups"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "box_owner_read_subscription" ON "public"."box_subscriptions" FOR SELECT USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "box_prog_subs_select" ON "public"."box_programming_subscriptions" FOR SELECT USING (("public"."manages_box"("subscriber_box_id") OR (EXISTS ( SELECT 1
   FROM "public"."box_programming" "p"
  WHERE (("p"."id" = "box_programming_subscriptions"."programming_id") AND "public"."manages_box"("p"."publisher_box_id"))))));



CREATE POLICY "box_prog_subs_write" ON "public"."box_programming_subscriptions" USING ("public"."manages_box"("subscriber_box_id")) WITH CHECK ("public"."manages_box"("subscriber_box_id"));



ALTER TABLE "public"."box_programming" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_programming_select" ON "public"."box_programming" FOR SELECT USING ((("is_published" AND (EXISTS ( SELECT 1
   FROM "public"."boxes" "b"
  WHERE "public"."manages_box"("b"."id")))) OR "public"."manages_box"("publisher_box_id")));



ALTER TABLE "public"."box_programming_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_programming_wods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "box_programming_wods_select" ON "public"."box_programming_wods" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."box_programming" "p"
  WHERE (("p"."id" = "box_programming_wods"."programming_id") AND "public"."manages_box"("p"."publisher_box_id")))) OR "public"."box_subscribes_programming"("programming_id")));



CREATE POLICY "box_programming_wods_write" ON "public"."box_programming_wods" USING ((EXISTS ( SELECT 1
   FROM "public"."box_programming" "p"
  WHERE (("p"."id" = "box_programming_wods"."programming_id") AND "public"."manages_box"("p"."publisher_box_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."box_programming" "p"
  WHERE (("p"."id" = "box_programming_wods"."programming_id") AND "public"."manages_box"("p"."publisher_box_id")))));



CREATE POLICY "box_programming_write" ON "public"."box_programming" USING ("public"."manages_box"("publisher_box_id")) WITH CHECK ("public"."manages_box"("publisher_box_id"));



ALTER TABLE "public"."box_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."box_wods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."boxes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "boxes_coowner_manage" ON "public"."boxes" FOR UPDATE USING ("public"."is_box_owner_member"("id")) WITH CHECK ("public"."is_box_owner_member"("id"));



CREATE POLICY "boxes_owner_write" ON "public"."boxes" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "boxes_select_all" ON "public"."boxes" FOR SELECT USING (true);



CREATE POLICY "bracket_matches_owner_admin" ON "public"."tournament_bracket_matches" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_bracket_matches"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_bracket_matches"."tournament_id") AND "public"."is_box_admin"("t"."box_id")))));



CREATE POLICY "bracket_matches_read" ON "public"."tournament_bracket_matches" FOR SELECT USING (true);



CREATE POLICY "cancel_req_insert" ON "public"."membership_cancellation_requests" FOR INSERT TO "authenticated" WITH CHECK ((("member_id" = "auth"."uid"()) AND ("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."box_members" "bm"
  WHERE (("bm"."box_id" = "membership_cancellation_requests"."box_id") AND ("bm"."member_id" = "auth"."uid"()))))));



CREATE POLICY "cancel_req_read" ON "public"."membership_cancellation_requests" FOR SELECT TO "authenticated" USING ((("member_id" = "auth"."uid"()) OR "public"."is_box_staff"("box_id")));



CREATE POLICY "cancel_req_update" ON "public"."membership_cancellation_requests" FOR UPDATE TO "authenticated" USING ("public"."is_box_staff"("box_id")) WITH CHECK ("public"."is_box_staff"("box_id"));



CREATE POLICY "captain_invite_members" ON "public"."inter_team_members" FOR INSERT WITH CHECK (("team_id" IN ( SELECT "inter_teams"."id"
   FROM "public"."inter_teams"
  WHERE ("inter_teams"."captain_id" = "auth"."uid"()))));



CREATE POLICY "captain_manage_team" ON "public"."inter_teams" USING ((("captain_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "captain_or_admin_delete_member" ON "public"."inter_team_members" FOR DELETE USING ((("team_id" IN ( SELECT "inter_teams"."id"
   FROM "public"."inter_teams"
  WHERE ("inter_teams"."captain_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "changelog_admin_write" ON "public"."app_changelog" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "changelog_public_read" ON "public"."app_changelog" FOR SELECT USING (true);



ALTER TABLE "public"."changelog_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "changelog_reads_own" ON "public"."changelog_reads" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."class_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_schedules_coowner_manage" ON "public"."class_schedules" USING ("public"."is_box_owner_member"("box_id")) WITH CHECK ("public"."is_box_owner_member"("box_id"));



CREATE POLICY "coach_comment_scores" ON "public"."score_comments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wod_scores" "ws"
  WHERE (("ws"."id" = "score_comments"."score_id") AND "public"."is_box_coach"("ws"."box_id")))));



CREATE POLICY "coach_insert_reservation" ON "public"."class_reservations" FOR INSERT WITH CHECK ("public"."is_box_coach"("box_id"));



CREATE POLICY "coach_manage_schedules" ON "public"."class_schedules" USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "coach_manage_wods" ON "public"."box_wods" USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "coach_read_comments" ON "public"."score_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wod_scores" "ws"
  WHERE (("ws"."id" = "score_comments"."score_id") AND "public"."is_box_coach"("ws"."box_id")))));



CREATE POLICY "coach_see_scores" ON "public"."wod_scores" FOR SELECT USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "coach_update_attendance" ON "public"."class_reservations" FOR UPDATE USING ("public"."is_box_coach"("box_id"));



CREATE POLICY "comments_member_insert" ON "public"."box_article_comments" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "comments_member_read" ON "public"."box_article_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."box_articles" "a"
  WHERE (("a"."id" = "box_article_comments"."article_id") AND ("a"."box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids"))))));



CREATE POLICY "comments_own_delete" ON "public"."box_article_comments" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "comments_owner_delete" ON "public"."box_article_comments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."box_articles" "a"
  WHERE (("a"."id" = "box_article_comments"."article_id") AND "public"."is_box_owner"("a"."box_id")))));



ALTER TABLE "public"."competition_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competition_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_elo_history_select" ON "public"."daily_tournament_elo_history" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."daily_tournament_elo_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_tournament_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_tournament_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_friendship" ON "public"."friendships" FOR DELETE USING ((("requester_id" = "auth"."uid"()) OR ("addressee_id" = "auth"."uid"())));



CREATE POLICY "delete_own_documents" ON "public"."box_documents" FOR DELETE USING (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "delete_own_reaction" ON "public"."message_reactions" FOR DELETE USING (("member_id" = "auth"."uid"()));



CREATE POLICY "division_members_owner_admin" ON "public"."tournament_division_members" USING (((EXISTS ( SELECT 1
   FROM (("public"."tournament_divisions" "d"
     JOIN "public"."tournaments" "t" ON (("t"."id" = "d"."tournament_id")))
     JOIN "public"."box_members" "bm" ON (("bm"."box_id" = "t"."box_id")))
  WHERE (("d"."id" = "tournament_division_members"."division_id") AND ("bm"."member_id" = "auth"."uid"()) AND ("bm"."role" = ANY (ARRAY['owner'::"text", 'coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "division_members_read" ON "public"."tournament_division_members" FOR SELECT USING (true);



CREATE POLICY "divisions_owner_admin" ON "public"."tournament_divisions" USING (((EXISTS ( SELECT 1
   FROM ("public"."tournaments" "t"
     JOIN "public"."box_members" "bm" ON (("bm"."box_id" = "t"."box_id")))
  WHERE (("t"."id" = "tournament_divisions"."tournament_id") AND ("bm"."member_id" = "auth"."uid"()) AND ("bm"."role" = ANY (ARRAY['owner'::"text", 'coach'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "divisions_read" ON "public"."tournament_divisions" FOR SELECT USING (true);



CREATE POLICY "documents_member_read" ON "public"."box_documents" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ((("box_id" IS NULL) AND ("uploaded_by" = "auth"."uid"())) OR ("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) OR ("uploaded_by" = "auth"."uid"()))));



ALTER TABLE "public"."elo_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "elo_history_admin_write" ON "public"."tournament_elo_history" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_elo_history"."tournament_id") AND "public"."is_box_admin"("t"."box_id")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_elo_history"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))));



CREATE POLICY "elo_history_owner_or_admin" ON "public"."tournament_elo_history" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_elo_history"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))));



ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_wod_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_wods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_box_documents" ON "public"."box_documents" FOR INSERT WITH CHECK (("auth"."uid"() = "uploaded_by"));



CREATE POLICY "insert_own_reaction" ON "public"."message_reactions" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "inter_bracket_admin" ON "public"."inter_bracket_matches" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



ALTER TABLE "public"."inter_bracket_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_bracket_read" ON "public"."inter_bracket_matches" FOR SELECT USING (true);



ALTER TABLE "public"."inter_competition_wods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_competitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_elo_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_elo_history_admin_write" ON "public"."inter_elo_history" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))));



CREATE POLICY "inter_elo_history_read" ON "public"."inter_elo_history" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"])))))));



ALTER TABLE "public"."inter_league_rounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_league_rounds_admin" ON "public"."inter_league_rounds" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "inter_league_rounds_read" ON "public"."inter_league_rounds" FOR SELECT USING (true);



ALTER TABLE "public"."inter_league_standings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_league_standings_admin" ON "public"."inter_league_standings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "inter_league_standings_read" ON "public"."inter_league_standings" FOR SELECT USING (true);



ALTER TABLE "public"."inter_pool_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_pool_groups_admin" ON "public"."inter_pool_groups" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "inter_pool_groups_read" ON "public"."inter_pool_groups" FOR SELECT USING (true);



ALTER TABLE "public"."inter_pool_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_pool_matches_admin" ON "public"."inter_pool_matches" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "inter_pool_matches_read" ON "public"."inter_pool_matches" FOR SELECT USING (true);



ALTER TABLE "public"."inter_pool_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inter_pool_members_admin" ON "public"."inter_pool_members" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "inter_pool_members_read" ON "public"."inter_pool_members" FOR SELECT USING (true);



ALTER TABLE "public"."inter_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_swiss_pairings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_swiss_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_swiss_standings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inter_teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "likes_member_read" ON "public"."box_article_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."box_articles" "a"
  WHERE (("a"."id" = "box_article_likes"."article_id") AND ("a"."box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids"))))));



CREATE POLICY "likes_member_remove" ON "public"."box_article_likes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "likes_member_toggle" ON "public"."box_article_likes" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "manage_wod_group_access" ON "public"."wod_group_access" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matchmaking_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_add_reaction" ON "public"."score_reactions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "member_add_reservation" ON "public"."class_reservations" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_answer_invitation" ON "public"."inter_team_members" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "inter_teams"."id"
   FROM "public"."inter_teams"
  WHERE ("inter_teams"."captain_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



CREATE POLICY "member_cancel_registration" ON "public"."event_registrations" FOR DELETE USING (("member_id" = "auth"."uid"()));



ALTER TABLE "public"."member_class_credits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_delete_completion" ON "public"."wod_completions" FOR DELETE USING (("member_id" = "auth"."uid"()));



CREATE POLICY "member_delete_reservation" ON "public"."class_reservations" FOR DELETE USING (("member_id" = "auth"."uid"()));



CREATE POLICY "member_insert_completion" ON "public"."wod_completions" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_insert_group_messages" ON "public"."group_messages" FOR INSERT WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("group_id" IN ( SELECT "message_group_members"."group_id"
   FROM "public"."message_group_members"
  WHERE ("message_group_members"."member_id" = "auth"."uid"())))));



CREATE POLICY "member_join_competition" ON "public"."competition_participants" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_join_program" ON "public"."program_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "member_own_scores" ON "public"."wod_scores" USING (("member_id" = "auth"."uid"()));



CREATE POLICY "member_post_comment" ON "public"."score_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND ("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids"))));



CREATE POLICY "member_post_reply" ON "public"."message_replies" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



CREATE POLICY "member_read_group_messages" ON "public"."group_messages" FOR SELECT USING (("group_id" IN ( SELECT "message_group_members"."group_id"
   FROM "public"."message_group_members"
  WHERE ("message_group_members"."member_id" = "auth"."uid"()))));



CREATE POLICY "member_read_program_wods" ON "public"."program_wods" FOR SELECT USING ((("program_id" IN ( SELECT "program_members"."program_id"
   FROM "public"."program_members"
  WHERE (("program_members"."user_id" = "auth"."uid"()) AND ("program_members"."status" = 'active'::"text")))) OR ("program_id" IN ( SELECT "programs"."id"
   FROM "public"."programs"
  WHERE ("programs"."owner_id" = "auth"."uid"())))));



CREATE POLICY "member_read_templates" ON "public"."schedule_templates" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_register_event" ON "public"."event_registrations" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_remove_reaction" ON "public"."score_reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "member_see_box" ON "public"."boxes" FOR SELECT USING (("id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_see_boxmates" ON "public"."box_members" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_see_comp_participants" ON "public"."competition_participants" FOR SELECT USING (("competition_id" IN ( SELECT "competitions"."id"
   FROM "public"."competitions"
  WHERE ("competitions"."box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")))));



CREATE POLICY "member_see_comp_scores" ON "public"."competition_scores" FOR SELECT USING (("competition_id" IN ( SELECT "competitions"."id"
   FROM "public"."competitions"
  WHERE ("competitions"."box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")))));



CREATE POLICY "member_see_competitions" ON "public"."competitions" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_see_event_registrations" ON "public"."event_registrations" FOR SELECT USING (("event_id" IN ( SELECT "events"."id"
   FROM "public"."events"
  WHERE ("events"."box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")))));



CREATE POLICY "member_see_events" ON "public"."events" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_see_own" ON "public"."box_members" FOR SELECT USING (("member_id" = "auth"."uid"()));



CREATE POLICY "member_see_own_groups" ON "public"."message_groups" FOR SELECT USING (("auth"."uid"() = ANY ("members")));



CREATE POLICY "member_see_plans" ON "public"."membership_plans" FOR SELECT USING (("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")));



CREATE POLICY "member_see_published" ON "public"."box_wods" FOR SELECT USING ((("box_id" IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) AND ("is_published" = true) AND (("publish_at" IS NULL) OR ("publish_at" <= "now"()))));



CREATE POLICY "member_see_reactions" ON "public"."score_reactions" FOR SELECT USING (true);



CREATE POLICY "member_submit_comp_score" ON "public"."competition_scores" FOR INSERT WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_update_own_reservation" ON "public"."class_reservations" FOR UPDATE USING (("member_id" = "auth"."uid"())) WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "member_update_registration" ON "public"."event_registrations" FOR UPDATE USING (("member_id" = "auth"."uid"()));



CREATE POLICY "member_withdraw_competition" ON "public"."competition_participants" FOR UPDATE USING (("member_id" = "auth"."uid"()));



ALTER TABLE "public"."membership_cancellation_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."membership_plan_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."membership_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membership_plans_coowner_manage" ON "public"."membership_plans" USING ("public"."is_box_owner_member"("box_id")) WITH CHECK ("public"."is_box_owner_member"("box_id"));



ALTER TABLE "public"."membership_promo_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_groups_coowner_manage" ON "public"."message_groups" USING ("public"."is_box_owner_member"("box_id")) WITH CHECK ("public"."is_box_owner_member"("box_id"));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mini_tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movement_logs_own_insert" ON "public"."movement_logs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "movement_logs_own_read" ON "public"."movement_logs" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."movement_rep_counts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movement_reps_admin_write" ON "public"."movement_rep_counts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))));



CREATE POLICY "movement_reps_owner_or_admin_read" ON "public"."movement_rep_counts" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"])))))));



CREATE POLICY "movement_stats_own_read" ON "public"."user_movement_stats" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notif_member_read" ON "public"."box_notifications" FOR SELECT USING (("public"."is_box_member"("box_id") AND (("target" = 'all'::"text") OR ("target" = ("auth"."uid"())::"text"))));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_delete_participants" ON "public"."tournament_participants" FOR DELETE TO "authenticated" USING ((("athlete_id" = "auth"."uid"()) OR ("tournament_id" IN ( SELECT "tournaments"."id"
   FROM "public"."tournaments"
  WHERE ("tournaments"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"())))))));



CREATE POLICY "owner_delete_reservation" ON "public"."class_reservations" FOR DELETE USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_comp_participants" ON "public"."competition_participants" USING (("competition_id" IN ( SELECT "competitions"."id"
   FROM "public"."competitions"
  WHERE ("competitions"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owner_manage_comp_scores" ON "public"."competition_scores" USING (("competition_id" IN ( SELECT "competitions"."id"
   FROM "public"."competitions"
  WHERE ("competitions"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owner_manage_competitions" ON "public"."competitions" USING ("public"."is_box_owner"("box_id"));



CREATE POLICY "owner_manage_events" ON "public"."events" USING ("public"."is_box_owner"("box_id"));



CREATE POLICY "owner_manage_groups" ON "public"."message_groups" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_members" ON "public"."box_members" USING ("public"."is_box_owner"("box_id"));



CREATE POLICY "owner_manage_plan_groups" ON "public"."membership_plan_groups" USING (("plan_id" IN ( SELECT "mp"."id"
   FROM ("public"."membership_plans" "mp"
     JOIN "public"."boxes" "b" ON (("b"."id" = "mp"."box_id")))
  WHERE ("b"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_plans" ON "public"."membership_plans" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_pm" ON "public"."program_members" USING (("program_id" IN ( SELECT "programs"."id"
   FROM "public"."programs"
  WHERE ("programs"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_program_wods" ON "public"."program_wods" USING (("program_id" IN ( SELECT "programs"."id"
   FROM "public"."programs"
  WHERE ("programs"."owner_id" = "auth"."uid"()))));



CREATE POLICY "owner_manage_programs" ON "public"."programs" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner_manage_registrations" ON "public"."event_registrations" USING (("event_id" IN ( SELECT "events"."id"
   FROM "public"."events"
  WHERE ("events"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owner_manage_wods" ON "public"."box_wods" USING ("public"."is_box_owner"("box_id"));



CREATE POLICY "owner_see_registrations" ON "public"."event_registrations" FOR SELECT USING (("event_id" IN ( SELECT "events"."id"
   FROM "public"."events"
  WHERE ("events"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owner_see_scores" ON "public"."wod_scores" FOR SELECT USING ("public"."is_box_owner"("box_id"));



ALTER TABLE "public"."owner_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owner_subscriptions_select_own" ON "public"."owner_subscriptions" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner_update_participants" ON "public"."tournament_participants" FOR UPDATE TO "authenticated" USING (("tournament_id" IN ( SELECT "tournaments"."id"
   FROM "public"."tournaments"
  WHERE ("tournaments"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "participants_read" ON "public"."tournament_participants" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."partners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."physical_competitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "physical_competitions_delete" ON "public"."physical_competitions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "physical_competitions_insert" ON "public"."physical_competitions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "physical_competitions_select" ON "public"."physical_competitions" FOR SELECT USING (true);



CREATE POLICY "physical_competitions_update" ON "public"."physical_competitions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."physical_wods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "physical_wods_delete" ON "public"."physical_wods" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "physical_wods_insert" ON "public"."physical_wods" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "physical_wods_select" ON "public"."physical_wods" FOR SELECT USING (true);



CREATE POLICY "physical_wods_update" ON "public"."physical_wods" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_box_owner_view" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."box_members" "bm"
     JOIN "public"."boxes" "b" ON (("b"."id" = "bm"."box_id")))
  WHERE (("bm"."member_id" = "profiles"."id") AND ("b"."owner_id" = "auth"."uid"()))))));



ALTER TABLE "public"."program_affiliates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_wods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promo_codes_staff_all" ON "public"."membership_promo_codes" TO "authenticated" USING ("public"."is_box_staff"("box_id")) WITH CHECK ("public"."is_box_staff"("box_id"));



CREATE POLICY "public_read_active_plans" ON "public"."membership_plans" FOR SELECT USING (("is_active" = true));



CREATE POLICY "public_read_by_invite" ON "public"."boxes" FOR SELECT USING (true);



CREATE POLICY "public_read_profiles" ON "public"."profiles" FOR SELECT USING (true);



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_active_programs" ON "public"."programs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "read_box_documents" ON "public"."box_documents" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ((("box_id" IS NULL) AND ("uploaded_by" = "auth"."uid"())) OR ("box_id" IN ( SELECT "box_members"."box_id"
   FROM "public"."box_members"
  WHERE ("box_members"."member_id" = "auth"."uid"()))) OR ("uploaded_by" = "auth"."uid"()))));



CREATE POLICY "read_own_membership" ON "public"."program_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("program_id" IN ( SELECT "programs"."id"
   FROM "public"."programs"
  WHERE ("programs"."owner_id" = "auth"."uid"())))));



CREATE POLICY "read_own_or_owner_credits" ON "public"."member_class_credits" FOR SELECT USING ((("member_id" = "auth"."uid"()) OR ("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));



CREATE POLICY "read_plan_groups" ON "public"."membership_plan_groups" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "read_program_scores" ON "public"."program_scores" FOR SELECT USING ((("program_wod_id" IN ( SELECT "pw"."id"
   FROM ("public"."program_wods" "pw"
     JOIN "public"."program_members" "pm" ON (("pm"."program_id" = "pw"."program_id")))
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."status" = 'active'::"text")))) OR ("program_wod_id" IN ( SELECT "pw"."id"
   FROM ("public"."program_wods" "pw"
     JOIN "public"."programs" "p" ON (("p"."id" = "pw"."program_id")))
  WHERE ("p"."owner_id" = "auth"."uid"())))));



CREATE POLICY "read_reactions" ON "public"."message_reactions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "read_wod_group_access" ON "public"."wod_group_access" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_admin_all" ON "public"."reports" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "reports_select_own" ON "public"."reports" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "reporter_id"));



ALTER TABLE "public"."schedule_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."score_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."score_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scores_read" ON "public"."tournament_scores" FOR SELECT USING (true);



CREATE POLICY "scores_write" ON "public"."tournament_scores" USING (("athlete_id" = "auth"."uid"()));



CREATE POLICY "season_history_admin_write" ON "public"."tournament_season_history" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_season_history"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_season_history"."tournament_id") AND "public"."is_box_admin"("t"."box_id")))));



CREATE POLICY "season_history_read" ON "public"."tournament_season_history" FOR SELECT USING (true);



CREATE POLICY "see_own_friendships" ON "public"."friendships" FOR SELECT USING ((("requester_id" = "auth"."uid"()) OR ("addressee_id" = "auth"."uid"())));



CREATE POLICY "send_friend_request" ON "public"."friendships" FOR INSERT WITH CHECK (("requester_id" = "auth"."uid"()));



CREATE POLICY "send_message" ON "public"."messages" FOR INSERT WITH CHECK (("sender_id" = "auth"."uid"()));



ALTER TABLE "public"."session_followups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "session_followups_owner_insert" ON "public"."session_followups" FOR INSERT WITH CHECK ("public"."manages_box_funnel"("box_id"));



CREATE POLICY "session_followups_owner_update" ON "public"."session_followups" FOR UPDATE USING ("public"."manages_box_funnel"("box_id")) WITH CHECK ("public"."manages_box_funnel"("box_id"));



CREATE POLICY "session_followups_prospect_update" ON "public"."session_followups" FOR UPDATE USING (("member_id" = "auth"."uid"())) WITH CHECK (("member_id" = "auth"."uid"()));



CREATE POLICY "session_followups_select" ON "public"."session_followups" FOR SELECT USING ((("member_id" = "auth"."uid"()) OR "public"."manages_box_funnel"("box_id")));



CREATE POLICY "streaks_read_own" ON "public"."athlete_streaks" FOR SELECT USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "streaks_write_own" ON "public"."athlete_streaks" USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "super_admin_manage_competitions" ON "public"."inter_competitions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "super_admin_manage_wods" ON "public"."inter_competition_wods" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"]))))));



CREATE POLICY "superadmin_read_badges" ON "public"."athlete_badges" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "superadmin_read_box_members" ON "public"."box_members" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "superadmin_read_generated_wods" ON "public"."generated_wods" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "superadmin_read_messages" ON "public"."box_messages" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "superadmin_read_reservations" ON "public"."class_reservations" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "superadmin_read_wod_scores" ON "public"."wod_scores" FOR SELECT USING ("public"."is_super_admin"());



ALTER TABLE "public"."support_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_admins_read" ON "public"."support_admins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_support_admin"()));



ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_messages_insert" ON "public"."support_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_messages"."ticket_id") AND ((("support_messages"."sender_role" = 'admin'::"text") AND "public"."is_support_admin"()) OR (("support_messages"."sender_role" = 'requester'::"text") AND "public"."is_box_staff"("t"."box_id"))))))));



CREATE POLICY "support_messages_read" ON "public"."support_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."support_tickets" "t"
  WHERE (("t"."id" = "support_messages"."ticket_id") AND ("public"."is_support_admin"() OR "public"."is_box_staff"("t"."box_id"))))));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_tickets_insert" ON "public"."support_tickets" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."is_box_staff"("box_id")));



CREATE POLICY "support_tickets_read" ON "public"."support_tickets" FOR SELECT TO "authenticated" USING (("public"."is_support_admin"() OR "public"."is_box_staff"("box_id")));



CREATE POLICY "support_tickets_update" ON "public"."support_tickets" FOR UPDATE TO "authenticated" USING (("public"."is_support_admin"() OR "public"."is_box_staff"("box_id"))) WITH CHECK (("public"."is_support_admin"() OR "public"."is_box_staff"("box_id")));



CREATE POLICY "swiss_pairings_admin" ON "public"."inter_swiss_pairings" USING ("public"."is_super_admin"());



CREATE POLICY "swiss_pairings_read" ON "public"."inter_swiss_pairings" FOR SELECT USING (true);



CREATE POLICY "swiss_rounds_admin" ON "public"."inter_swiss_rounds" USING ("public"."is_super_admin"());



CREATE POLICY "swiss_rounds_read" ON "public"."inter_swiss_rounds" FOR SELECT USING (true);



CREATE POLICY "swiss_standings_admin" ON "public"."inter_swiss_standings" USING ("public"."is_super_admin"());



CREATE POLICY "swiss_standings_read" ON "public"."inter_swiss_standings" FOR SELECT USING (true);



CREATE POLICY "tmeh_read" ON "public"."tournament_match_elo_history" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."tournament_bracket_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_division_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_divisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_elo_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_match_elo_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournament_participants_admin_manage" ON "public"."tournament_participants" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_participants"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_participants"."tournament_id") AND "public"."is_box_admin"("t"."box_id")))));



CREATE POLICY "tournament_participants_self_delete" ON "public"."tournament_participants" FOR DELETE USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "tournament_participants_self_select" ON "public"."tournament_participants" FOR SELECT USING (("auth"."uid"() = "athlete_id"));



ALTER TABLE "public"."tournament_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournament_scores_admin_delete" ON "public"."tournament_scores" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_scores"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))));



CREATE POLICY "tournament_scores_owner_insert" ON "public"."tournament_scores" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete_id"));



CREATE POLICY "tournament_scores_owner_or_admin_read" ON "public"."tournament_scores" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_scores"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))));



CREATE POLICY "tournament_scores_owner_update_pending" ON "public"."tournament_scores" FOR UPDATE USING (((("auth"."uid"() = "athlete_id") AND ("status" = 'pending'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text", 'box_owner'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_scores"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))));



ALTER TABLE "public"."tournament_season_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_wod_elo_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_wods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournament_wods_admin_all" ON "public"."tournament_wods" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_wods"."tournament_id") AND "public"."is_box_admin"("t"."box_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_wods"."tournament_id") AND "public"."is_box_admin"("t"."box_id")))));



CREATE POLICY "tournament_wods_public_read" ON "public"."tournament_wods" FOR SELECT USING ((("opens_at" IS NULL) OR ("opens_at" <= "now"()) OR "public"."is_box_admin"(( SELECT "t"."box_id"
   FROM "public"."tournaments" "t"
  WHERE ("t"."id" = "tournament_wods"."tournament_id")))));



ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournaments_box_admin_manage" ON "public"."tournaments" USING ("public"."is_box_admin"("box_id")) WITH CHECK ("public"."is_box_admin"("box_id"));



CREATE POLICY "tournaments_read" ON "public"."tournaments" FOR SELECT USING (true);



CREATE POLICY "tournaments_write" ON "public"."tournaments" USING (("box_id" IN ( SELECT "boxes"."id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"()))));



CREATE POLICY "tweh_read" ON "public"."tournament_wod_elo_history" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "update_own_program_score" ON "public"."program_scores" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("program_wod_id" IN ( SELECT "pw"."id"
   FROM ("public"."program_wods" "pw"
     JOIN "public"."program_members" "pm" ON (("pm"."program_id" = "pw"."program_id")))
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."status" = 'active'::"text")))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("program_wod_id" IN ( SELECT "pw"."id"
   FROM ("public"."program_wods" "pw"
     JOIN "public"."program_members" "pm" ON (("pm"."program_id" = "pw"."program_id")))
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."status" = 'active'::"text"))))));



CREATE POLICY "upsert_own_program_score" ON "public"."program_scores" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("program_wod_id" IN ( SELECT "pw"."id"
   FROM ("public"."program_wods" "pw"
     JOIN "public"."program_members" "pm" ON (("pm"."program_id" = "pw"."program_id")))
  WHERE (("pm"."user_id" = "auth"."uid"()) AND ("pm"."status" = 'active'::"text"))))));



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_own" ON "public"."user_blocks" TO "authenticated" USING (("auth"."uid"() = "blocker_id")) WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "user_blocks_select_blocked" ON "public"."user_blocks" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "blocked_id"));



CREATE POLICY "user_create_personal_wods" ON "public"."box_wods" FOR INSERT WITH CHECK ((("box_id" IS NULL) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "user_delete_own_personal_wods" ON "public"."box_wods" FOR DELETE USING ((("box_id" IS NULL) AND ("created_by" = "auth"."uid"())));



ALTER TABLE "public"."user_generation_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_generation_settings_delete_own" ON "public"."user_generation_settings" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_generation_settings_insert_own" ON "public"."user_generation_settings" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_generation_settings_select_own" ON "public"."user_generation_settings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_generation_settings_update_own" ON "public"."user_generation_settings" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_movement_prefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_movement_prefs_delete_own" ON "public"."user_movement_prefs" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_movement_prefs_insert_own" ON "public"."user_movement_prefs" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_movement_prefs_select_own" ON "public"."user_movement_prefs" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_movement_prefs_update_own" ON "public"."user_movement_prefs" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_movement_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_races" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_races_delete_own" ON "public"."user_races" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_races_insert_own" ON "public"."user_races" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_races_select_own" ON "public"."user_races" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_races_update_own" ON "public"."user_races" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_see_own_personal_wods" ON "public"."box_wods" FOR SELECT USING ((("box_id" IS NULL) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "user_update_own_personal_wods" ON "public"."box_wods" FOR UPDATE USING ((("box_id" IS NULL) AND ("created_by" = "auth"."uid"()))) WITH CHECK ((("box_id" IS NULL) AND ("created_by" = "auth"."uid"())));



ALTER TABLE "public"."user_wod_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_wod_feedback_delete_own" ON "public"."user_wod_feedback" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_wod_feedback_insert_own" ON "public"."user_wod_feedback" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_wod_feedback_select_own" ON "public"."user_wod_feedback" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_wod_feedback_update_own" ON "public"."user_wod_feedback" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users manage own requests" ON "public"."friend_requests" USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "view_own_invitations" ON "public"."inter_team_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "inter_teams"."id"
   FROM "public"."inter_teams"
  WHERE ("inter_teams"."captain_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));



ALTER TABLE "public"."wod_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_group_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_program_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wod_program_access_admin_write" ON "public"."wod_program_access" USING ("public"."is_box_admin"(( SELECT "w"."box_id"
   FROM "public"."box_wods" "w"
  WHERE ("w"."id" = "wod_program_access"."wod_id")))) WITH CHECK ("public"."is_box_admin"(( SELECT "w"."box_id"
   FROM "public"."box_wods" "w"
  WHERE ("w"."id" = "wod_program_access"."wod_id"))));



CREATE POLICY "wod_program_access_member_read" ON "public"."wod_program_access" FOR SELECT USING (((( SELECT "w"."box_id"
   FROM "public"."box_wods" "w"
  WHERE ("w"."id" = "wod_program_access"."wod_id")) IN ( SELECT "public"."get_user_box_ids"() AS "get_user_box_ids")) OR "public"."is_box_admin"(( SELECT "w"."box_id"
   FROM "public"."box_wods" "w"
  WHERE ("w"."id" = "wod_program_access"."wod_id")))));



ALTER TABLE "public"."wod_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wods_write" ON "public"."tournament_wods" USING (("tournament_id" IN ( SELECT "tournaments"."id"
   FROM "public"."tournaments"
  WHERE ("tournaments"."box_id" IN ( SELECT "boxes"."id"
           FROM "public"."boxes"
          WHERE ("boxes"."owner_id" = "auth"."uid"()))))));











ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."group_messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."_daily_official_template"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."_daily_official_template"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_daily_official_template"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_bracket_round"("p_tournament_id" "uuid", "p_completed_round" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."advance_bracket_round"("p_tournament_id" "uuid", "p_completed_round" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_bracket_round"("p_tournament_id" "uuid", "p_completed_round" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_inter_bracket_round"("p_competition_id" "uuid", "p_completed_round" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."advance_inter_bracket_round"("p_competition_id" "uuid", "p_completed_round" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_inter_bracket_round"("p_competition_id" "uuid", "p_completed_round" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_bracket_match_elo"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_bracket_match_elo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_bracket_match_elo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_assign_lowest_division"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_assign_lowest_division"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_assign_lowest_division"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."book_appointment_slot"("p_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_appointment_slot"("p_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_appointment_slot"("p_slot_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."box_subscribes_programming"("p_programming_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."box_subscribes_programming"("p_programming_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box_subscribes_programming"("p_programming_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_elo"("winner_elo" integer, "loser_elo" integer, "k_factor" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_elo"("winner_elo" integer, "loser_elo" integer, "k_factor" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_elo"("winner_elo" integer, "loser_elo" integer, "k_factor" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_join_daily_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_join_daily_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_join_daily_tournament"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_join_daily_tournament"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_join_inter_competition"("p_competition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_join_inter_competition"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_join_inter_competition"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_join_inter_competition"("p_competition_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_join_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_join_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_join_tournament"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_join_tournament"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_daily_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_daily_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_daily_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_weekly_limit"("p_user_id" "uuid", "p_box_id" "uuid", "p_target_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_daily_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_daily_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_daily_tournament"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_daily_tournament"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_box_elo"("p_wod_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_box_elo"("p_wod_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_box_elo"("p_wod_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_box_elo"("p_wod_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_daily_tournament_elo"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_daily_tournament_elo"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_daily_tournament_elo"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_daily_tournament_elo"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_inter_competition_elo"("p_competition_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_inter_competition_elo"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_inter_competition_elo"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_inter_competition_elo"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_inter_league_round"("p_competition_id" "uuid", "p_round_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_inter_league_round"("p_competition_id" "uuid", "p_round_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_inter_league_round"("p_competition_id" "uuid", "p_round_number" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_league_wod_elo"("p_tournament_wod_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_league_wod_elo"("p_tournament_wod_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_league_wod_elo"("p_tournament_wod_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_league_wod_elo"("p_tournament_wod_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_tournament_elo"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_tournament_elo"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_tournament_elo"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_tournament_elo"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_wod_elo"("p_wod_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_wod_elo"("p_wod_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_wod_elo"("p_wod_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_wod_elo"("p_wod_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_credit_on_reservation"() TO "anon";
GRANT ALL ON FUNCTION "public"."consume_credit_on_reservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_credit_on_reservation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."detect_trial_followups"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."detect_trial_followups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."end_season_and_advance"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_season_and_advance"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_season_and_advance"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_reservation_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_reservation_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_reservation_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_weekly_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_weekly_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_weekly_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_daily_official_wod"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_daily_official_wod"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_daily_official_wod"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_daily_official_wod"() TO "service_role";



GRANT ALL ON FUNCTION "public"."extend_all_class_schedules"() TO "anon";
GRANT ALL ON FUNCTION "public"."extend_all_class_schedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."extend_all_class_schedules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_message_group_members_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_message_group_members_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_message_group_members_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_message_group_members_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_message_group_members_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_message_group_members_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_bracket_round_1"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_bracket_round_1"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_bracket_round_1"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_class_schedules_from_templates"("p_box_id" "uuid", "p_weeks_ahead" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_class_schedules_from_templates"("p_box_id" "uuid", "p_weeks_ahead" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_class_schedules_from_templates"("p_box_id" "uuid", "p_weeks_ahead" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_inter_bracket_round_1"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_inter_bracket_round_1"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_inter_bracket_round_1"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_inter_pool_groups"("p_competition_id" "uuid", "p_groups_count" integer, "p_advance_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_inter_pool_groups"("p_competition_id" "uuid", "p_groups_count" integer, "p_advance_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_inter_pool_groups"("p_competition_id" "uuid", "p_groups_count" integer, "p_advance_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_inter_swiss_round"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_inter_swiss_round"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_inter_swiss_round"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_box_billing"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_box_billing"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_box_billing"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_box_dunning"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_box_dunning"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_box_dunning"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_box_mate_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_box_mate_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_box_mate_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_membership_billing"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_membership_billing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_membership_billing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_total_box_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_box_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_box_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tournament_participants"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tournament_participants"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tournament_participants"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tournament_validated_scores"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tournament_validated_scores"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tournament_validated_scores"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_box_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_box_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_box_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_box_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_box_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_box_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_movement_stats"("p_user_id" "uuid", "p_movement" "text", "p_reps" integer, "p_weight" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_movement_stats"("p_user_id" "uuid", "p_movement" "text", "p_reps" integer, "p_weight" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_movement_stats"("p_user_id" "uuid", "p_movement" "text", "p_reps" integer, "p_weight" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_blocked_pair"("u1" "uuid", "u2" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_blocked_pair"("u1" "uuid", "u2" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_blocked_pair"("u1" "uuid", "u2" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_admin"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_admin"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_admin"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_coach"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_coach"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_coach"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_member"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_member"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_member"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_owner"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_owner"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_owner"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_owner_member"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_owner_member"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_owner_member"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_box_staff"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_box_staff"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_box_staff"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_inter_competition_manager"("p_competition_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_inter_competition_manager"("p_competition_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_inter_competition_manager"("p_competition_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_privileged_backend"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_privileged_backend"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_privileged_backend"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_support_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_support_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_support_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tournament_manager"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tournament_manager"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tournament_manager"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_box_by_invite"("p_invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_box_by_invite"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_box_by_invite"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."manages_box"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."manages_box"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manages_box"("p_box_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."manages_box_funnel"("p_box_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."manages_box_funnel"("p_box_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manages_box_funnel"("p_box_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_box_programming"("p_target_monday" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_box_programming"("p_target_monday" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."owner_box_count"("p_owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."owner_box_count"("p_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."owner_box_count"("p_owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."peer_review_daily_score"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."peer_review_daily_score"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."peer_review_daily_score"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."peer_review_daily_score"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_action" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_client_box_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_client_box_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_client_box_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_client_subscription_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_client_subscription_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_client_subscription_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_relegate_divisions"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."promote_relegate_divisions"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_relegate_divisions"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_waiting_reservation"() TO "anon";
GRANT ALL ON FUNCTION "public"."promote_waiting_reservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_waiting_reservation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reactivate_box_member"("p_box_id" "uuid", "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reactivate_box_member"("p_box_id" "uuid", "p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reactivate_box_member"("p_box_id" "uuid", "p_member_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_division_points"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_division_points"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_division_points"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_credit_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."refund_credit_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_credit_on_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."release_reservations_on_revoke"() TO "anon";
GRANT ALL ON FUNCTION "public"."release_reservations_on_revoke"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_reservations_on_revoke"() TO "service_role";



GRANT ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_content"("p_content_type" "text", "p_content_id" "uuid", "p_reported_user_id" "uuid", "p_reason" "text", "p_details" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_inter_pool_match"("p_match_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_inter_pool_match"("p_match_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_inter_pool_match"("p_match_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_inter_swiss_pairing"("p_pairing_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_inter_swiss_pairing"("p_pairing_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_inter_swiss_pairing"("p_pairing_id" "uuid", "p_score1" numeric, "p_score2" numeric, "p_scoring_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_followup_feedback"("p_followup_id" "uuid", "p_rating" smallint, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_followup_feedback"("p_followup_id" "uuid", "p_rating" smallint, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_followup_feedback"("p_followup_id" "uuid", "p_rating" smallint, "p_comment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."support_touch_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."support_touch_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."support_touch_ticket"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_auth_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_auth_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_auth_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_member_plan_groups"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_member_plan_groups"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_member_plan_groups"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tournament_wods_set_season"() TO "anon";
GRANT ALL ON FUNCTION "public"."tournament_wods_set_season"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tournament_wods_set_season"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_recalc_division_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_recalc_division_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_recalc_division_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_box_member_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_box_member_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_box_member_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_box_subscription_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_box_subscription_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_box_subscription_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_elo_after_match"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_elo_after_match"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_elo_after_match"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inter_competitions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inter_competitions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inter_competitions_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_user_elo"("p_user_id" "uuid", "p_new_elo" integer, "p_increment_matches" integer, "p_increment_wins" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_user_elo"("p_user_id" "uuid", "p_new_elo" integer, "p_increment_matches" integer, "p_increment_wins" integer) TO "service_role";
























GRANT ALL ON TABLE "public"."app_changelog" TO "anon";
GRANT ALL ON TABLE "public"."app_changelog" TO "authenticated";
GRANT ALL ON TABLE "public"."app_changelog" TO "service_role";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_bookings" TO "anon";
GRANT ALL ON TABLE "public"."appointment_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_badges" TO "anon";
GRANT ALL ON TABLE "public"."athlete_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_badges" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_streaks" TO "anon";
GRANT ALL ON TABLE "public"."athlete_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_streaks" TO "service_role";



GRANT ALL ON TABLE "public"."badges_catalog" TO "anon";
GRANT ALL ON TABLE "public"."badges_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."badges_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."box_appointment_slots" TO "anon";
GRANT ALL ON TABLE "public"."box_appointment_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."box_appointment_slots" TO "service_role";



GRANT ALL ON TABLE "public"."box_article_comments" TO "anon";
GRANT ALL ON TABLE "public"."box_article_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."box_article_comments" TO "service_role";



GRANT ALL ON TABLE "public"."box_article_likes" TO "anon";
GRANT ALL ON TABLE "public"."box_article_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."box_article_likes" TO "service_role";



GRANT ALL ON TABLE "public"."box_articles" TO "anon";
GRANT ALL ON TABLE "public"."box_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."box_articles" TO "service_role";



GRANT ALL ON TABLE "public"."box_documents" TO "anon";
GRANT ALL ON TABLE "public"."box_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."box_documents" TO "service_role";



GRANT ALL ON TABLE "public"."box_elo" TO "anon";
GRANT ALL ON TABLE "public"."box_elo" TO "authenticated";
GRANT ALL ON TABLE "public"."box_elo" TO "service_role";



GRANT ALL ON TABLE "public"."box_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."box_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."box_elo_history" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."box_members" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."box_members" TO "authenticated";
GRANT ALL ON TABLE "public"."box_members" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("id") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("box_id") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("box_id") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("member_id") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("member_id") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("joined_at") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("joined_at") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("status") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("plan_id") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("plan_id") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("role") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("role") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("subscription_status") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("subscription_status") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("subscription_current_period_end") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("subscription_current_period_end") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("subscription_cancel_at_period_end") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("subscription_cancel_at_period_end") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("commitment_end_date") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("commitment_end_date") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("subscription_paused") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("subscription_paused") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("pause_started_at") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("pause_started_at") ON TABLE "public"."box_members" TO "authenticated";



GRANT SELECT("pause_resumes_at") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("pause_resumes_at") ON TABLE "public"."box_members" TO "authenticated";



GRANT ALL ON TABLE "public"."box_messages" TO "anon";
GRANT ALL ON TABLE "public"."box_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."box_messages" TO "service_role";



GRANT ALL ON TABLE "public"."box_notifications" TO "anon";
GRANT ALL ON TABLE "public"."box_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."box_notifications" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."box_programming" TO "anon";
GRANT ALL ON TABLE "public"."box_programming" TO "authenticated";
GRANT ALL ON TABLE "public"."box_programming" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."box_programming_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."box_programming_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."box_programming_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."box_programming_wods" TO "anon";
GRANT ALL ON TABLE "public"."box_programming_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."box_programming_wods" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."box_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."box_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."box_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."box_wods" TO "anon";
GRANT ALL ON TABLE "public"."box_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."box_wods" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."boxes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."boxes" TO "authenticated";
GRANT ALL ON TABLE "public"."boxes" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("owner_id") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("name") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("description") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("logo_url") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("is_active") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("daily_publish_hour") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("weekly_publish_day") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("weekly_publish_hour") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("address") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("website_url") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("contact_email") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("phone") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("google_maps_url") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("founded_at") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("city") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("postal_code") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("country") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("latitude") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("longitude") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("sport_type") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("services") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("cover_url") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("instagram_url") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("is_listed") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("tagline") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("opening_hours") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("member_count") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("slug") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("stripe_onboarding_complete") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("allowed_tournament_formats") ON TABLE "public"."boxes" TO "anon";



GRANT SELECT("terms_pdf_url") ON TABLE "public"."boxes" TO "anon";
GRANT SELECT("terms_pdf_url") ON TABLE "public"."boxes" TO "authenticated";



GRANT ALL ON TABLE "public"."changelog_reads" TO "anon";
GRANT ALL ON TABLE "public"."changelog_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."changelog_reads" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."class_reservations" TO "anon";
GRANT ALL ON TABLE "public"."class_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."class_reservations" TO "service_role";



GRANT ALL ON TABLE "public"."class_schedules" TO "anon";
GRANT ALL ON TABLE "public"."class_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."class_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."competition_participants" TO "anon";
GRANT ALL ON TABLE "public"."competition_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_participants" TO "service_role";



GRANT ALL ON TABLE "public"."competition_scores" TO "anon";
GRANT ALL ON TABLE "public"."competition_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_scores" TO "service_role";



GRANT ALL ON TABLE "public"."competitions" TO "anon";
GRANT ALL ON TABLE "public"."competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."competitions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tournament_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."daily_tournament_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tournament_elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tournament_participants" TO "anon";
GRANT ALL ON TABLE "public"."daily_tournament_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tournament_participants" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tournament_scores" TO "anon";
GRANT ALL ON TABLE "public"."daily_tournament_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tournament_scores" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tournaments" TO "anon";
GRANT ALL ON TABLE "public"."daily_tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."elo_history" TO "anon";
GRANT ALL ON TABLE "public"."elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "anon";
GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."generated_wod_scores" TO "anon";
GRANT ALL ON TABLE "public"."generated_wod_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_wod_scores" TO "service_role";



GRANT ALL ON TABLE "public"."generated_wods" TO "anon";
GRANT ALL ON TABLE "public"."generated_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_wods" TO "service_role";



GRANT ALL ON TABLE "public"."group_messages" TO "anon";
GRANT ALL ON TABLE "public"."group_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."group_messages" TO "service_role";



GRANT ALL ON TABLE "public"."inter_bracket_matches" TO "anon";
GRANT ALL ON TABLE "public"."inter_bracket_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_bracket_matches" TO "service_role";



GRANT ALL ON TABLE "public"."inter_competition_wods" TO "anon";
GRANT ALL ON TABLE "public"."inter_competition_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_competition_wods" TO "service_role";



GRANT ALL ON TABLE "public"."inter_competitions" TO "anon";
GRANT ALL ON TABLE "public"."inter_competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_competitions" TO "service_role";



GRANT ALL ON TABLE "public"."inter_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."inter_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."inter_league_rounds" TO "anon";
GRANT ALL ON TABLE "public"."inter_league_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_league_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."inter_league_standings" TO "anon";
GRANT ALL ON TABLE "public"."inter_league_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_league_standings" TO "service_role";



GRANT ALL ON TABLE "public"."inter_pool_groups" TO "anon";
GRANT ALL ON TABLE "public"."inter_pool_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_pool_groups" TO "service_role";



GRANT ALL ON TABLE "public"."inter_pool_matches" TO "anon";
GRANT ALL ON TABLE "public"."inter_pool_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_pool_matches" TO "service_role";



GRANT ALL ON TABLE "public"."inter_pool_members" TO "anon";
GRANT ALL ON TABLE "public"."inter_pool_members" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_pool_members" TO "service_role";



GRANT ALL ON TABLE "public"."inter_registrations" TO "anon";
GRANT ALL ON TABLE "public"."inter_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."inter_scores" TO "anon";
GRANT ALL ON TABLE "public"."inter_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_scores" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("username") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("level") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("role") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("elo") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_matches") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("wins") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("losses") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_scores_submitted") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_wods_generated") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_timer_sessions") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_messages_sent") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_tournaments") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_tournament_wins") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("total_friends") ON TABLE "public"."profiles" TO "anon";



GRANT SELECT("featured_badges") ON TABLE "public"."profiles" TO "anon";



GRANT ALL ON TABLE "public"."inter_standings" TO "anon";
GRANT ALL ON TABLE "public"."inter_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_standings" TO "service_role";



GRANT ALL ON TABLE "public"."inter_swiss_pairings" TO "anon";
GRANT ALL ON TABLE "public"."inter_swiss_pairings" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_swiss_pairings" TO "service_role";



GRANT ALL ON TABLE "public"."inter_swiss_rounds" TO "anon";
GRANT ALL ON TABLE "public"."inter_swiss_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_swiss_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."inter_swiss_standings" TO "anon";
GRANT ALL ON TABLE "public"."inter_swiss_standings" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_swiss_standings" TO "service_role";



GRANT ALL ON TABLE "public"."inter_team_members" TO "anon";
GRANT ALL ON TABLE "public"."inter_team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_team_members" TO "service_role";



GRANT ALL ON TABLE "public"."inter_teams" TO "anon";
GRANT ALL ON TABLE "public"."inter_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."inter_teams" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."matchmaking_queue" TO "anon";
GRANT ALL ON TABLE "public"."matchmaking_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."matchmaking_queue" TO "service_role";



GRANT ALL ON TABLE "public"."member_class_credits" TO "anon";
GRANT ALL ON TABLE "public"."member_class_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."member_class_credits" TO "service_role";



GRANT ALL ON TABLE "public"."membership_cancellation_requests" TO "anon";
GRANT ALL ON TABLE "public"."membership_cancellation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_cancellation_requests" TO "service_role";



GRANT ALL ON TABLE "public"."membership_plan_groups" TO "anon";
GRANT ALL ON TABLE "public"."membership_plan_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_plan_groups" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."membership_plans" TO "anon";
GRANT ALL ON TABLE "public"."membership_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_plans" TO "service_role";



GRANT ALL ON TABLE "public"."membership_promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."membership_promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_promo_codes" TO "service_role";



GRANT ALL ON TABLE "public"."message_groups" TO "anon";
GRANT ALL ON TABLE "public"."message_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."message_groups" TO "service_role";



GRANT ALL ON TABLE "public"."message_group_members" TO "anon";
GRANT ALL ON TABLE "public"."message_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."message_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."message_replies" TO "anon";
GRANT ALL ON TABLE "public"."message_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."message_replies" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."mini_tournaments" TO "anon";
GRANT ALL ON TABLE "public"."mini_tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."mini_tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."movement_logs" TO "anon";
GRANT ALL ON TABLE "public"."movement_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_logs" TO "service_role";



GRANT ALL ON TABLE "public"."movement_rep_counts" TO "anon";
GRANT ALL ON TABLE "public"."movement_rep_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_rep_counts" TO "service_role";



GRANT ALL ON TABLE "public"."movement_totals" TO "anon";
GRANT ALL ON TABLE "public"."movement_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_totals" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."owner_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."owner_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."owner_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."partners" TO "anon";
GRANT ALL ON TABLE "public"."partners" TO "authenticated";
GRANT ALL ON TABLE "public"."partners" TO "service_role";



GRANT ALL ON TABLE "public"."personal_records" TO "anon";
GRANT ALL ON TABLE "public"."personal_records" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_records" TO "service_role";



GRANT ALL ON TABLE "public"."physical_competitions" TO "anon";
GRANT ALL ON TABLE "public"."physical_competitions" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_competitions" TO "service_role";



GRANT ALL ON TABLE "public"."physical_wods" TO "anon";
GRANT ALL ON TABLE "public"."physical_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."physical_wods" TO "service_role";



GRANT ALL ON TABLE "public"."program_affiliates" TO "anon";
GRANT ALL ON TABLE "public"."program_affiliates" TO "authenticated";
GRANT ALL ON TABLE "public"."program_affiliates" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."program_members" TO "anon";
GRANT ALL ON TABLE "public"."program_members" TO "authenticated";
GRANT ALL ON TABLE "public"."program_members" TO "service_role";



GRANT ALL ON TABLE "public"."program_scores" TO "anon";
GRANT ALL ON TABLE "public"."program_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."program_scores" TO "service_role";



GRANT ALL ON TABLE "public"."program_wods" TO "anon";
GRANT ALL ON TABLE "public"."program_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."program_wods" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."public_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."public_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."public_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_templates" TO "anon";
GRANT ALL ON TABLE "public"."schedule_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_templates" TO "service_role";



GRANT ALL ON TABLE "public"."score_comments" TO "anon";
GRANT ALL ON TABLE "public"."score_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."score_comments" TO "service_role";



GRANT ALL ON TABLE "public"."score_reactions" TO "anon";
GRANT ALL ON TABLE "public"."score_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."score_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."scores" TO "anon";
GRANT ALL ON TABLE "public"."scores" TO "authenticated";
GRANT ALL ON TABLE "public"."scores" TO "service_role";



GRANT ALL ON TABLE "public"."session_followups" TO "anon";
GRANT ALL ON TABLE "public"."session_followups" TO "authenticated";
GRANT ALL ON TABLE "public"."session_followups" TO "service_role";



GRANT ALL ON TABLE "public"."support_admins" TO "anon";
GRANT ALL ON TABLE "public"."support_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."support_admins" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_bracket_matches" TO "anon";
GRANT ALL ON TABLE "public"."tournament_bracket_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_bracket_matches" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_division_members" TO "anon";
GRANT ALL ON TABLE "public"."tournament_division_members" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_division_members" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_divisions" TO "anon";
GRANT ALL ON TABLE "public"."tournament_divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_divisions" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."tournament_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_match_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."tournament_match_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_match_elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_participants" TO "anon";
GRANT ALL ON TABLE "public"."tournament_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_participants" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_scores" TO "anon";
GRANT ALL ON TABLE "public"."tournament_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_scores" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_season_history" TO "anon";
GRANT ALL ON TABLE "public"."tournament_season_history" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_season_history" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_wod_elo_history" TO "anon";
GRANT ALL ON TABLE "public"."tournament_wod_elo_history" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_wod_elo_history" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_wods" TO "anon";
GRANT ALL ON TABLE "public"."tournament_wods" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_wods" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."user_generation_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_generation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_generation_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_movement_prefs" TO "anon";
GRANT ALL ON TABLE "public"."user_movement_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_movement_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."user_movement_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_movement_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_movement_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_races" TO "anon";
GRANT ALL ON TABLE "public"."user_races" TO "authenticated";
GRANT ALL ON TABLE "public"."user_races" TO "service_role";



GRANT ALL ON TABLE "public"."user_wod_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_wod_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_wod_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."wod_completions" TO "anon";
GRANT ALL ON TABLE "public"."wod_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_completions" TO "service_role";



GRANT ALL ON TABLE "public"."wod_group_access" TO "anon";
GRANT ALL ON TABLE "public"."wod_group_access" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_group_access" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."wod_program_access" TO "anon";
GRANT ALL ON TABLE "public"."wod_program_access" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_program_access" TO "service_role";



GRANT ALL ON TABLE "public"."wod_scores" TO "anon";
GRANT ALL ON TABLE "public"."wod_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_scores" TO "service_role";



GRANT ALL ON TABLE "public"."wods" TO "anon";
GRANT ALL ON TABLE "public"."wods" TO "authenticated";
GRANT ALL ON TABLE "public"."wods" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- =====================================================================
-- GRANTS EXACTS — etat reel de la prod (tables et colonnes)
-- =====================================================================
-- pg_dump n'emet aucun REVOKE : sans ce bloc, les default privileges de
-- la stack Supabase (GRANT ALL sur toute table creee dans public)
-- redonneraient a anon/authenticated des droits que les lots 1B/2C/3B1
-- leur ont retires. On repart d'une ardoise vide, puis on rejoue les
-- privileges exactement tels qu'ils sont en production.

REVOKE ALL ON TABLE "public"."app_changelog" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."app_config" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."appointment_bookings" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."athlete_badges" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."athlete_streaks" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."badges_catalog" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_appointment_slots" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_article_comments" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_article_likes" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_articles" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_documents" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_elo" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_members" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_messages" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_notifications" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_programming" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_programming_subscriptions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_programming_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_subscriptions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."box_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."boxes" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."changelog_reads" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."class_reservations" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."class_schedules" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."competition_participants" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."competition_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."competitions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."daily_tournament_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."daily_tournament_participants" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."daily_tournament_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."daily_tournaments" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."event_registrations" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."events" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."friend_requests" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."friendships" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."generated_wod_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."generated_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."group_messages" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_bracket_matches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_competition_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_competitions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_league_rounds" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_league_standings" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_pool_groups" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_pool_matches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_pool_members" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_registrations" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_swiss_pairings" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_swiss_rounds" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_swiss_standings" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_team_members" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."inter_teams" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."matches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."matchmaking_queue" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."member_class_credits" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."membership_cancellation_requests" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."membership_plan_groups" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."membership_plans" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."membership_promo_codes" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."message_groups" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."message_reactions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."message_replies" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."messages" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."mini_tournaments" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."movement_logs" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."movement_rep_counts" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."notification_preferences" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."owner_subscriptions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."partners" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."personal_records" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."physical_competitions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."physical_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."profiles" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."program_affiliates" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."program_members" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."program_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."program_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."programs" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."push_tokens" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."reports" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."schedule_templates" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."score_comments" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."score_reactions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."session_followups" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."support_admins" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."support_messages" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."support_tickets" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_bracket_matches" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_division_members" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_divisions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_match_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_participants" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_season_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_wod_elo_history" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournament_wods" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."tournaments" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_blocks" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_generation_settings" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_movement_prefs" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_movement_stats" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_races" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."user_wod_feedback" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wod_completions" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wod_group_access" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wod_program_access" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wod_scores" FROM "anon", "authenticated", "service_role";
REVOKE ALL ON TABLE "public"."wods" FROM "anon", "authenticated", "service_role";

GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_changelog" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_changelog" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_changelog" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."app_config" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."appointment_bookings" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."appointment_bookings" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."appointment_bookings" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_badges" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_badges" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_badges" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_streaks" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_streaks" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."athlete_streaks" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."badges_catalog" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."badges_catalog" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."badges_catalog" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_appointment_slots" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_appointment_slots" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_appointment_slots" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_comments" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_comments" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_comments" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_likes" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_likes" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_article_likes" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_articles" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_articles" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_articles" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_documents" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_documents" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_documents" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_elo_history" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."box_members" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_members" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_members" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_messages" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_messages" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_messages" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_notifications" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_notifications" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_notifications" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."box_programming" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."box_programming_subscriptions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming_subscriptions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming_subscriptions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_programming_wods" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."box_subscriptions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_subscriptions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_subscriptions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."box_wods" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."boxes" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,SELECT,UPDATE ON TABLE "public"."boxes" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."boxes" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."changelog_reads" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."changelog_reads" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."changelog_reads" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."class_reservations" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."class_reservations" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."class_reservations" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."class_schedules" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."class_schedules" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."class_schedules" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_participants" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_participants" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_participants" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competition_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."competitions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_participants" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_participants" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_participants" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournament_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournaments" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournaments" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."daily_tournaments" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."event_registrations" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."event_registrations" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."event_registrations" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."events" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."events" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."events" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friend_requests" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friend_requests" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friend_requests" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friendships" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friendships" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."friendships" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wod_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wod_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wod_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."generated_wods" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_messages" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_messages" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."group_messages" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_bracket_matches" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_bracket_matches" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_bracket_matches" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competition_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competition_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competition_wods" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competitions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competitions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_competitions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_rounds" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_rounds" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_rounds" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_standings" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_standings" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_league_standings" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_groups" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_groups" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_groups" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_matches" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_matches" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_matches" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_members" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_members" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_pool_members" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_registrations" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_registrations" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_registrations" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_pairings" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_pairings" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_pairings" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_rounds" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_rounds" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_rounds" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_standings" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_standings" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_swiss_standings" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_team_members" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_team_members" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_team_members" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_teams" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_teams" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."inter_teams" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matches" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matches" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matches" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matchmaking_queue" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matchmaking_queue" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."matchmaking_queue" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."member_class_credits" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."member_class_credits" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."member_class_credits" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_cancellation_requests" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_cancellation_requests" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_cancellation_requests" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_plan_groups" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_plan_groups" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_plan_groups" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."membership_plans" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_plans" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_plans" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_promo_codes" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_promo_codes" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."membership_promo_codes" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_groups" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_groups" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_groups" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_reactions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_reactions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_reactions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_replies" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_replies" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."message_replies" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."messages" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mini_tournaments" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mini_tournaments" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."mini_tournaments" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_logs" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_logs" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_logs" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_rep_counts" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_rep_counts" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."movement_rep_counts" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notification_preferences" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."notification_preferences" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."owner_subscriptions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."owner_subscriptions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."owner_subscriptions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."partners" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."partners" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."partners" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."personal_records" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."personal_records" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."personal_records" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_competitions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_competitions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_competitions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."physical_wods" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT INSERT,MAINTAIN,SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_affiliates" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_affiliates" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_affiliates" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."program_members" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_members" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_members" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."program_wods" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."programs" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."programs" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."programs" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."push_tokens" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."push_tokens" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."push_tokens" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."reports" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."reports" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."reports" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."schedule_templates" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."schedule_templates" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."schedule_templates" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_comments" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_comments" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_comments" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_reactions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_reactions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."score_reactions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."session_followups" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."session_followups" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."session_followups" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_admins" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_admins" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_admins" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_messages" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_messages" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_messages" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_tickets" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_tickets" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."support_tickets" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_bracket_matches" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_bracket_matches" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_bracket_matches" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_division_members" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_division_members" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_division_members" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_divisions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_divisions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_divisions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_match_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_match_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_match_elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_participants" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_participants" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_participants" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_season_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_season_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_season_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wod_elo_history" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wod_elo_history" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wod_elo_history" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournament_wods" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournaments" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournaments" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."tournaments" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_blocks" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_blocks" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_blocks" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_generation_settings" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_generation_settings" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_generation_settings" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_prefs" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_prefs" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_prefs" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_stats" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_stats" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_movement_stats" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_races" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_races" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_races" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_wod_feedback" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_wod_feedback" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."user_wod_feedback" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_completions" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_completions" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_completions" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_group_access" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_group_access" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_group_access" TO "service_role";
GRANT MAINTAIN,SELECT ON TABLE "public"."wod_program_access" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_program_access" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_program_access" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_scores" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_scores" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wod_scores" TO "service_role";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wods" TO "anon";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wods" TO "authenticated";
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."wods" TO "service_role";

GRANT SELECT("box_id", "commitment_end_date", "id", "joined_at", "member_id", "pause_resumes_at", "pause_started_at", "plan_id", "role", "status", "subscription_cancel_at_period_end", "subscription_current_period_end", "subscription_paused", "subscription_status") ON TABLE "public"."box_members" TO "anon";
GRANT SELECT("box_id", "commitment_end_date", "id", "joined_at", "member_id", "pause_resumes_at", "pause_started_at", "plan_id", "role", "status", "subscription_cancel_at_period_end", "subscription_current_period_end", "subscription_paused", "subscription_status") ON TABLE "public"."box_members" TO "authenticated";
GRANT SELECT("address", "allowed_tournament_formats", "city", "contact_email", "country", "cover_url", "created_at", "daily_publish_hour", "description", "founded_at", "google_maps_url", "id", "instagram_url", "is_active", "is_listed", "latitude", "logo_url", "longitude", "member_count", "name", "opening_hours", "owner_id", "phone", "postal_code", "services", "slug", "sport_type", "stripe_onboarding_complete", "tagline", "terms_pdf_url", "website_url", "weekly_publish_day", "weekly_publish_hour") ON TABLE "public"."boxes" TO "anon";
GRANT SELECT("terms_pdf_url") ON TABLE "public"."boxes" TO "authenticated";
GRANT SELECT("avatar_url", "created_at", "elo", "featured_badges", "id", "level", "losses", "role", "total_friends", "total_matches", "total_messages_sent", "total_scores_submitted", "total_timer_sessions", "total_tournament_wins", "total_tournaments", "total_wods_generated", "username", "wins") ON TABLE "public"."profiles" TO "anon";

-- Routines : EXECUTE exactement tel qu'en production.

REVOKE ALL ON ROUTINE public._daily_official_template(date) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.advance_bracket_round(uuid,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.advance_inter_bracket_round(uuid,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.apply_bracket_match_elo() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.auto_assign_lowest_division() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.book_appointment_slot(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.box_subscribes_programming(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.calculate_elo(integer,integer,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.can_join_daily_tournament(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.can_join_inter_competition(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.can_join_tournament(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.check_daily_limit(uuid,uuid,date) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.check_weekly_limit(uuid,uuid,date) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.check_weekly_limit(uuid,uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.complete_daily_tournament(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_box_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_daily_tournament_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_inter_competition_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_inter_league_round(uuid,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_league_wod_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_tournament_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.compute_wod_elo(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.consume_credit_on_reservation() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.delete_user_account() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.detect_trial_followups() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.end_season_and_advance(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.enforce_reservation_capacity() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.enforce_weekly_limit() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.ensure_daily_official_wod() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.extend_all_class_schedules() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.fn_message_group_members_delete() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.fn_message_group_members_insert() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.generate_bracket_round_1(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.generate_class_schedules_from_templates(uuid,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.generate_inter_bracket_round_1(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.generate_inter_pool_groups(uuid,integer,integer) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.generate_inter_swiss_round(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_box_billing(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_box_dunning(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_box_mate_ids() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_my_membership_billing() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_total_box_count() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_tournament_participants(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_tournament_validated_scores(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_user_box_id() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.get_user_box_ids() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.increment_movement_stats(uuid,text,integer,numeric) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_blocked_pair(uuid,uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_admin(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_coach(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_member(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_owner_member(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_owner(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_box_staff(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_inter_competition_manager(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_privileged_backend() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_super_admin() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_support_admin() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.is_tournament_manager(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.join_box_by_invite(text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.manages_box_funnel(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.manages_box(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.materialize_box_programming(date) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.owner_box_count(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.peer_review_daily_score(uuid,uuid,text,text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.prevent_client_box_insert() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.prevent_client_subscription_write() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.prevent_role_escalation() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.promote_relegate_divisions(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.promote_waiting_reservation() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.reactivate_box_member(uuid,uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.recalc_division_points(uuid) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.refund_credit_on_cancel() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.release_reservations_on_revoke() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.report_content(text,uuid,uuid,text,text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.resolve_inter_pool_match(uuid,numeric,numeric,text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.resolve_inter_swiss_pairing(uuid,numeric,numeric,text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.submit_followup_feedback(uuid,smallint,text) FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.support_touch_ticket() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.sync_auth_email() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.sync_member_plan_groups() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.tournament_wods_set_season() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.trg_recalc_division_points() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.update_box_member_count() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.update_box_subscription_updated_at() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.update_elo_after_match() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.update_inter_competitions_updated_at() FROM "anon", "authenticated", "service_role";
REVOKE ALL ON ROUTINE public.update_user_elo(uuid,integer,integer,integer) FROM "anon", "authenticated", "service_role";

GRANT EXECUTE ON ROUTINE public._daily_official_template(date) TO "anon";
GRANT EXECUTE ON ROUTINE public._daily_official_template(date) TO "authenticated";
GRANT EXECUTE ON ROUTINE public._daily_official_template(date) TO "service_role";
GRANT EXECUTE ON ROUTINE public.advance_bracket_round(uuid,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.advance_bracket_round(uuid,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.advance_bracket_round(uuid,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.advance_inter_bracket_round(uuid,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.advance_inter_bracket_round(uuid,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.advance_inter_bracket_round(uuid,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.apply_bracket_match_elo() TO "anon";
GRANT EXECUTE ON ROUTINE public.apply_bracket_match_elo() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.apply_bracket_match_elo() TO "service_role";
GRANT EXECUTE ON ROUTINE public.auto_assign_lowest_division() TO "anon";
GRANT EXECUTE ON ROUTINE public.auto_assign_lowest_division() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.auto_assign_lowest_division() TO "service_role";
GRANT EXECUTE ON ROUTINE public.book_appointment_slot(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.book_appointment_slot(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.box_subscribes_programming(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.box_subscribes_programming(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.calculate_elo(integer,integer,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.calculate_elo(integer,integer,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.calculate_elo(integer,integer,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.can_join_daily_tournament(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.can_join_daily_tournament(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.can_join_daily_tournament(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.can_join_inter_competition(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.can_join_inter_competition(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.can_join_inter_competition(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.can_join_tournament(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.can_join_tournament(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.can_join_tournament(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.check_daily_limit(uuid,uuid,date) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.check_daily_limit(uuid,uuid,date) TO "service_role";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid,date) TO "anon";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid,date) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.check_weekly_limit(uuid,uuid,date) TO "service_role";
GRANT EXECUTE ON ROUTINE public.complete_daily_tournament(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.complete_daily_tournament(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.complete_daily_tournament(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_box_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_box_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_box_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_daily_tournament_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_daily_tournament_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_daily_tournament_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_inter_competition_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_inter_competition_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_inter_competition_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_inter_league_round(uuid,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_inter_league_round(uuid,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_inter_league_round(uuid,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_league_wod_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_league_wod_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_league_wod_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_tournament_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_tournament_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_tournament_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.compute_wod_elo(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.compute_wod_elo(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.compute_wod_elo(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.consume_credit_on_reservation() TO "anon";
GRANT EXECUTE ON ROUTINE public.consume_credit_on_reservation() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.consume_credit_on_reservation() TO "service_role";
GRANT EXECUTE ON ROUTINE public.delete_user_account() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.delete_user_account() TO "service_role";
GRANT EXECUTE ON ROUTINE public.detect_trial_followups() TO "service_role";
GRANT EXECUTE ON ROUTINE public.end_season_and_advance(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.end_season_and_advance(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.end_season_and_advance(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.enforce_reservation_capacity() TO "anon";
GRANT EXECUTE ON ROUTINE public.enforce_reservation_capacity() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.enforce_reservation_capacity() TO "service_role";
GRANT EXECUTE ON ROUTINE public.enforce_weekly_limit() TO "anon";
GRANT EXECUTE ON ROUTINE public.enforce_weekly_limit() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.enforce_weekly_limit() TO "service_role";
GRANT EXECUTE ON ROUTINE public.ensure_daily_official_wod() TO "anon";
GRANT EXECUTE ON ROUTINE public.ensure_daily_official_wod() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.ensure_daily_official_wod() TO "service_role";
GRANT EXECUTE ON ROUTINE public.extend_all_class_schedules() TO "anon";
GRANT EXECUTE ON ROUTINE public.extend_all_class_schedules() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.extend_all_class_schedules() TO "service_role";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_delete() TO "anon";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_delete() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_delete() TO "service_role";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_insert() TO "anon";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_insert() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.fn_message_group_members_insert() TO "service_role";
GRANT EXECUTE ON ROUTINE public.generate_bracket_round_1(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.generate_bracket_round_1(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.generate_bracket_round_1(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.generate_class_schedules_from_templates(uuid,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.generate_class_schedules_from_templates(uuid,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.generate_class_schedules_from_templates(uuid,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.generate_inter_bracket_round_1(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.generate_inter_bracket_round_1(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.generate_inter_bracket_round_1(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.generate_inter_pool_groups(uuid,integer,integer) TO "anon";
GRANT EXECUTE ON ROUTINE public.generate_inter_pool_groups(uuid,integer,integer) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.generate_inter_pool_groups(uuid,integer,integer) TO "service_role";
GRANT EXECUTE ON ROUTINE public.generate_inter_swiss_round(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.generate_inter_swiss_round(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.generate_inter_swiss_round(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_box_billing(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.get_box_billing(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_box_billing(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_box_dunning(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.get_box_dunning(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_box_dunning(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_box_mate_ids() TO "anon";
GRANT EXECUTE ON ROUTINE public.get_box_mate_ids() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_box_mate_ids() TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_my_membership_billing() TO "anon";
GRANT EXECUTE ON ROUTINE public.get_my_membership_billing() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_my_membership_billing() TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_total_box_count() TO "anon";
GRANT EXECUTE ON ROUTINE public.get_total_box_count() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_total_box_count() TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_tournament_participants(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.get_tournament_participants(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_tournament_participants(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_tournament_validated_scores(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.get_tournament_validated_scores(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_tournament_validated_scores(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_user_box_id() TO "anon";
GRANT EXECUTE ON ROUTINE public.get_user_box_id() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_user_box_id() TO "service_role";
GRANT EXECUTE ON ROUTINE public.get_user_box_ids() TO "anon";
GRANT EXECUTE ON ROUTINE public.get_user_box_ids() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.get_user_box_ids() TO "service_role";
GRANT EXECUTE ON ROUTINE public.increment_movement_stats(uuid,text,integer,numeric) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.increment_movement_stats(uuid,text,integer,numeric) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_blocked_pair(uuid,uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_blocked_pair(uuid,uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_blocked_pair(uuid,uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_admin(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_admin(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_admin(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_coach(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_coach(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_coach(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_member(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_member(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_member(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_owner(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_owner(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_owner(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_owner_member(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_owner_member(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_owner_member(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_box_staff(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_box_staff(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_box_staff(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_inter_competition_manager(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_inter_competition_manager(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_inter_competition_manager(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_privileged_backend() TO "anon";
GRANT EXECUTE ON ROUTINE public.is_privileged_backend() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_privileged_backend() TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_super_admin() TO "anon";
GRANT EXECUTE ON ROUTINE public.is_super_admin() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_super_admin() TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_support_admin() TO "anon";
GRANT EXECUTE ON ROUTINE public.is_support_admin() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_support_admin() TO "service_role";
GRANT EXECUTE ON ROUTINE public.is_tournament_manager(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.is_tournament_manager(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.is_tournament_manager(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.join_box_by_invite(text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.join_box_by_invite(text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.manages_box(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.manages_box(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.manages_box(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.manages_box_funnel(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.manages_box_funnel(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.manages_box_funnel(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.materialize_box_programming(date) TO "service_role";
GRANT EXECUTE ON ROUTINE public.owner_box_count(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.owner_box_count(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.peer_review_daily_score(uuid,uuid,text,text) TO "anon";
GRANT EXECUTE ON ROUTINE public.peer_review_daily_score(uuid,uuid,text,text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.peer_review_daily_score(uuid,uuid,text,text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.prevent_client_box_insert() TO "anon";
GRANT EXECUTE ON ROUTINE public.prevent_client_box_insert() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.prevent_client_box_insert() TO "service_role";
GRANT EXECUTE ON ROUTINE public.prevent_client_subscription_write() TO "anon";
GRANT EXECUTE ON ROUTINE public.prevent_client_subscription_write() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.prevent_client_subscription_write() TO "service_role";
GRANT EXECUTE ON ROUTINE public.prevent_role_escalation() TO "anon";
GRANT EXECUTE ON ROUTINE public.prevent_role_escalation() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.prevent_role_escalation() TO "service_role";
GRANT EXECUTE ON ROUTINE public.promote_relegate_divisions(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.promote_relegate_divisions(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.promote_relegate_divisions(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.promote_waiting_reservation() TO "anon";
GRANT EXECUTE ON ROUTINE public.promote_waiting_reservation() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.promote_waiting_reservation() TO "service_role";
GRANT EXECUTE ON ROUTINE public.reactivate_box_member(uuid,uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.reactivate_box_member(uuid,uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.recalc_division_points(uuid) TO "anon";
GRANT EXECUTE ON ROUTINE public.recalc_division_points(uuid) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.recalc_division_points(uuid) TO "service_role";
GRANT EXECUTE ON ROUTINE public.refund_credit_on_cancel() TO "anon";
GRANT EXECUTE ON ROUTINE public.refund_credit_on_cancel() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.refund_credit_on_cancel() TO "service_role";
GRANT EXECUTE ON ROUTINE public.release_reservations_on_revoke() TO "anon";
GRANT EXECUTE ON ROUTINE public.release_reservations_on_revoke() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.release_reservations_on_revoke() TO "service_role";
GRANT EXECUTE ON ROUTINE public.report_content(text,uuid,uuid,text,text) TO "anon";
GRANT EXECUTE ON ROUTINE public.report_content(text,uuid,uuid,text,text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.report_content(text,uuid,uuid,text,text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.resolve_inter_pool_match(uuid,numeric,numeric,text) TO "anon";
GRANT EXECUTE ON ROUTINE public.resolve_inter_pool_match(uuid,numeric,numeric,text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.resolve_inter_pool_match(uuid,numeric,numeric,text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.resolve_inter_swiss_pairing(uuid,numeric,numeric,text) TO "anon";
GRANT EXECUTE ON ROUTINE public.resolve_inter_swiss_pairing(uuid,numeric,numeric,text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.resolve_inter_swiss_pairing(uuid,numeric,numeric,text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.submit_followup_feedback(uuid,smallint,text) TO "authenticated";
GRANT EXECUTE ON ROUTINE public.submit_followup_feedback(uuid,smallint,text) TO "service_role";
GRANT EXECUTE ON ROUTINE public.support_touch_ticket() TO "anon";
GRANT EXECUTE ON ROUTINE public.support_touch_ticket() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.support_touch_ticket() TO "service_role";
GRANT EXECUTE ON ROUTINE public.sync_auth_email() TO "anon";
GRANT EXECUTE ON ROUTINE public.sync_auth_email() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.sync_auth_email() TO "service_role";
GRANT EXECUTE ON ROUTINE public.sync_member_plan_groups() TO "anon";
GRANT EXECUTE ON ROUTINE public.sync_member_plan_groups() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.sync_member_plan_groups() TO "service_role";
GRANT EXECUTE ON ROUTINE public.tournament_wods_set_season() TO "anon";
GRANT EXECUTE ON ROUTINE public.tournament_wods_set_season() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.tournament_wods_set_season() TO "service_role";
GRANT EXECUTE ON ROUTINE public.trg_recalc_division_points() TO "anon";
GRANT EXECUTE ON ROUTINE public.trg_recalc_division_points() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.trg_recalc_division_points() TO "service_role";
GRANT EXECUTE ON ROUTINE public.update_box_member_count() TO "anon";
GRANT EXECUTE ON ROUTINE public.update_box_member_count() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.update_box_member_count() TO "service_role";
GRANT EXECUTE ON ROUTINE public.update_box_subscription_updated_at() TO "anon";
GRANT EXECUTE ON ROUTINE public.update_box_subscription_updated_at() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.update_box_subscription_updated_at() TO "service_role";
GRANT EXECUTE ON ROUTINE public.update_elo_after_match() TO "anon";
GRANT EXECUTE ON ROUTINE public.update_elo_after_match() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.update_elo_after_match() TO "service_role";
GRANT EXECUTE ON ROUTINE public.update_inter_competitions_updated_at() TO "anon";
GRANT EXECUTE ON ROUTINE public.update_inter_competitions_updated_at() TO "authenticated";
GRANT EXECUTE ON ROUTINE public.update_inter_competitions_updated_at() TO "service_role";
GRANT EXECUTE ON ROUTINE public.update_user_elo(uuid,integer,integer,integer) TO "service_role";


-- =====================================================================
-- STORAGE — buckets et policies (etat reel de la prod)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('asset', 'asset', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assets', 'assets', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('box-logos', 'box-logos', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('box-program-images', 'box-program-images', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cancellation-docs', 'cancellation-docs', false, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('message-attachments', 'message-attachments', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-logos', 'partner-logos', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('program-images', 'program-images', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tournament-banners', 'tournament-banners', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can update tournament banners" ON "storage"."objects";
DROP POLICY IF EXISTS "Authenticated users can upload tournament banners" ON "storage"."objects";
DROP POLICY IF EXISTS "Public read access for tournament banners" ON "storage"."objects";
DROP POLICY IF EXISTS "admin_delete_partner_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "admin_update_partner_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "admin_upload_partner_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "anyone_read_prog_images" ON "storage"."objects";
DROP POLICY IF EXISTS "assets_admin_delete" ON "storage"."objects";
DROP POLICY IF EXISTS "assets_admin_insert" ON "storage"."objects";
DROP POLICY IF EXISTS "assets_admin_update" ON "storage"."objects";
DROP POLICY IF EXISTS "assets_public_read" ON "storage"."objects";
DROP POLICY IF EXISTS "auth_upload_attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_owner_delete" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_owner_insert" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_owner_update" ON "storage"."objects";
DROP POLICY IF EXISTS "avatars_public_read" ON "storage"."objects";
DROP POLICY IF EXISTS "box_owner_delete_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "box_owner_update_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "box_owner_upload_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "documents_delete_own" ON "storage"."objects";
DROP POLICY IF EXISTS "documents_insert_own" ON "storage"."objects";
DROP POLICY IF EXISTS "owner_delete_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "owner_delete_prog_images" ON "storage"."objects";
DROP POLICY IF EXISTS "owner_update_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "owner_upload_logo" ON "storage"."objects";
DROP POLICY IF EXISTS "owner_upload_prog_images" ON "storage"."objects";
DROP POLICY IF EXISTS "public_read_attachments" ON "storage"."objects";
DROP POLICY IF EXISTS "public_read_box_logos" ON "storage"."objects";
DROP POLICY IF EXISTS "public_read_documents" ON "storage"."objects";
DROP POLICY IF EXISTS "public_read_logos" ON "storage"."objects";
DROP POLICY IF EXISTS "public_read_partner_logos" ON "storage"."objects";

CREATE POLICY "Authenticated users can update tournament banners" ON "storage"."objects" FOR UPDATE TO "authenticated" USING (("bucket_id" = 'tournament-banners'::"text"));
CREATE POLICY "Authenticated users can upload tournament banners" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'tournament-banners'::"text"));
CREATE POLICY "Public read access for tournament banners" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'tournament-banners'::"text"));
CREATE POLICY "admin_delete_partner_logo" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'partner-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "admin_update_partner_logo" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'partner-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "admin_upload_partner_logo" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'partner-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "anyone_read_prog_images" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'program-images'::"text"));
CREATE POLICY "assets_admin_delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'assets'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));
CREATE POLICY "assets_admin_insert" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'assets'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));
CREATE POLICY "assets_admin_update" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'assets'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['super_admin'::"text", 'admin'::"text"])))))));
CREATE POLICY "assets_public_read" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'assets'::"text"));
CREATE POLICY "auth_upload_attachments" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'message-attachments'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "avatars_owner_delete" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "avatars_owner_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "avatars_owner_update" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "avatars_public_read" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'avatars'::"text"));
CREATE POLICY "box_owner_delete_logo" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'box-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "box_owner_update_logo" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'box-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "box_owner_upload_logo" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'box-logos'::"text") AND ("auth"."uid"() IS NOT NULL)));
CREATE POLICY "documents_delete_own" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'documents'::"text") AND (("owner" = "auth"."uid"()) OR (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))));
CREATE POLICY "documents_insert_own" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'documents'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));
CREATE POLICY "owner_delete_logo" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'box-logos'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("boxes"."id")::"text" AS "id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));
CREATE POLICY "owner_delete_prog_images" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'program-images'::"text") AND ("auth"."uid"() IN ( SELECT "boxes"."owner_id"
   FROM "public"."boxes"
  WHERE ("boxes"."is_active" = true)))));
CREATE POLICY "owner_update_logo" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'box-logos'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("boxes"."id")::"text" AS "id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));
CREATE POLICY "owner_upload_logo" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'box-logos'::"text") AND (("storage"."foldername"("name"))[1] IN ( SELECT ("boxes"."id")::"text" AS "id"
   FROM "public"."boxes"
  WHERE ("boxes"."owner_id" = "auth"."uid"())))));
CREATE POLICY "owner_upload_prog_images" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'program-images'::"text") AND ("auth"."uid"() IN ( SELECT "boxes"."owner_id"
   FROM "public"."boxes"
  WHERE ("boxes"."is_active" = true)))));
CREATE POLICY "public_read_attachments" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'message-attachments'::"text"));
CREATE POLICY "public_read_box_logos" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'box-logos'::"text"));
CREATE POLICY "public_read_documents" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'documents'::"text"));
CREATE POLICY "public_read_logos" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'box-logos'::"text"));
CREATE POLICY "public_read_partner_logos" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'partner-logos'::"text"));

