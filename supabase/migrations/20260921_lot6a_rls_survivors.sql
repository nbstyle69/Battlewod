-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 6A — Policies permissives héritées (survivants de l'audit v2)
-- Basé sur le baseline = état RÉEL de prod (fidélité 0 écart, 9 août).
-- Tables jamais touchées par les Lots 1→5, d'où les survivants du pattern
-- « USING(true) » / « auth.uid() IS NOT NULL » déjà corrigé ailleurs.
--
-- SÛRETÉ VÉRIFIÉE AVANT ÉCRITURE :
--  • tournament_scores : les policies STRICTES coexistent déjà
--    (owner_or_admin_read couvre soi + admin + is_box_admin(box du tournoi) ;
--     owner_insert / owner_update_pending / admin_delete). Le classement passe
--     par get_tournament_validated_scores (SECURITY DEFINER, hors RLS). Droper
--     les permissives ne casse donc aucune lecture légitime.
--  • wod_group_access : wod_id→box_wods.box_id (FK confirmée) → scoping box
--     identique à wod_program_access (Lot 1B). App : BO insère (owner/coach),
--     whiteboard lit (membre).
--  • box_documents : lecture inchangée ; seul l'INSERT est resserré.
--  • recalc_division_points : AUCUN appel direct dans l'app → REVOKE EXECUTE
--     sans risque ; le trigger trg_recalc_division_points l'exécute en contexte
--     definer, indépendamment des grants.
--
-- HORS PÉRIMÈTRE (décisions/risques, PAS ici) :
--  • A7 profiles.role à anon : public_leaderboard est security_invoker et lit
--     role → révoquer casserait le classement public. À traiter en retirant
--     role de la vue d'abord. DIFFÉRÉ.
--  • A8 grants colonne anon sur box_members, A9 qui peut figer l'ELO d'un WOD :
--     décisions, notées au rapport.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── A1 — tournament_scores : fin de la lecture publique + de l'auto-validation
DROP POLICY IF EXISTS "scores_read"  ON public.tournament_scores;  -- USING(true)
DROP POLICY IF EXISTS "scores_write" ON public.tournament_scores;  -- FOR ALL, self-validate
-- (Restent : tournament_scores_owner_or_admin_read / _owner_insert /
--  _owner_update_pending / _admin_delete — le workflow de revue redevient clos.)

-- ─── A2 — wod_group_access : écriture réservée aux admins de la box du WOD,
--          lecture aux membres de cette box (fin de « tout authentifié »).
DROP POLICY IF EXISTS "manage_wod_group_access" ON public.wod_group_access;
DROP POLICY IF EXISTS "read_wod_group_access"   ON public.wod_group_access;
DROP POLICY IF EXISTS "wod_group_access_admin_write" ON public.wod_group_access;
DROP POLICY IF EXISTS "wod_group_access_member_read" ON public.wod_group_access;

CREATE POLICY "wod_group_access_admin_write" ON public.wod_group_access
  FOR ALL
  USING (public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id)))
  WITH CHECK (public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id)));

CREATE POLICY "wod_group_access_member_read" ON public.wod_group_access
  FOR SELECT
  USING (
    (SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id) IN (SELECT public.get_user_box_ids())
    OR public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id))
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.wod_group_access FROM anon;

-- ─── A3 — box_documents : on n'insère que dans SA box (ou un doc perso).
DROP POLICY IF EXISTS "insert_box_documents" ON public.box_documents;
CREATE POLICY "insert_box_documents" ON public.box_documents
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by
    AND (box_id IS NULL OR box_id IN (SELECT public.get_user_box_ids()))
  );

-- ─── A5 — matchmaking_queue : plus de lecture anonyme de la file.
DROP POLICY IF EXISTS "Read queue" ON public.matchmaking_queue;
CREATE POLICY "Read queue" ON public.matchmaking_queue
  FOR SELECT TO authenticated USING (true);

-- ─── A4 — recalc_division_points : retrait de l'EXECUTE direct (anon + authent.)
--          Le trigger continue de l'appeler (contexte definer).
REVOKE ALL ON FUNCTION public.recalc_division_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_division_points(uuid) TO service_role;

-- ─── A6 — compute_tournament_elo : garde par tournoi, pas par rôle global.
--          Corps repris de 20260915 (4A-bis, plancher + cohérence), SEULE la
--          garde change : is_tournament_manager(p_tournament_id) OU admin
--          plateforme, au lieu du rôle box_owner GLOBAL qui laissait un owner
--          clôturer le tournoi d'une box concurrente.
CREATE OR REPLACE FUNCTION public.compute_tournament_elo(p_tournament_id uuid)
RETURNS TABLE(athlete_id uuid, final_rank integer, elo_before integer, elo_after integer, elo_change integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_n      int;
  v_avg    int;
  v_format text;
  k_tourn  constant numeric := 48;
BEGIN
  IF NOT (
    public.is_tournament_manager(p_tournament_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
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
         GREATEST(100, d.elo_before + d.elo_change) - d.elo_before
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
$function$;

NOTIFY pgrst, 'reload schema';
