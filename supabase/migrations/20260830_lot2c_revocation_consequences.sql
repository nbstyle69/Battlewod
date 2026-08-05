-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 2C — Conséquences réelles de la révocation d'accès
--
-- CONTEXTE : la prod vient d'avoir son PREMIER membre `inactive` (abonnement
-- terminé côté Stripe le 2026-08-01, révocation appliquée le 2026-08-05). Le
-- statut existait depuis la migration 20260805 mais n'avait jamais été atteint :
-- tout ce que le système fait d'un membre révoqué est donc du code neuf.
--
-- CE QUI MANQUE (constaté : aucun trigger ne relie box_members à
-- class_reservations — dump §2 du Lot 2) :
--  • Un membre révoqué conserve ses réservations futures. Il ne les voit plus
--    (get_user_box_ids() filtre sur status='active', donc sa box disparaît de
--    l'app), il ne peut donc ni s'y rendre sereinement ni s'en désinscrire —
--    mais sa place reste occupée dans un cours qui peut être plein, et la
--    liste d'attente ne bouge pas. Une place fantôme, invisible des deux côtés.
--  • Même chose quand un membre quitte la box de lui-même (policy
--    `box_members_self_leave` : il supprime sa propre ligne).
--
-- DÉCISION PRODUIT : les réservations futures sont annulées à la révocation.
-- La place se libère, `refund_credit_on_cancel` rembourse le crédit si on est
-- à plus de 5 h du cours, et `promote_waiting_reservation` — rendu tolérant à
-- l'échec au Lot 2A — promeut le candidat suivant. Les trois mécanismes
-- s'enchaînent sans qu'on ait à réécrire quoi que ce soit.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 2C.1 — Libérer les réservations futures d'un membre qui perd l'accès
-- On supprime (et non « annule ») parce que c'est ainsi que l'app annule une
-- réservation : le CHECK n'autorise que 'confirmed' et 'waiting', il n'existe
-- pas de statut annulé. La suppression déclenche la chaîne existante
-- (remboursement du crédit, puis promotion de la liste d'attente).
-- Les réservations PASSÉES sont conservées : c'est l'historique du membre.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_reservations_on_revoke()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_release_reservations_on_revoke ON public.box_members;
CREATE TRIGGER trg_release_reservations_on_revoke
  AFTER UPDATE OF status OR DELETE ON public.box_members
  FOR EACH ROW EXECUTE FUNCTION public.release_reservations_on_revoke();

-- ─────────────────────────────────────────────────────────────
-- 2C.2 — Réactivation depuis le back-office : même règle que la ré-adhésion
-- L'écran BO faisait un `UPDATE status='active'` brut. Un membre réactivé
-- récupérait donc tel quel ce qui restait de son ancien abonnement, alors que
-- `join_box_by_invite` (Lot 2A) remet tout à zéro. Deux portes d'entrée, deux
-- règles opposées : on aligne, côté serveur, pour que l'écran ne puisse plus
-- diverger.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reactivate_box_member(p_box_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.reactivate_box_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_box_member(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 2C.3 — `anon` n'a rien à écrire dans box_members
-- Constaté au dump §2b : anon porte INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER sur la table. Aucune policy ne l'autorise aujourd'hui (toutes
-- s'appuient sur auth.uid()), donc c'est inoffensif — mais c'est exactement la
-- configuration du Lot 1B : une seule policy trop permissive écrite plus tard
-- et le grant devient exploitable. On retire le grant, pas seulement la policy.
-- (`authenticated` conserve les siens : adhésion et départ volontaire.)
-- ─────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.box_members FROM anon;

NOTIFY pgrst, 'reload schema';
