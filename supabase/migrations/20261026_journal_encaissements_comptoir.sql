-- ============================================================================
-- 20261026 — Journal des encaissements comptoir
--
-- Le mode `box` des invitations pose un membre actif sans laisser la moindre
-- trace de paiement : ni montant réglé, ni date, ni qui a encaissé. Le MRR
-- comptoir du bloc Argent n'est donc que *théorique*, et son historique est
-- purement et simplement irrécupérable — une somme non journalisée aujourd'hui
-- ne pourra jamais être reconstruite a posteriori.
--
-- Ce lot pose le journal manquant. Périmètre volontairement minimal : une ligne
-- par encaissement validé, en ajout seul. Pas de comptabilité, pas d'édition,
-- pas de rapprochement bancaire.
--
-- Choix structurants :
--
--  • Le montant n'est JAMAIS fourni par le client. Il est lu côté serveur sur
--    la formule au moment de l'encaissement, puis figé dans la ligne : changer
--    le prix d'une formule demain ne réécrit pas l'historique d'hier.
--
--  • Le journal est en AJOUT SEUL, et pas seulement par convention : aucune
--    policy ni aucun grant d'UPDATE/DELETE n'existe, et un trigger verrouille
--    la substance de la ligne quel que soit le rôle — y compris `service_role`
--    et `postgres`.
--
--  • L'écriture ne passe que par deux RPC `SECURITY DEFINER` gardées par
--    `is_box_admin`. Un gérant d'une autre box ne lit ni n'écrit : il reçoit
--    une exception, pas zéro ligne.
--
--  • `get_box_money_summary` gagne l'encaissé comptoir de la période. C'est le
--    premier chiffre comptoir de l'écran qui soit *prouvé* et non déduit d'un
--    prix affiché ; il est rendu à part du théorique, pas fondu dedans.
-- ============================================================================

BEGIN;

-- ── 1. Le journal ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.box_cash_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES public.boxes(id)               ON DELETE CASCADE,
  -- Le membre peut être inconnu à l'encaissement : le gérant encaisse parfois
  -- avant que l'invité n'ait créé son compte. La ligne reste valable.
  member_id     uuid          REFERENCES public.profiles(id)            ON DELETE SET NULL,
  invitation_id uuid          REFERENCES public.box_invitations(id)     ON DELETE SET NULL,
  plan_id       uuid          REFERENCES public.membership_plans(id)    ON DELETE SET NULL,
  -- Libellé figé : la formule peut être renommée ou supprimée, la ligne du
  -- journal doit rester lisible telle qu'elle a été encaissée.
  plan_name     text,
  amount_cents  integer NOT NULL,
  source        text NOT NULL,
  collected_at  timestamptz NOT NULL DEFAULT now(),
  collected_by  uuid          REFERENCES public.profiles(id)            ON DELETE SET NULL,
  CONSTRAINT box_cash_payments_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT box_cash_payments_source_check
    CHECK (source IN ('invitation', 'renewal'))
);

COMMENT ON TABLE public.box_cash_payments IS
  'Journal en ajout seul des encaissements comptoir d''une box. Une ligne par paiement validé par un gérant. Ni modifiable ni supprimable.';
COMMENT ON COLUMN public.box_cash_payments.amount_cents IS
  'Montant figé à l''encaissement, lu côté serveur sur la formule : un changement de prix ne réécrit pas l''historique.';
COMMENT ON COLUMN public.box_cash_payments.source IS
  'invitation : premier règlement d''une invitation « mode box ». renewal : échéance suivante d''un membre comptoir.';

CREATE INDEX IF NOT EXISTS box_cash_payments_box_date_idx
  ON public.box_cash_payments (box_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS box_cash_payments_member_idx
  ON public.box_cash_payments (member_id);

-- ── 2. Ajout seul, y compris pour les rôles privilégiés ────────────────────
--
-- Les grants suffisent à bloquer `authenticated` ; ils ne protègent pas d'une
-- écriture faite par `service_role` depuis une route serveur, ni d'un `UPDATE`
-- lancé à la main. Un trigger ferme les deux.
--
-- Il laisse passer exactement deux choses, et pour une bonne raison : les FK de
-- la table déclenchent elles-mêmes des écritures. Supprimer un profil met
-- `member_id`/`collected_by` à NULL (un UPDATE), supprimer une box efface ses
-- lignes (un DELETE). Un refus aveugle rendrait ces deux suppressions
-- impossibles. Ce qui est verrouillé, c'est la substance du paiement : montant,
-- date, box, source, formule.

CREATE OR REPLACE FUNCTION public.reject_cash_payment_rewrite()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Seule la disparition de la box efface ses encaissements (cascade FK).
    IF EXISTS (SELECT 1 FROM public.boxes WHERE id = OLD.box_id) THEN
      RAISE EXCEPTION 'APPEND_ONLY: un encaissement journalisé ne se supprime pas.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.box_id       IS DISTINCT FROM OLD.box_id
  OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
  OR NEW.collected_at IS DISTINCT FROM OLD.collected_at
  OR NEW.source       IS DISTINCT FROM OLD.source
  OR NEW.plan_name    IS DISTINCT FROM OLD.plan_name THEN
    RAISE EXCEPTION 'APPEND_ONLY: le montant et la date d''un encaissement ne se corrigent pas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_cash_payment_rewrite() IS
  'Verrouille montant, date, box, source et formule d''une ligne de journal, et interdit la suppression tant que la box existe. Quel que soit le rôle appelant.';

DROP TRIGGER IF EXISTS box_cash_payments_append_only ON public.box_cash_payments;
CREATE TRIGGER box_cash_payments_append_only
  BEFORE UPDATE OR DELETE ON public.box_cash_payments
  FOR EACH ROW EXECUTE FUNCTION public.reject_cash_payment_rewrite();

ALTER TABLE public.box_cash_payments ENABLE ROW LEVEL SECURITY;

-- Lecture : les admins de la box, et personne d'autre. Aucune policy d'écriture
-- n'est posée — les insertions passent par les RPC SECURITY DEFINER ci-dessous.
DROP POLICY IF EXISTS box_cash_payments_admin_read ON public.box_cash_payments;
CREATE POLICY box_cash_payments_admin_read
  ON public.box_cash_payments
  FOR SELECT
  TO authenticated
  USING (public.is_box_admin(box_id));

REVOKE ALL ON public.box_cash_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.box_cash_payments FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.box_cash_payments FROM service_role;
GRANT SELECT ON public.box_cash_payments TO authenticated;

-- ── 3. Écriture du journal — helper interne ────────────────────────────────
--
-- Aucun rôle client ne l'atteint : c'est le point de passage unique des deux
-- RPC publiques, pour que le montant soit lu au même endroit dans les deux cas.

CREATE OR REPLACE FUNCTION public._log_box_cash_payment(
  p_box_id        uuid,
  p_member_id     uuid,
  p_invitation_id uuid,
  p_plan_id       uuid,
  p_source        text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_plan public.membership_plans;
  v_id   uuid;
BEGIN
  SELECT * INTO v_plan FROM public.membership_plans WHERE id = p_plan_id;

  -- Sans formule, il n'y a pas de montant de référence : journaliser un zéro
  -- serait pire que ne rien journaliser, il ferait croire à un encaissement nul.
  IF v_plan.id IS NULL OR coalesce(v_plan.price_cents, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.box_cash_payments (
    box_id, member_id, invitation_id, plan_id, plan_name,
    amount_cents, source, collected_by
  ) VALUES (
    p_box_id, p_member_id, p_invitation_id, p_plan_id, v_plan.name,
    v_plan.price_cents, p_source, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._log_box_cash_payment(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._log_box_cash_payment(uuid, uuid, uuid, uuid, text) FROM anon, authenticated, service_role;

COMMENT ON FUNCTION public._log_box_cash_payment(uuid, uuid, uuid, uuid, text) IS
  'Interne : écrit une ligne du journal comptoir, montant lu sur la formule. Aucun rôle client ne peut l''appeler.';

-- ── 4. Invitation encaissée — le clic existant journalise désormais ────────
--
-- Même signature, même comportement pour l'appelant : la seule différence est
-- la ligne de journal. Le lot 4 des invitations (Stripe) n'est pas concerné,
-- la fonction refuse déjà le mode `stripe`.

CREATE OR REPLACE FUNCTION public.mark_box_invitation_paid(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r        public.box_invitations;
  v_logged uuid;
BEGIN
  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;

  IF r.id IS NULL OR NOT public.is_box_admin(r.box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: invitation introuvable ou hors de votre box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF r.payment_mode <> 'box' THEN
    RAISE EXCEPTION 'NOT_CASH_MODE: cette invitation est réglée par Stripe'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Déjà encaissée : ne pas journaliser deux fois le même argent.
  IF r.cash_collected THEN
    RETURN jsonb_build_object('ok', true, 'already_collected', true);
  END IF;

  UPDATE public.box_invitations SET cash_collected = true WHERE id = r.id;

  v_logged := public._log_box_cash_payment(
    r.box_id, r.accepted_by, r.id, r.plan_id, 'invitation'
  );

  -- Le membre a déjà créé son compte : l'encaissement l'active. Sinon la
  -- consommation le fera, l'invitation portant désormais le paiement.
  IF r.accepted_by IS NOT NULL THEN
    UPDATE public.box_members SET
      status              = CASE WHEN status = 'banned' THEN status ELSE 'active' END,
      subscription_status = CASE WHEN status = 'banned' THEN subscription_status ELSE 'active' END,
      payment_method_type = 'cash'
    WHERE box_id = r.box_id AND member_id = r.accepted_by;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'activated', r.accepted_by IS NOT NULL,
    'payment_id', v_logged
  );
END;
$$;

COMMENT ON FUNCTION public.mark_box_invitation_paid(uuid) IS
  'Marque une invitation « mode box » comme encaissée au comptoir, journalise le paiement et active le membre s''il a déjà créé son compte.';

-- ── 5. Échéance suivante d'un membre comptoir ──────────────────────────────
--
-- Un abonné comptoir repaie tous les mois, sans qu'aucun événement ne le dise :
-- il n'y a pas de webhook pour l'espèce. C'est le gérant qui déclare, et cette
-- RPC est le seul chemin. Le montant vient de la formule du membre.

CREATE OR REPLACE FUNCTION public.record_member_cash_payment(p_box_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  m        public.box_members;
  v_logged uuid;
BEGIN
  SELECT * INTO m FROM public.box_members WHERE id = p_box_member_id;

  IF m.id IS NULL OR NOT public.is_box_admin(m.box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: adhésion introuvable ou hors de votre box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Un abonné Stripe est déjà prélevé : enregistrer un encaissement comptoir
  -- pour lui compterait son mois deux fois.
  IF m.stripe_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'STRIPE_MEMBER: cette adhésion est prélevée par Stripe'
      USING ERRCODE = 'check_violation';
  END IF;

  v_logged := public._log_box_cash_payment(
    m.box_id, m.member_id, NULL, m.plan_id, 'renewal'
  );

  IF v_logged IS NULL THEN
    RAISE EXCEPTION 'NO_PLAN_PRICE: cette adhésion n''a pas de formule tarifée'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.box_members SET
    status              = CASE WHEN status = 'banned' THEN status ELSE 'active' END,
    subscription_status = CASE WHEN status = 'banned' THEN subscription_status ELSE 'active' END,
    payment_method_type = 'cash'
  WHERE id = m.id;

  RETURN jsonb_build_object('ok', true, 'payment_id', v_logged);
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_cash_payment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_member_cash_payment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_member_cash_payment(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_member_cash_payment(uuid) IS
  'Journalise l''échéance comptoir d''un membre (montant lu sur sa formule). Admin de la box uniquement, refusée sur un abonné Stripe.';

-- ── 6. L'encaissé comptoir prouvé rejoint la synthèse ──────────────────────
--
-- Le type de retour change : il faut détruire avant de recréer.

DROP FUNCTION IF EXISTS public.get_box_money_summary(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_box_money_summary(
  p_box_id uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
RETURNS TABLE (
  mrr_stripe_cents        bigint,
  mrr_stripe_subs         integer,
  mrr_cash_cents          bigint,
  mrr_cash_subs           integer,
  past_due_count          integer,
  past_due_cents          bigint,
  cash_to_collect_count   integer,
  cash_to_collect_cents   bigint,
  cancellations_period    integer,
  new_subs_period         integer,
  program_revenue_cents   bigint,
  program_sales_period    integer,
  cash_collected_cents    bigint,
  cash_collected_count    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH abos AS (
    SELECT bm.subscription_status,
           bm.stripe_subscription_id,
           bm.past_due_since,
           bm.subscription_cancel_at_period_end,
           bm.joined_at,
           coalesce(bm.amount_cents, mp.price_cents, 0) AS cents
    FROM public.box_members bm
    LEFT JOIN public.membership_plans mp ON mp.id = bm.plan_id
    WHERE bm.box_id = p_box_id
      AND bm.subscription_status = 'active'
  ),
  -- Un impayé n'est PAS un abonnement actif : le webhook Stripe bascule le
  -- membre en `subscription_status = 'past_due'` (et pose `past_due_since`).
  -- Le compter dans `abos` reviendrait à ne jamais en trouver un seul, et à
  -- gonfler le MRR d'un montant qui n'est justement pas encaissé.
  impayes AS (
    SELECT coalesce(bm.amount_cents, mp.price_cents, 0) AS cents
    FROM public.box_members bm
    LEFT JOIN public.membership_plans mp ON mp.id = bm.plan_id
    WHERE bm.box_id = p_box_id
      AND bm.subscription_status = 'past_due'
  ),
  invit AS (
    SELECT coalesce(mp.price_cents, 0) AS cents
    FROM public.box_invitations bi
    LEFT JOIN public.membership_plans mp ON mp.id = bi.plan_id
    WHERE bi.box_id = p_box_id
      AND bi.payment_mode = 'box'
      AND bi.cash_collected = false
      AND bi.status <> 'revoked'
  ),
  progs AS (
    SELECT coalesce(pm.amount_cents, 0) AS cents
    FROM public.program_members pm
    JOIN public.programs pr ON pr.id = pm.program_id
    WHERE pr.box_id = p_box_id
      AND pm.status <> 'refunded'
      AND pm.purchased_at >= p_from
      AND pm.purchased_at <  p_to
  ),
  -- Encaissements comptoir *prouvés* de la période : ceux-là ont un montant et
  -- une date, contrairement au MRR comptoir qui n'est qu'un prix affiché.
  cash AS (
    SELECT cp.amount_cents AS cents
    FROM public.box_cash_payments cp
    WHERE cp.box_id = p_box_id
      AND cp.collected_at >= p_from
      AND cp.collected_at <  p_to
  )
  SELECT
    (SELECT coalesce(sum(cents), 0)::bigint FROM abos WHERE stripe_subscription_id IS NOT NULL),
    (SELECT count(*)::integer         FROM abos WHERE stripe_subscription_id IS NOT NULL),
    (SELECT coalesce(sum(cents), 0)::bigint FROM abos WHERE stripe_subscription_id IS NULL),
    (SELECT count(*)::integer         FROM abos WHERE stripe_subscription_id IS NULL),
    (SELECT count(*)::integer               FROM impayes),
    (SELECT coalesce(sum(cents), 0)::bigint FROM impayes),
    (SELECT count(*)::integer         FROM invit),
    (SELECT coalesce(sum(cents), 0)::bigint FROM invit),
    -- Résiliations de la période : demandes déposées + résiliations Stripe
    -- programmées dont la période se termine dans l'intervalle.
    (SELECT count(*)::integer
       FROM public.membership_cancellation_requests cr
      WHERE cr.box_id = p_box_id
        AND cr.created_at >= p_from AND cr.created_at < p_to)
    + (SELECT count(*)::integer
         FROM public.box_members bm
        WHERE bm.box_id = p_box_id
          AND bm.subscription_cancel_at_period_end
          AND bm.subscription_current_period_end >= p_from
          AND bm.subscription_current_period_end <  p_to),
    (SELECT count(*)::integer FROM abos WHERE joined_at >= p_from AND joined_at < p_to),
    (SELECT coalesce(sum(cents), 0)::bigint FROM progs),
    (SELECT count(*)::integer FROM progs),
    (SELECT coalesce(sum(cents), 0)::bigint FROM cash),
    (SELECT count(*)::integer               FROM cash);
END;
$$;

REVOKE ALL ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) IS
  'Synthèse argent d''une box (admin de la box uniquement). mrr_cash_* est théorique (prix affiché) ; cash_collected_* est prouvé (journal des encaissements).';

COMMIT;
