-- Lot 0-bis (suite) — la carte « Programmes ce mois » ne compte que l'encaissé.
--
-- `/api/box-revenue` filtrait déjà `provenance='stripe'`, mais la carte de
-- Stats lit `get_box_money_summary`, dont la CTE `progs` ne filtrait que
-- `status <> 'refunded'`. Deux surfaces d'argent, deux filtres : sur la MÊME
-- page, le graphe « Encaissé sur 6 mois » excluait une ligne
-- `legacy_unverified` (770 €) pendant que la carte l'incluait (40 €). Mesuré au
-- navigateur contre la production — c'est la contradiction qui a livré le
-- défaut, pas la lecture du SQL.
--
-- Le reste de la fonction est identique à la définition en place (reprise
-- telle quelle depuis la base pour ne rien perdre au passage).

CREATE OR REPLACE FUNCTION public.get_box_money_summary(p_box_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(mrr_stripe_cents bigint, mrr_stripe_subs integer, mrr_cash_cents bigint, mrr_cash_subs integer, past_due_count integer, past_due_cents bigint, cash_to_collect_count integer, cash_to_collect_cents bigint, cancellations_period integer, new_subs_period integer, program_revenue_cents bigint, program_sales_period integer, cash_collected_cents bigint, cash_collected_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;


REVOKE ALL     ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_box_money_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;
