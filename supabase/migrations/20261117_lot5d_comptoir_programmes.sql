-- Lot 5-D : « Payé au comptoir » pour les programmes, et le retrait d'un accès
-- payé cesse de dépendre du client.
--
-- Cinq choses, dans cet ordre :
--   1. `cash` devient une provenance d'accès à part entière — un accès payé,
--      qu'une assignation du staff ne dégrade jamais et qu'un paiement Stripe
--      requalifie. Le montant n'y est PAS stocké (voir 2).
--   2. Le journal de caisse accueille l'encaissement d'un programme : même
--      table, même événement comptable qu'un encaissement d'abonnement, une
--      troisième valeur de `source` et une colonne `program_id`. Le journal est
--      le grand livre unique : deux colonnes portant la même somme finiraient
--      par ne plus dire la même chose.
--   3. Le montant est fourni par le gérant (remise comptoir) mais BORNÉ côté
--      serveur : 0 < montant <= prix du programme. Une remise descend, elle ne
--      monte jamais. Sans cette borne, un client modifié écrirait un chiffre
--      d'affaires arbitraire dans une table en ajout seul — donc définitif.
--   4. Les deux surfaces d'argent comptent le comptoir de programme dans le
--      seau « programmes », et le seau « comptoir » l'exclut : le seau est une
--      catégorie, pas un moyen de paiement. Sans cette exclusion, le même euro
--      serait compté deux fois (le total du graphe est membership+program+cash).
--   5. Le retrait d'un accès Stripe est refusé PAR LE SERVEUR. Jusqu'ici le
--      refus vivait dans le client (`retirerAcces`), donc un client modifié
--      annulait un accès payé en laissant l'abonnement courir.

-- ---------------------------------------------------------------------------
-- 1. La provenance `cash`
-- ---------------------------------------------------------------------------

ALTER TABLE public.program_members
  DROP CONSTRAINT IF EXISTS program_members_provenance_check;

ALTER TABLE public.program_members
  ADD CONSTRAINT program_members_provenance_check
  CHECK (provenance = ANY (ARRAY['stripe', 'cash', 'staff', 'legacy_unverified']));

-- ---------------------------------------------------------------------------
-- 2. Le journal accueille les programmes
-- ---------------------------------------------------------------------------

ALTER TABLE public.box_cash_payments
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

ALTER TABLE public.box_cash_payments
  DROP CONSTRAINT IF EXISTS box_cash_payments_source_check;

ALTER TABLE public.box_cash_payments
  ADD CONSTRAINT box_cash_payments_source_check
  CHECK (source = ANY (ARRAY['invitation', 'renewal', 'program']));

-- Un encaissement de programme désigne le programme ; un encaissement
-- d'abonnement désigne la formule. Aucun ne désigne les deux, et aucun ne
-- désigne rien.
ALTER TABLE public.box_cash_payments
  DROP CONSTRAINT IF EXISTS box_cash_payments_program_source;

ALTER TABLE public.box_cash_payments
  ADD CONSTRAINT box_cash_payments_program_source
  CHECK (
    (source = 'program' AND program_id IS NOT NULL AND plan_id IS NULL)
    OR (source <> 'program' AND program_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS box_cash_payments_program_idx
  ON public.box_cash_payments (program_id) WHERE program_id IS NOT NULL;

-- Une seule porte d'écriture dans le grand livre. Le montant reste dérivé de la
-- formule pour un abonnement (invariant du lot du journal) ; il n'est accepté
-- en paramètre que pour un programme, et c'est l'appelant qui l'a borné.
CREATE OR REPLACE FUNCTION public._log_box_cash_payment(
  p_box_id        uuid,
  p_member_id     uuid,
  p_invitation_id uuid,
  p_plan_id       uuid,
  p_source        text,
  p_program_id    uuid    DEFAULT NULL,
  p_amount_cents  integer DEFAULT NULL,
  p_label         text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan public.membership_plans;
  v_id   uuid;
BEGIN
  IF p_source = 'program' THEN
    -- Le montant d'un encaissement de programme vient de l'appelant, qui l'a
    -- borné au prix. Ici on refuse seulement l'absurde.
    IF coalesce(p_amount_cents, 0) <= 0 OR p_program_id IS NULL THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.box_cash_payments (
      box_id, member_id, invitation_id, plan_id, plan_name,
      program_id, amount_cents, source, collected_by
    ) VALUES (
      p_box_id, p_member_id, NULL, NULL, p_label,
      p_program_id, p_amount_cents, 'program', auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

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

REVOKE ALL ON FUNCTION public._log_box_cash_payment(uuid, uuid, uuid, uuid, text, uuid, integer, text) FROM PUBLIC;

-- Trois paramètres de plus ne remplacent pas une fonction : ils en créent une
-- seconde. Les deux appelants du chemin abonnement passent 5 arguments, donc
-- les deux candidates matchaient — « function is not unique », et l'encaissement
-- d'un abonnement tombait. La signature d'avant part.
DROP FUNCTION IF EXISTS public._log_box_cash_payment(uuid, uuid, uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- 3. Une seule porte d'accès, deux gestes autorisés
-- ---------------------------------------------------------------------------

-- L'échelle de provenance vit ici, à un seul endroit : `join_program` (Stripe,
-- staff) et `assign_program_cash` (comptoir) l'empruntent tous les deux. Deux
-- upserts recopiés finiraient par appliquer deux échelles différentes.
CREATE OR REPLACE FUNCTION public._upsert_program_member(
  p_program_id uuid,
  p_user_id uuid,
  p_start_date date,
  p_provenance text,
  p_amount_cents integer DEFAULT NULL,
  p_platform_fee_cents integer DEFAULT NULL,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_stripe_payment_intent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.program_members (
    program_id, user_id, start_date, status, provenance,
    amount_cents, platform_fee_cents,
    stripe_checkout_session_id, stripe_subscription_id, stripe_payment_intent
  ) VALUES (
    p_program_id, p_user_id, COALESCE(p_start_date, current_date), 'active', p_provenance,
    -- Le montant d'un encaissement comptoir vit dans le journal, pas ici : une
    -- deuxième colonne portant la même somme finirait par la contredire.
    CASE WHEN p_provenance = 'stripe' THEN p_amount_cents END,
    CASE WHEN p_provenance = 'stripe' THEN p_platform_fee_cents END,
    p_stripe_checkout_session_id, p_stripe_subscription_id, p_stripe_payment_intent
  )
  ON CONFLICT (program_id, user_id) DO UPDATE SET
    status = 'active',
    -- Échelle de provenance : un paiement requalifie ce qui était offert ou
    -- non vérifié ; l'inverse n'existe pas. `stripe` > `cash` > `staff`.
    provenance = CASE
      WHEN EXCLUDED.provenance = 'stripe' THEN 'stripe'
      WHEN EXCLUDED.provenance = 'cash'
           AND program_members.provenance <> 'stripe' THEN 'cash'
      ELSE program_members.provenance
    END,
    start_date = COALESCE(EXCLUDED.start_date, program_members.start_date),
    amount_cents = COALESCE(EXCLUDED.amount_cents, program_members.amount_cents),
    platform_fee_cents = COALESCE(EXCLUDED.platform_fee_cents, program_members.platform_fee_cents),
    stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, program_members.stripe_checkout_session_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, program_members.stripe_subscription_id),
    stripe_payment_intent = COALESCE(EXCLUDED.stripe_payment_intent, program_members.stripe_payment_intent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._upsert_program_member(uuid, uuid, date, text, integer, integer, text, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.join_program(
  p_program_id uuid,
  p_source text,
  p_user_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_platform_fee_cents integer DEFAULT NULL,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_stripe_payment_intent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    uuid := COALESCE(p_user_id, auth.uid());
  v_backend boolean := public.request_is_backend();
  v_prog    public.programs;
  v_id      uuid;
BEGIN
  IF p_source NOT IN ('stripe', 'cash', 'staff') THEN
    RAISE EXCEPTION 'Source d''inscription inconnue : %', p_source USING ERRCODE = '22023';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prog FROM public.programs WHERE id = p_program_id;
  IF v_prog.id IS NULL THEN
    RAISE EXCEPTION 'Programme introuvable' USING ERRCODE = '42704';
  END IF;

  IF p_source = 'stripe' THEN
    -- Un paiement ne se déclare pas depuis un client : seul le webhook, qui a
    -- vérifié la signature Stripe, peut emprunter cette porte.
    IF NOT v_backend THEN
      RAISE EXCEPTION 'Un paiement de programme ne se déclare pas depuis un client'
        USING ERRCODE = '42501';
    END IF;
    IF p_stripe_checkout_session_id IS NULL
       AND p_stripe_subscription_id IS NULL
       AND p_stripe_payment_intent IS NULL THEN
      RAISE EXCEPTION 'Référence de paiement Stripe manquante' USING ERRCODE = '22023';
    END IF;

  ELSIF p_source = 'cash' THEN
    -- Un encaissement comptoir ne passe pas par ici, pour personne : il porte
    -- un montant, et un montant se journalise. `assign_program_cash` borne la
    -- remise et écrit le grand livre dans la même transaction ; cette porte-ci
    -- rendrait un accès « payé » sans trace comptable.
    RAISE EXCEPTION 'Un encaissement comptoir se déclare par assign_program_cash'
      USING ERRCODE = '42501';

  ELSE -- staff
    -- Dispenser de payer est une décision d'argent : gérant ou co-gérant, pas
    -- le coach. Et plus de branche owner_id : un programme appartient à sa box.
    IF NOT v_backend
       AND NOT (v_prog.box_id IS NOT NULL AND public.is_box_owner_admin(v_prog.box_id)) THEN
      RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du programme requis'
        USING ERRCODE = '42501';
    END IF;
    -- Le staff n'assigne qu'un membre de sa box.
    IF NOT v_backend
       AND v_prog.box_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.box_members
         WHERE box_id = v_prog.box_id AND member_id = v_user AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'L''athlète n''est pas membre actif de la box'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_id := public._upsert_program_member(
    p_program_id                 => p_program_id,
    p_user_id                    => v_user,
    p_start_date                 => p_start_date,
    p_provenance                 => p_source,
    p_amount_cents               => p_amount_cents,
    p_platform_fee_cents         => p_platform_fee_cents,
    p_stripe_checkout_session_id => p_stripe_checkout_session_id,
    p_stripe_subscription_id     => p_stripe_subscription_id,
    p_stripe_payment_intent      => p_stripe_payment_intent
  );

  RETURN v_id;
END;
$$;

-- Le geste du gérant : un accès payé au comptoir, journalisé, au montant borné.
CREATE OR REPLACE FUNCTION public.assign_program_cash(
  p_program_id   uuid,
  p_user_id      uuid,
  p_amount_cents integer,
  p_start_date   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prog       public.programs;
  v_membership uuid;
  v_logged     uuid;
BEGIN
  SELECT * INTO v_prog FROM public.programs WHERE id = p_program_id;
  IF v_prog.id IS NULL THEN
    RAISE EXCEPTION 'Programme introuvable' USING ERRCODE = '42704';
  END IF;

  -- Encaisser est une décision d'argent : gérant ou co-gérant, pas le coach.
  IF v_prog.box_id IS NULL OR NOT public.is_box_owner_admin(v_prog.box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du programme requis'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = v_prog.box_id AND member_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'L''athlète n''est pas membre actif de la box' USING ERRCODE = '42501';
  END IF;

  -- Un programme sans prix ne s'encaisse pas : il n'y a pas de référence à
  -- laquelle borner la remise, donc pas de montant justifiable.
  IF coalesce(v_prog.price_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'NO_PRICE: ce programme n''a pas de prix, il s''assigne (offert)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- La remise descend, jamais elle ne monte. Le journal est en ajout seul :
  -- un montant gonflé y serait définitif.
  IF coalesce(p_amount_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_INVALID: le montant encaissé doit être positif'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount_cents > v_prog.price_cents THEN
    RAISE EXCEPTION 'AMOUNT_ABOVE_PRICE: le montant encaissé dépasse le prix du programme (%)',
      v_prog.price_cents USING ERRCODE = 'check_violation';
  END IF;

  v_membership := public._upsert_program_member(
    p_program_id => p_program_id,
    p_user_id    => p_user_id,
    p_start_date => p_start_date,
    p_provenance => 'cash'
  );

  v_logged := public._log_box_cash_payment(
    p_box_id        => v_prog.box_id,
    p_member_id     => p_user_id,
    p_invitation_id => NULL,
    p_plan_id       => NULL,
    p_source        => 'program',
    p_program_id    => p_program_id,
    p_amount_cents  => p_amount_cents,
    p_label         => v_prog.title
  );

  IF v_logged IS NULL THEN
    RAISE EXCEPTION 'JOURNAL_FAILED: l''encaissement n''a pas pu être journalisé'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object('ok', true, 'membership_id', v_membership, 'payment_id', v_logged);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_program_cash(uuid, uuid, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_program_cash(uuid, uuid, integer, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. La garde de retrait, côté serveur
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.program_members_guard_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.provenance IS NULL THEN
      IF NEW.stripe_payment_intent IS NOT NULL
         OR NEW.stripe_subscription_id IS NOT NULL
         OR NEW.stripe_checkout_session_id IS NOT NULL THEN
        NEW.provenance := 'stripe';
      ELSE
        RAISE EXCEPTION 'Inscription à un programme sans provenance : provenance requise (stripe | cash | staff)'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.provenance = 'stripe'
       AND NEW.stripe_payment_intent IS NULL
       AND NEW.stripe_subscription_id IS NULL
       AND NEW.stripe_checkout_session_id IS NULL THEN
      RAISE EXCEPTION 'Provenance « stripe » sans référence de paiement'
        USING ERRCODE = '23514';
    END IF;
    -- Une assignation du staff ne porte pas d'argent, et un encaissement
    -- comptoir porte le sien dans le journal : ni l'une ni l'autre n'entre
    -- dans le chiffre d'affaires par la colonne des montants.
    IF NEW.provenance IN ('staff', 'cash') THEN
      NEW.amount_cents := NULL;
      NEW.platform_fee_cents := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provenance IS DISTINCT FROM OLD.provenance
       AND NOT public.is_privileged_backend() THEN
      RAISE EXCEPTION 'La provenance d''une inscription ne se modifie pas'
        USING ERRCODE = '42501';
    END IF;
    -- Le refus vivait dans le client (`retirerAcces`) : un client modifié
    -- annulait donc un accès payé par Stripe en laissant l'abonnement courir.
    -- Le remboursement passe par le webhook signé, qui pose `refunded`.
    IF OLD.provenance = 'stripe'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status <> 'refunded'
       AND OLD.status = 'active'
       AND NOT public.is_privileged_backend() THEN
      RAISE EXCEPTION 'PAID_ACCESS: un accès payé par Stripe se retire par un remboursement Stripe, pas ici'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Les deux surfaces d'argent : le comptoir de programme est du programme
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_box_money_summary(
  p_box_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  mrr_stripe_cents bigint,
  mrr_stripe_subs integer,
  mrr_cash_cents bigint,
  mrr_cash_subs integer,
  past_due_count integer,
  past_due_cents bigint,
  cash_to_collect_count integer,
  cash_to_collect_cents bigint,
  cancellations_period integer,
  new_subs_period integer,
  program_revenue_cents bigint,
  program_sales_period integer,
  cash_collected_cents bigint,
  cash_collected_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_box_owner_admin(p_box_id) THEN
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
    -- Achats Stripe : le montant est sur la ligne d'inscription.
    SELECT coalesce(pm.amount_cents, 0) AS cents
    FROM public.program_members pm
    JOIN public.programs pr ON pr.id = pm.program_id
    WHERE pr.box_id = p_box_id
      AND pm.status <> 'refunded'
      -- Seul un paiement encaissé est du chiffre d'affaires. Une assignation
      -- par le staff (`provenance='staff'`, sans montant) et une ligne héritée
      -- non vérifiée (`legacy_unverified`) n'ont jamais rien encaissé.
      AND pm.provenance = 'stripe'
      AND pm.purchased_at >= p_from
      AND pm.purchased_at <  p_to
    UNION ALL
    -- Encaissements comptoir de programme : le montant est dans le journal, et
    -- seulement là. Le seau est une catégorie de recette, pas un moyen de
    -- paiement — d'où l'exclusion symétrique dans `cash` juste dessous.
    SELECT cp.amount_cents AS cents
    FROM public.box_cash_payments cp
    WHERE cp.box_id = p_box_id
      AND cp.source = 'program'
      AND cp.collected_at >= p_from
      AND cp.collected_at <  p_to
  ),
  -- Encaissements comptoir *prouvés* de la période : ceux-là ont un montant et
  -- une date, contrairement au MRR comptoir qui n'est qu'un prix affiché. Les
  -- encaissements de programme en sortent : ils sont déjà comptés au-dessus, et
  -- le total du bloc additionne les deux seaux.
  cash AS (
    SELECT cp.amount_cents AS cents
    FROM public.box_cash_payments cp
    WHERE cp.box_id = p_box_id
      AND cp.source <> 'program'
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
GRANT EXECUTE ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) TO authenticated;
