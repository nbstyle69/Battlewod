-- ═══════════════════════════════════════════════════════════════════════
-- Fix RLS policies for tournament formats v2 (17 mai 2026)
-- Bug: 'Tournoi créé mais divisions: new row violates row-level security
--      policy for table "tournament_divisions"'
--
-- Cause: previous policies only checked box_members.role IN ('owner','coach')
-- but the canonical box-owner check used everywhere else is:
--   - boxes.owner_id = auth.uid()  (primary owner)
--   - OR box_members(role='owner', status='active')  (co-owner)
--   - OR profiles.role IN ('admin','super_admin','box_owner')
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: is_box_admin(box_id) — TRUE if current auth user can manage box
CREATE OR REPLACE FUNCTION public.is_box_admin(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_box_admin(uuid) TO authenticated, service_role;

-- ── tournament_bracket_matches ─────────────────────────────────────────
DROP POLICY IF EXISTS "bracket_matches_read"        ON public.tournament_bracket_matches;
DROP POLICY IF EXISTS "bracket_matches_owner_admin" ON public.tournament_bracket_matches;

CREATE POLICY "bracket_matches_read" ON public.tournament_bracket_matches
  FOR SELECT USING (true);

CREATE POLICY "bracket_matches_owner_admin" ON public.tournament_bracket_matches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_bracket_matches.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_bracket_matches.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournament_divisions ───────────────────────────────────────────────
DROP POLICY IF EXISTS "divisions_read"        ON public.tournament_divisions;
DROP POLICY IF EXISTS "divisions_owner_admin" ON public.tournament_divisions;

CREATE POLICY "divisions_read" ON public.tournament_divisions
  FOR SELECT USING (true);

CREATE POLICY "divisions_owner_admin" ON public.tournament_divisions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_divisions.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_divisions.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournament_division_members ────────────────────────────────────────
DROP POLICY IF EXISTS "division_members_read"        ON public.tournament_division_members;
DROP POLICY IF EXISTS "division_members_owner_admin" ON public.tournament_division_members;

CREATE POLICY "division_members_read" ON public.tournament_division_members
  FOR SELECT USING (true);

CREATE POLICY "division_members_owner_admin" ON public.tournament_division_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_divisions d
      JOIN public.tournaments t ON t.id = d.tournament_id
      WHERE d.id = tournament_division_members.division_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_divisions d
      JOIN public.tournaments t ON t.id = d.tournament_id
      WHERE d.id = tournament_division_members.division_id
        AND public.is_box_admin(t.box_id)
    )
  );
