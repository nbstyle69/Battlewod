-- Security hardening (audit P1): pin search_path on SECURITY DEFINER functions.
--
-- 30 SECURITY DEFINER functions had no `search_path` set. A SECURITY DEFINER
-- function without a fixed search_path can be hijacked: a caller who controls a
-- schema earlier in their search_path (e.g. a temp schema) can shadow an
-- unqualified table/function name the function relies on, and have it execute
-- with the definer's (elevated) privileges. This is especially dangerous for the
-- authorization helpers (is_box_owner / is_super_admin / is_box_member ...), which
-- gate RLS policies across the schema.
--
-- Fix: pin `search_path = public, pg_temp` on each. These functions reference
-- public objects unqualified (resolved via `public`) and cross-schema objects
-- schema-qualified (e.g. auth.uid()), so pinning is non-breaking. pg_temp is kept
-- last so a temp object can never shadow a public one.

BEGIN;

ALTER FUNCTION public.advance_bracket_round(p_tournament_id uuid, p_completed_round integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.advance_inter_bracket_round(p_competition_id uuid, p_completed_round integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_daily_limit(p_user_id uuid, p_box_id uuid, p_date date) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_weekly_limit(p_user_id uuid, p_box_id uuid, p_target_date date) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_weekly_limit(p_user_id uuid, p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_inter_league_round(p_competition_id uuid, p_round_number integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.end_season_and_advance(p_tournament_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_message_group_members_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_message_group_members_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_bracket_round_1(p_tournament_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_inter_bracket_round_1(p_competition_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_inter_pool_groups(p_competition_id uuid, p_groups_count integer, p_advance_count integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_inter_swiss_round(p_competition_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_box_mate_ids() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_total_box_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_box_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_box_ids() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_movement_stats(p_user_id uuid, p_movement text, p_reps integer, p_weight numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_box_admin(p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_box_coach(p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_box_member(p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_box_owner(p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_box_owner_member(p_box_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_super_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.promote_relegate_divisions(p_tournament_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.promote_waiting_reservation() SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_inter_pool_match(p_match_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_inter_swiss_pairing(p_pairing_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_box_member_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_elo_after_match() SET search_path = public, pg_temp;

COMMIT;
