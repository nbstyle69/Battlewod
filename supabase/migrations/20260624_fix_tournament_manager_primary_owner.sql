-- ═══════════════════════════════════════════════════════════════════════
-- Fix: is_tournament_manager must use the canonical box-admin check
--
-- Bug: generate_bracket_round_1 / advance_bracket_round /
-- promote_relegate_divisions / end_season_and_advance all guard on
-- is_tournament_manager(), which only accepted
--   box_members.role IN ('owner','coach').
-- But the canonical ownership check used everywhere else (is_box_admin,
-- getOwnerBox, and the tournament-table RLS) also recognizes:
--   - boxes.owner_id = auth.uid()                         (primary owner)
--   - profiles.role IN ('admin','super_admin','box_owner')
-- A primary box owner typically has NO box_members row, so they could open
-- the back-office and edit bracket matches (RLS = is_box_admin) yet were
-- rejected by the RPCs → "Not authorized …" when generating a round.
--
-- Fix: delegate is_tournament_manager to is_box_admin so RPC guards match RLS.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_tournament_manager(p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = p_tournament_id
      AND public.is_box_admin(t.box_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_tournament_manager(uuid) TO authenticated;
