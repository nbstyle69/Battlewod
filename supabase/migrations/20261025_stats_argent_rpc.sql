-- Statistiques — bloc Argent : agrégats servis côté serveur.
--
-- Pourquoi une RPC plutôt que des lectures client : `box_members` n'a PAS de
-- GRANT SELECT au niveau table pour `authenticated`. Le durcissement de la
-- facturation n'a accordé que 14 colonnes ; `amount_cents`, `past_due_since`,
-- `dunning_*`, `payment_method_type` et les identifiants Stripe restent fermés.
-- Toute lecture client de ces colonnes renvoie 42501 — et, si l'appelant ne
-- déstructure que la donnée, un zéro parfaitement crédible. C'est exactement le
-- bug qui a fait afficher « Total membres 0 » sur une box de 39 adhérents.
--
-- Les trois fonctions sont donc SECURITY DEFINER, gardées par `is_box_admin`,
-- et ne rendent QUE des agrégats de la box demandée. Un gérant d'une autre box
-- n'obtient pas zéro ligne par filtrage : il reçoit une exception.
--
-- Période : les fonctions d'agrégat prennent un intervalle [p_from, p_to). La
-- comparaison « vs période précédente » de l'écran est obtenue en rappelant la
-- même fonction sur l'intervalle précédent — aucune logique de date dupliquée
-- côté serveur.

BEGIN;

-- ── 1. Synthèse argent ────────────────────────────────────────────────────
--
-- Deux natures de chiffres, à ne pas confondre :
--   • stock  (mrr_*)  : engagement mensuel courant, indépendant de la période ;
--   • flux   (*_period) : ce qui s'est passé entre p_from et p_to.
--
-- Le MRR comptoir est *théorique* : un abonnement encaissé en espèces ne laisse
-- aucune trace de paiement (ni montant réglé, ni date). On l'expose séparément
-- pour que l'écran puisse le dire, au lieu de le fondre dans un total qui
-- laisserait croire à de l'encaissé prouvé.

CREATE OR REPLACE FUNCTION public.get_box_money_summary(
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
  program_sales_period    integer
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
    (SELECT count(*)::integer FROM progs);
END;
$$;

COMMENT ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) IS
  'Synthèse argent d''une box (admin de la box uniquement). mrr_cash_* est théorique : un encaissement comptoir ne laisse aucune trace de paiement.';

-- ── 2. Répartition par formule ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_box_plan_breakdown(p_box_id uuid)
RETURNS TABLE (
  plan_id     uuid,
  plan_name   text,
  plan_color  text,
  price_cents integer,
  subs        integer,
  mrr_cents   bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT mp.id, mp.name, mp.color, mp.price_cents,
         count(bm.id)::integer,
         coalesce(sum(coalesce(bm.amount_cents, mp.price_cents, 0)), 0)::bigint
  FROM public.membership_plans mp
  LEFT JOIN public.box_members bm
    ON bm.plan_id = mp.id
   AND bm.box_id = p_box_id
   AND bm.subscription_status = 'active'
  WHERE mp.box_id = p_box_id
    AND mp.plan_type = 'subscription'
  GROUP BY mp.id, mp.name, mp.color, mp.price_cents, mp.sort_order
  ORDER BY mp.sort_order NULLS LAST, mp.price_cents DESC;
END;
$$;

-- ── 3. Les personnes derrière les agrégats ────────────────────────────────
--
-- Exigence produit : un chiffre qui recouvre des personnes doit mener aux
-- personnes. `get_box_dunning` sert déjà le panneau d'impayés de l'écran
-- Abonnés ; on ne le remplace pas, mais la page Statistiques a besoin des deux
-- natures d'argent en attente dans une seule liste ordonnée par ancienneté,
-- pour que le gérant traite le plus vieux d'abord quelle qu'en soit l'origine.
-- Deux natures, distinguées par `kind` :
--   'past_due'    impayé Stripe en cours (le membre existe déjà) ;
--   'cash'        invitation comptoir non encaissée (pas encore de membre).
--
-- L'e-mail n'est rendu que pour les invitations, où il est la seule identité
-- disponible ; pour un membre, l'écran a déjà la RPC d'e-mails réservée aux
-- admins et il n'y a pas de raison d'en ouvrir une seconde voie.

CREATE OR REPLACE FUNCTION public.get_box_money_people(p_box_id uuid)
RETURNS TABLE (
  kind        text,
  ref_id      uuid,
  member_id   uuid,
  label       text,
  email       text,
  amount_cents integer,
  since       timestamptz,
  detail      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 'past_due'::text,
         bm.id,
         bm.member_id,
         coalesce(pr.username, '—'),
         NULL::text,
         coalesce(bm.amount_cents, mp.price_cents, 0),
         bm.past_due_since,
         bm.last_payment_error
  FROM public.box_members bm
  LEFT JOIN public.profiles pr ON pr.id = bm.member_id
  LEFT JOIN public.membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.box_id = p_box_id
    AND bm.subscription_status = 'past_due'

  UNION ALL

  SELECT 'cash'::text,
         bi.id,
         bi.accepted_by,
         btrim(coalesce(bi.first_name, '') || ' ' || coalesce(bi.last_name, '')),
         bi.email,
         coalesce(mp.price_cents, 0),
         bi.created_at,
         mp.name
  FROM public.box_invitations bi
  LEFT JOIN public.membership_plans mp ON mp.id = bi.plan_id
  WHERE bi.box_id = p_box_id
    AND bi.payment_mode = 'box'
    AND bi.cash_collected = false
    AND bi.status <> 'revoked'

  ORDER BY 7 ASC NULLS LAST;
END;
$$;

-- ── 4. Grants ─────────────────────────────────────────────────────────────
--
-- `authenticated` seulement : l'appelant doit porter un JWT pour que
-- `is_box_admin` ait un `auth.uid()` à vérifier. Pas d'anon — la page est
-- derrière l'authentification, et ces agrégats sont de la donnée financière.

REVOKE ALL ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_box_plan_breakdown(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_box_money_people(uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_box_plan_breakdown(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_box_money_people(uuid)    TO authenticated, service_role;

COMMIT;
