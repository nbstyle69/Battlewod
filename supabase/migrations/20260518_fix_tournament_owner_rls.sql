-- ═══════════════════════════════════════════════════════════════════════
-- Fix RLS for tournament management by box owner (18 mai 2026)
-- Bug: owner ne peut pas insérer de WODs / voir les scores admin de son
-- propre tournoi car les policies historiques exigent
-- profiles.role = 'box_owner', alors que dans ce système le owner est
-- identifié via boxes.owner_id.
--
-- Solution: étendre toutes les policies tournament_* pour accepter aussi
-- le box-admin du tournoi via is_box_admin(tournament.box_id).
-- ═══════════════════════════════════════════════════════════════════════

-- ── tournament_wods ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tournament_wods_admin_all" ON public.tournament_wods;

CREATE POLICY "tournament_wods_admin_all" ON public.tournament_wods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_wods.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_wods.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournament_scores ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "tournament_scores_owner_or_admin_read"   ON public.tournament_scores;
DROP POLICY IF EXISTS "tournament_scores_owner_update_pending"  ON public.tournament_scores;

CREATE POLICY "tournament_scores_owner_or_admin_read" ON public.tournament_scores
  FOR SELECT USING (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_scores.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

CREATE POLICY "tournament_scores_owner_update_pending" ON public.tournament_scores
  FOR UPDATE USING (
    (auth.uid() = athlete_id AND status = 'pending')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_scores.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- Allow box-admin to DELETE rejected scores (cleanup workflow)
DROP POLICY IF EXISTS "tournament_scores_admin_delete" ON public.tournament_scores;
CREATE POLICY "tournament_scores_admin_delete" ON public.tournament_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_scores.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournament_elo_history ─────────────────────────────────────────────
DROP POLICY IF EXISTS "elo_history_owner_or_admin" ON public.tournament_elo_history;
DROP POLICY IF EXISTS "elo_history_admin_write"    ON public.tournament_elo_history;

CREATE POLICY "elo_history_owner_or_admin" ON public.tournament_elo_history
  FOR SELECT USING (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_elo_history.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

CREATE POLICY "elo_history_admin_write" ON public.tournament_elo_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_elo_history.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_elo_history.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournament_participants (admin can kick / view all) ────────────────
-- Add a manager-side policy without breaking existing self-insert rules.
DROP POLICY IF EXISTS "tournament_participants_admin_manage" ON public.tournament_participants;
CREATE POLICY "tournament_participants_admin_manage" ON public.tournament_participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_participants.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_participants.tournament_id
        AND public.is_box_admin(t.box_id)
    )
  );

-- ── tournaments (UPDATE/DELETE by box-admin) ───────────────────────────
-- Add manager policies; existing public-read policies remain intact.
DROP POLICY IF EXISTS "tournaments_box_admin_manage" ON public.tournaments;
CREATE POLICY "tournaments_box_admin_manage" ON public.tournaments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR public.is_box_admin(tournaments.box_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
    )
    OR public.is_box_admin(tournaments.box_id)
  );
