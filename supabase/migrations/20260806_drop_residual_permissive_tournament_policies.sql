-- Durcissement tournois — suppression des policies permissives résiduelles.
--
-- Les policies permissives se combinent en OU : les gardes ajoutées par
-- 20260803_tournament_hardement.sql (can_join_tournament / tournament_wods_public_read)
-- étaient court-circuitées par des policies "USING (true)" / "CHECK (auth.uid()=athlete_id)"
-- laissées en place. On les supprime SANS remplacement — les flux légitimes restent couverts :
--   * INSERT athlète            -> "Athletes can join tournaments" (garde can_join_tournament)
--   * désinscription athlète    -> tournament_participants_self_delete
--   * kick / gestion par owner   -> owner_delete_participants + tournament_participants_admin_manage
--   * lecture WOD par tous        -> tournament_wods_public_read (opens_at) + tournament_wods_admin_all
--   * écriture WOD par owner       -> wods_write + tournament_wods_admin_all
--
-- Idempotent (DROP ... IF EXISTS), aucune donnée supprimée.

DROP POLICY IF EXISTS "athlete_insert_own_participation" ON public.tournament_participants;
DROP POLICY IF EXISTS "participants_write" ON public.tournament_participants;
DROP POLICY IF EXISTS "wods_read" ON public.tournament_wods;
