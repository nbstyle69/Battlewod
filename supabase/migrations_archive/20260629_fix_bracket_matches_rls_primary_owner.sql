-- ═══════════════════════════════════════════════════════════════════════
-- Fix: tournament_bracket_matches RLS must use the canonical box-admin check
--
-- Bug: the write policy `bracket_matches_owner_admin` only accepted
--   box_members.role IN ('owner','coach')  (+ profiles admin roles).
-- A primary box owner (boxes.owner_id = auth.uid()) usually has NO
-- box_members row, so every client-side write to a bracket match silently
-- affected 0 rows under RLS (Supabase returns no error on a USING-filtered
-- UPDATE). In the back-office this meant clicking an athlete to designate a
-- winner, "Décider selon les scores", resetting a result, or editing a match
-- appeared to do nothing for the primary owner.
--
-- This is the same ownership gap fixed for the tournament RPCs in
-- 20260624_fix_tournament_manager_primary_owner.sql (whose comment even
-- assumed this RLS already used is_box_admin — it did not).
--
-- Fix: rebuild the policy on top of is_box_admin(t.box_id), which recognizes
--   - boxes.owner_id = auth.uid()                         (primary owner)
--   - box_members.role IN ('owner','coach'), status active
--   - profiles.role IN ('admin','super_admin','box_owner')
-- and add an explicit WITH CHECK so writes are authorized too.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS bracket_matches_owner_admin ON public.tournament_bracket_matches;

CREATE POLICY bracket_matches_owner_admin ON public.tournament_bracket_matches
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
