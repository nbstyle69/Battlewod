-- 20261017 — resserrage de la branche « rôle » des policies : un gérant de box
-- n'agit plus que sur SA box, plus sur toute la plateforme.
--
-- Motif traité (10 policies, 5 tables), hérité de 20260306 puis répliqué :
--   EXISTS (SELECT 1 FROM profiles
--            WHERE id = auth.uid()
--              AND role = ANY (ARRAY['admin','super_admin','box_owner']))
-- Cette branche ignore la box : n'importe lequel des 13 comptes `box_owner`
-- pouvait lire, modifier ou supprimer les scores, l'historique d'ELO, les
-- compteurs de reps et les badges de N'IMPORTE QUELLE box.
--
-- `is_box_admin()` porte déjà la dérogation plateforme (admin/super_admin, cf.
-- lot 1A) : là où une branche `is_box_admin(t.box_id)` existe déjà à côté, il
-- suffit donc de supprimer la branche « rôle » — les deux seuls comptes
-- super_admin de la prod restent couverts, sans changement de comportement.
--
-- Périmètre exclu volontairement :
--   * `badges_public_read` (USING true) — décision produit séparée ;
--   * l'attribution de badges par l'athlète lui-même (aujourd'hui refusée par
--     cette même policy) — demande une attribution serveur, lot dédié.

-- ── Helper : l'athlète relève-t-il d'une box que j'administre ? ─────────────
-- Les compteurs de reps et les badges n'ont pas de colonne box : le
-- rattachement passe par l'adhésion active de l'athlète, ou par sa
-- participation à un tournoi de la box (le back-office crédite reps et badges
-- à la validation d'un score et à la clôture d'un tournoi).
CREATE OR REPLACE FUNCTION public.is_box_admin_of_athlete(p_athlete_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid()
         AND role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.box_members bm
       WHERE bm.member_id = p_athlete_id
         AND COALESCE(bm.status, 'active') = 'active'
         AND public.is_box_admin(bm.box_id)
    )
    OR EXISTS (
      SELECT 1
        FROM public.tournament_participants tp
        JOIN public.tournaments t ON t.id = tp.tournament_id
       WHERE tp.athlete_id = p_athlete_id
         AND public.is_box_admin(t.box_id)
    );
$$;

-- Évaluée dans des policies, donc exécutée par le rôle appelant.
GRANT EXECUTE ON FUNCTION public.is_box_admin_of_athlete(uuid) TO anon, authenticated, service_role;

-- ═══ Groupe A — tables rattachées à un tournoi ═════════════════════════════
-- La branche `is_box_admin(t.box_id)` existe déjà : on retire la branche rôle.

-- tournament_scores : UPDATE (validation / rejet / correction depuis TheHub)
DROP POLICY IF EXISTS "tournament_scores_owner_update_pending" ON public.tournament_scores;
CREATE POLICY "tournament_scores_owner_update_pending"
  ON public.tournament_scores FOR UPDATE
  USING (
    (
      auth.uid() = athlete_id
      AND status = 'pending'
      AND public.tournament_wod_accepts_scores(tournament_wod_id, tournament_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_scores.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- tournament_scores : DELETE
DROP POLICY IF EXISTS "tournament_scores_admin_delete" ON public.tournament_scores;
CREATE POLICY "tournament_scores_admin_delete"
  ON public.tournament_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_scores.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- tournament_scores : SELECT
DROP POLICY IF EXISTS "tournament_scores_owner_or_admin_read" ON public.tournament_scores;
CREATE POLICY "tournament_scores_owner_or_admin_read"
  ON public.tournament_scores FOR SELECT
  USING (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_scores.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- tournament_elo_history : écriture (clôture + distribution d'ELO)
DROP POLICY IF EXISTS "elo_history_admin_write" ON public.tournament_elo_history;
CREATE POLICY "elo_history_admin_write"
  ON public.tournament_elo_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_elo_history.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_elo_history.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- tournament_elo_history : SELECT
DROP POLICY IF EXISTS "elo_history_owner_or_admin" ON public.tournament_elo_history;
CREATE POLICY "elo_history_owner_or_admin"
  ON public.tournament_elo_history FOR SELECT
  USING (
    auth.uid() = athlete_id
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_elo_history.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- ═══ Groupe B — tables sans colonne de box ═════════════════════════════════

-- athlete_badges : écriture (crédit de badges depuis le back-office)
DROP POLICY IF EXISTS "badges_admin_write" ON public.athlete_badges;
CREATE POLICY "badges_admin_write"
  ON public.athlete_badges FOR ALL
  USING (public.is_box_admin_of_athlete(athlete_id))
  WITH CHECK (public.is_box_admin_of_athlete(athlete_id));

-- movement_rep_counts : écriture (crédit de reps à la validation d'un score)
DROP POLICY IF EXISTS "movement_reps_admin_write" ON public.movement_rep_counts;
CREATE POLICY "movement_reps_admin_write"
  ON public.movement_rep_counts FOR ALL
  USING (public.is_box_admin_of_athlete(athlete_id))
  WITH CHECK (public.is_box_admin_of_athlete(athlete_id));

-- movement_rep_counts : SELECT
DROP POLICY IF EXISTS "movement_reps_owner_or_admin_read" ON public.movement_rep_counts;
CREATE POLICY "movement_reps_owner_or_admin_read"
  ON public.movement_rep_counts FOR SELECT
  USING (
    auth.uid() = athlete_id
    OR public.is_box_admin_of_athlete(athlete_id)
  );

-- inter_elo_history : écriture. Seule `compute_inter_competition_elo`
-- (SECURITY DEFINER) écrit cette table ; aucun client n'en dépend. Les
-- compétitions inter-box ne portent pas de box_id : la dérogation reste
-- plateforme.
DROP POLICY IF EXISTS "inter_elo_history_admin_write" ON public.inter_elo_history;
CREATE POLICY "inter_elo_history_admin_write"
  ON public.inter_elo_history FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- inter_elo_history : SELECT
DROP POLICY IF EXISTS "inter_elo_history_read" ON public.inter_elo_history;
CREATE POLICY "inter_elo_history_read"
  ON public.inter_elo_history FOR SELECT
  USING (
    auth.uid() = athlete_id
    OR public.is_box_admin_of_athlete(athlete_id)
  );
