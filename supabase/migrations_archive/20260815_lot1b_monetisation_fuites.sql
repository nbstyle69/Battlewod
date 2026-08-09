-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1B (resserré) — Fuites & accès monétisation (sécurité serveur)
-- Basé sur le DUMP RÉEL de prod (reconnaissance 1B).
--
-- NOTE PÉRIMÈTRE : le « paywall serveur » (bloquer l'inscription à un programme/
-- abonnement PAYANT) est VOLONTAIREMENT différé — le paiement n'est pas encore
-- implémenté (join gratuit « en attendant », pas de webhook Stripe). Le bloquer
-- maintenant rendrait le contenu payant inaccessible sans rien sécuriser. Voir
-- l'épic « paiement programmes ». Ce lot ferme les fuites RÉELLES d'aujourd'hui.
--
-- Flux légitimes préservés (vérifiés dans l'app) :
--  • box_members : le client ne lit AUCUNE colonne de facturation en direct
--    (owner dunning via get_box_dunning, definer) → le dump anonyme fermé sans casse.
--  • wod_program_access : lu par les membres (filtrage whiteboard), jamais écrit
--    par l'app → écriture réservée aux admins de la box, lecture conservée.
--  • check_daily_limit : appelé pour l'utilisateur courant (ReservationScreen).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1B.1 — box_members : fin du dump public (facturation exposée à anon + monde)
-- box_members_select_all USING(true) exposait stripe_*, amount_cents,
-- subscription_status, dunning_* à tout le monde (analogue à public_read_profiles).
-- On la supprime : les lectures légitimes restent via member_see_own /
-- member_see_boxmates / box_members_owner_view / superadmin_read_box_members.
-- (Le masquage fin des colonnes de facturation vis-à-vis des CO-MEMBRES
--  authentifiés fera l'objet d'un follow-up 1B-bis — nécessite la baseline
--  exacte des grants colonnes de box_members.)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "box_members_select_all" ON public.box_members;

-- ─────────────────────────────────────────────────────────────
-- 1B.2 — wod_program_access : fin de « tout authentifié écrit/lit »
-- Avant : USING(auth.uid() IS NOT NULL) en lecture ET écriture. La table lie un
-- box_wods à un programme (contrôle de visibilité d'un WOD). L'écriture doit être
-- réservée aux admins de la box du WOD ; la lecture aux membres de cette box
-- (le whiteboard s'en sert pour filtrer les WOD visibles).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "manage_wod_program_access" ON public.wod_program_access;
DROP POLICY IF EXISTS "read_wod_program_access"   ON public.wod_program_access;

CREATE POLICY "wod_program_access_admin_write" ON public.wod_program_access
  FOR ALL
  USING (public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id)))
  WITH CHECK (public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id)));

CREATE POLICY "wod_program_access_member_read" ON public.wod_program_access
  FOR SELECT
  USING (
    (SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id) IN (SELECT public.get_user_box_ids())
    OR public.is_box_admin((SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_id))
  );

-- ─────────────────────────────────────────────────────────────
-- 1B.3 — check_daily_limit : cible forcée à auth.uid() + retrait de anon
-- Avant : EXECUTE à anon + prend p_user_id → un tiers pouvait sonder le quota/
-- présences de n'importe qui. On force auth.uid() pour l'appelant non-backend
-- (auth.role() car SECURITY DEFINER propriété postgres → current_user inopérant).
-- Corps repris VERBATIM du dump, seule la cible change.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_daily_limit(p_user_id uuid, p_box_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.check_daily_limit(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_daily_limit(uuid, uuid, date) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 1B.4 — box_subscribes_programming : retrait de anon (lecture bool, mineur)
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.box_subscribes_programming(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.box_subscribes_programming(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 1B.5 — Grants PostgREST : retrait de TOUTE écriture anon sur la monétisation
-- anon avait INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES sur 8 tables (seule
-- la RLS protégeait). anon ne doit JAMAIS écrire ces tables. SELECT laissé tel
-- quel (déjà borné par RLS : plans/programmes actifs publics par design).
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'programs','program_members','box_programming','box_programming_subscriptions',
    'box_subscriptions','membership_plans','class_reservations','wod_program_access'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
