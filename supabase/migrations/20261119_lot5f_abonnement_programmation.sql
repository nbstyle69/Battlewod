-- ═════════════════════════════════════════════════════════════════════════════
-- Lot 5-F — une offre de programmation payante ne s'obtient plus sans payer.
--
-- Constat mesuré avant ce lot, au vrai JWT sur pile jetable :
--
--   avant abonnement : le coach ne lit pas le contenu payant        0 ligne
--   coach s'abonne lui-même à une offre à 99 €/mois                 accordé
--   après abonnement auto-posé : le contenu payant est lisible       1 ligne
--   le GÉRANT fait de même                                          accordé
--
-- Pourquoi : le marché box→box a deux portes. Les offres PAYANTES passent par
-- `/api/create-programming-checkout` (garde gérant, Stripe Connect, abonnement
-- posé par le webhook signé) ; les offres GRATUITES sont posées par un `insert`
-- client direct, gardé par la seule policy `box_prog_subs_write`, qui vérifie
-- « je gère cette box » et **ne regarde pas le prix de l'offre**. Le client
-- choisissait donc sa porte : celle du gratuit servait la marchandise payante.
-- `box_subscribes_programming()` déverrouille ensuite `box_programming_wods`
-- sur le seul `status='active'`, sans regarder qui a écrit la ligne. La box
-- éditrice perd la vente.
--
-- C'est la famille de `member_join_program` du lot 0-bis, un étage plus haut :
-- box→box au lieu de membre→programme. Le correctif est de la même forme —
-- deux portes, toutes deux vérifiées côté serveur :
--
--   payant   → `status='active'` réservé au backend signé (`request_is_backend()`,
--              donc au webhook Stripe) ;
--   gratuit  → `subscribe_free_programming()`, qui vérifie elle-même
--              `price_cents = 0 AND billing = 'free'`.
--
-- Deuxième volet : publier une offre et en fixer le prix passe en
-- `is_box_owner_admin`. Fixer un prix est une décision d'argent — le web
-- l'interdit déjà au coach (`/programming` est gardée gérant) ; le serveur, non.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La garde d'activation. Elle est portée par un TRIGGER et non par la
--    policy, parce que la décision dépend du PRIX de l'offre visée — une
--    ligne d'une autre table — et qu'un `WITH CHECK` qui la joint resterait
--    muet sur le motif du refus. Ici la base prononce le refus, nommé.
--
--    Elle ne se déclenche que sur le PASSAGE à `active` (insert, ou update
--    depuis un autre statut) : la bascule `auto_apply_weekly` du staff et la
--    résiliation restent des gestes ouverts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_box_programming_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paid           boolean;
  v_backend        boolean := public.request_is_backend();
  v_devient_active boolean;
  v_pose_stripe    boolean;
BEGIN
  SELECT COALESCE(p.price_cents, 0) > 0 OR COALESCE(p.billing, 'free') <> 'free'
    INTO v_paid
  FROM public.box_programming p
  WHERE p.id = NEW.programming_id;

  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'Programmation introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_devient_active := NEW.status = 'active';
    v_pose_stripe := NEW.stripe_subscription_id IS NOT NULL
                  OR NEW.stripe_customer_id IS NOT NULL
                  OR NEW.current_period_end IS NOT NULL;
  ELSE
    v_devient_active := NEW.status = 'active' AND OLD.status <> 'active';
    v_pose_stripe := NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
                  OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
                  OR NEW.current_period_end     IS DISTINCT FROM OLD.current_period_end;
  END IF;

  IF v_devient_active AND v_paid AND NOT v_backend THEN
    RAISE EXCEPTION
      'PAID_PROGRAMMING : une offre payante s''active par le paiement (webhook Stripe), pas par le client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Les références Stripe sont posées par le backend, jamais revendiquées par
  -- un client : sans cela, un client modifié se déclarerait payé.
  IF v_pose_stripe AND NOT v_backend THEN
    RAISE EXCEPTION
      'PAID_PROGRAMMING : les références de paiement sont posées par le backend'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_box_programming_subscription
  ON public.box_programming_subscriptions;

CREATE TRIGGER trg_guard_box_programming_subscription
  BEFORE INSERT OR UPDATE ON public.box_programming_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_box_programming_subscription();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La porte du gratuit, vérifiée par le serveur. Le client ne déclare plus
--    « cette offre est gratuite » : la fonction le lit dans l'offre.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscribe_free_programming(
  p_programming_id uuid,
  p_subscriber_box_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prog   record;
  v_anchor date := (now() AT TIME ZONE 'Europe/Paris')::date
                   - EXTRACT(isodow FROM (now() AT TIME ZONE 'Europe/Paris'))::integer + 1;
  v_id     uuid;
BEGIN
  IF NOT public.manages_box(p_subscriber_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou coach de la box requis'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, publisher_box_id, is_published, COALESCE(price_cents, 0) AS price_cents,
         COALESCE(billing, 'free') AS billing
    INTO v_prog
  FROM public.box_programming
  WHERE id = p_programming_id;

  IF v_prog.id IS NULL THEN
    RAISE EXCEPTION 'Programmation introuvable' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_prog.is_published THEN
    RAISE EXCEPTION 'Cette programmation n''est pas publiée' USING ERRCODE = 'check_violation';
  END IF;
  IF v_prog.publisher_box_id = p_subscriber_box_id THEN
    RAISE EXCEPTION 'Une box ne s''abonne pas à sa propre offre' USING ERRCODE = 'check_violation';
  END IF;
  IF v_prog.price_cents > 0 OR v_prog.billing <> 'free' THEN
    RAISE EXCEPTION
      'PAID_PROGRAMMING : cette offre est payante — elle passe par le paiement Stripe'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.box_programming_subscriptions
    (programming_id, subscriber_box_id, status, week_anchor, created_by)
  VALUES (p_programming_id, p_subscriber_box_id, 'active', v_anchor, auth.uid())
  ON CONFLICT (programming_id, subscriber_box_id)
  DO UPDATE SET status = 'active', created_by = COALESCE(auth.uid(), public.box_programming_subscriptions.created_by)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('subscription_id', v_id, 'status', 'active');
END;
$function$;

REVOKE ALL ON FUNCTION public.subscribe_free_programming(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.subscribe_free_programming(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Publier une offre et en fixer le prix : décision d'argent, donc gérant ou
--    co-gérant. La LECTURE du catalogue reste ouverte au coach (policy
--    `box_programming_select`, inchangée) : consulter n'est pas vendre.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "box_programming_write" ON public.box_programming;

CREATE POLICY "box_programming_write"
ON public.box_programming
TO authenticated
USING (public.is_box_owner_admin(publisher_box_id))
WITH CHECK (public.is_box_owner_admin(publisher_box_id));
