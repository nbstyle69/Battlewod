-- Lot 0 — frontière coach : l'argent et l'administratif passent en owner/co-owner.
--
-- `is_box_admin()` accepte `role IN ('owner','coach')`. Mesuré au vrai JWT coach
-- (scripts/_r4_frontiere_coach_proto.mjs), un coach lisait le MRR, les impayés,
-- le journal comptoir nominatif et le funnel, et surtout ÉCRIVAIT dans le journal
-- des encaissements en ajout seul (`record_member_cash_payment`) — le journal qui
-- sert ensuite de preuve dans Stats et Abonnés.
--
-- Les 12 fonctions ci-dessous sont reprises telles quelles depuis la production :
-- seule la ligne de garde change. L'assiduité, les présences, la heatmap et les
-- e-mails de membres restent ouverts au coach — c'est son métier.

CREATE OR REPLACE FUNCTION public.is_box_owner_admin(p_box_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id
        AND member_id = auth.uid()
        AND role = 'owner'                       -- co-gérant, PAS le coach
        AND COALESCE(status, 'active') = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    );
$function$;

REVOKE ALL ON FUNCTION public.is_box_owner_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_box_owner_admin(uuid) TO authenticated, service_role;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_box_money_people(p_box_id uuid)
 RETURNS TABLE(kind text, ref_id uuid, member_id uuid, label text, email text, amount_cents integer, since timestamp with time zone, detail text)
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_box_plan_breakdown(p_box_id uuid)
 RETURNS TABLE(plan_id uuid, plan_name text, plan_color text, price_cents integer, subs integer, mrr_cents bigint)
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
  SELECT mp.id, mp.name, mp.color, mp.price_cents,
         count(bm.id)::integer,
         -- Le LEFT JOIN produit une ligne fantôme pour une formule sans
         -- abonné : sans ce garde, `coalesce(bm.amount_cents, mp.price_cents)`
         -- retomberait sur le prix affiché et facturerait un abonné inexistant.
         coalesce(sum(CASE WHEN bm.id IS NULL THEN 0
                           ELSE coalesce(bm.amount_cents, mp.price_cents, 0) END), 0)::bigint
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_member_cash_payment(p_box_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m        public.box_members;
  v_logged uuid;
BEGIN
  SELECT * INTO m FROM public.box_members WHERE id = p_box_member_id;

  IF m.id IS NULL OR NOT public.is_box_owner_admin(m.box_id) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_box_funnel_summary(p_box_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(prospects integer, prospects_converted integer, invitations_sent integer, invitations_accepted integer, members_joined integer, members_subscribed integer)
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
  WITH cohorte AS (
    -- Les adhésions de la période, avec leur état d'abonnement actuel : c'est
    -- la même population qu'on suit d'un étage à l'autre.
    SELECT bm.subscription_status
    FROM public.box_members bm
    WHERE bm.box_id = p_box_id
      AND bm.role = 'member'
      AND bm.joined_at >= p_from
      AND bm.joined_at <  p_to
  )
  SELECT
    (SELECT count(*)::integer FROM public.session_followups sf
      WHERE sf.box_id = p_box_id
        AND sf.first_seen_at >= p_from AND sf.first_seen_at < p_to),
    (SELECT count(*)::integer FROM public.session_followups sf
      WHERE sf.box_id = p_box_id
        AND sf.first_seen_at >= p_from AND sf.first_seen_at < p_to
        AND sf.status = 'converted'),
    (SELECT count(*)::integer FROM public.box_invitations bi
      WHERE bi.box_id = p_box_id
        AND bi.created_at >= p_from AND bi.created_at < p_to),
    -- Une invitation acceptée est datée par `accepted_at` : la compter sur
    -- `created_at` daterait la conversion du jour de l'envoi.
    (SELECT count(*)::integer FROM public.box_invitations bi
      WHERE bi.box_id = p_box_id
        AND bi.accepted_at >= p_from AND bi.accepted_at < p_to),
    (SELECT count(*)::integer FROM cohorte),
    (SELECT count(*)::integer FROM cohorte WHERE subscription_status = 'active');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_box_invitation(p_box_id uuid, p_email text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_plan_id uuid DEFAULT NULL::uuid, p_payment_mode text DEFAULT 'box'::text, p_cash_collected boolean DEFAULT false, p_valid_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_token   text;
  v_id      uuid;
  v_days    integer := least(greatest(coalesce(p_valid_days, 7), 1), 30);
  v_blocker text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_box_owner_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF coalesce(p_payment_mode, 'box') NOT IN ('box', 'stripe') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE: mode de paiement inconnu' USING ERRCODE = 'check_violation';
  END IF;

  -- La formule doit appartenir à CETTE box : sinon un gérant rattacherait ses
  -- membres au tarif d'une autre salle.
  IF p_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.membership_plans
    WHERE id = p_plan_id AND box_id = p_box_id
  ) THEN
    RAISE EXCEPTION 'PLAN_NOT_IN_BOX: cette formule n''appartient pas à la box'
      USING ERRCODE = 'check_violation';
  END IF;

  v_blocker := public.invitation_target_blocker(p_box_id, v_email);

  IF v_blocker = 'email_invalide' THEN
    RAISE EXCEPTION 'INVALID_EMAIL: adresse e-mail invalide' USING ERRCODE = 'check_violation';
  ELSIF v_blocker = 'membre_exclu' THEN
    RAISE EXCEPTION 'MEMBER_BANNED: cette personne est exclue de la box'
      USING ERRCODE = 'check_violation';
  ELSIF v_blocker = 'deja_membre' THEN
    RAISE EXCEPTION 'MEMBER_EXISTS: cette personne est déjà membre de ta box'
      USING ERRCODE = 'check_violation';
  ELSIF v_blocker = 'invitation_en_attente' THEN
    RAISE EXCEPTION 'INVITATION_EXISTS: une invitation est déjà en attente pour cette adresse'
      USING ERRCODE = 'unique_violation';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.box_invitations (
    box_id, email, first_name, last_name, plan_id,
    payment_mode, cash_collected, token_hash, expires_at, created_by
  ) VALUES (
    p_box_id, v_email, nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    p_plan_id,
    coalesce(p_payment_mode, 'box'),
    coalesce(p_payment_mode, 'box') = 'box' AND coalesce(p_cash_collected, false),
    encode(sha256(v_token::bytea), 'hex'),
    now() + make_interval(days => v_days),
    auth.uid()
  )
  RETURNING id INTO v_id;

  -- Le jeton brut ne sera plus jamais lisible après ce retour.
  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'token', v_token,
    'email', v_email, 'expires_at', now() + make_interval(days => v_days)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_box_invitations_bulk(p_box_id uuid, p_rows jsonb, p_valid_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row      jsonb;
  v_email    text;
  v_plan     uuid;
  v_blocker  text;
  v_token    text;
  v_id       uuid;
  v_days     integer := least(greatest(coalesce(p_valid_days, 14), 1), 30);
  v_line     integer := 0;
  v_created  integer := 0;
  v_ignored  integer := 0;
  v_refused  integer := 0;
  v_seen     text[]  := ARRAY[]::text[];
  v_results  jsonb   := '[]'::jsonb;
  v_verdict  text;
  v_reason   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_box_owner_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD: liste de lignes attendue' USING ERRCODE = 'check_violation';
  END IF;

  -- Plafond : un import est une reprise d'effectif, pas un publipostage.
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_ROWS: 500 lignes maximum par import'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_line   := v_line + 1;
    v_email  := lower(btrim(coalesce(v_row->>'email', '')));
    v_verdict := NULL;
    v_reason  := NULL;
    v_id      := NULL;

    BEGIN
      v_plan := nullif(v_row->>'plan_id', '')::uuid;
    EXCEPTION WHEN others THEN
      v_plan := NULL;
      v_verdict := 'refusee';
      v_reason  := 'formule_inconnue';
    END;

    IF v_verdict IS NULL AND v_plan IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.membership_plans WHERE id = v_plan AND box_id = p_box_id
    ) THEN
      -- Couvre le fichier piégé : une formule d'une AUTRE box est inconnue ici.
      v_verdict := 'refusee';
      v_reason  := 'formule_inconnue';
    END IF;

    -- Doublon interne au fichier : la première ligne gagne, les suivantes sont
    -- ignorées sans jamais devenir une seconde invitation vivante.
    IF v_verdict IS NULL AND v_email = ANY (v_seen) THEN
      v_verdict := 'ignoree';
      v_reason  := 'doublon_fichier';
    END IF;

    IF v_verdict IS NULL THEN
      v_blocker := public.invitation_target_blocker(p_box_id, v_email);
      IF v_blocker = 'email_invalide' THEN
        v_verdict := 'refusee'; v_reason := 'email_invalide';
      ELSIF v_blocker = 'membre_exclu' THEN
        v_verdict := 'refusee'; v_reason := 'membre_exclu';
      ELSIF v_blocker = 'deja_membre' THEN
        v_verdict := 'ignoree'; v_reason := 'deja_membre';
      ELSIF v_blocker = 'invitation_en_attente' THEN
        v_verdict := 'ignoree'; v_reason := 'invitation_en_attente';
      END IF;
    END IF;

    IF v_verdict IS NULL THEN
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      INSERT INTO public.box_invitations (
        box_id, email, first_name, last_name, plan_id,
        payment_mode, cash_collected, token_hash, expires_at, created_by
      ) VALUES (
        p_box_id, v_email,
        nullif(btrim(coalesce(v_row->>'first_name', '')), ''),
        nullif(btrim(coalesce(v_row->>'last_name', '')), ''),
        v_plan, 'box', false,
        encode(sha256(v_token::bytea), 'hex'),
        now() + make_interval(days => v_days),
        auth.uid()
      )
      RETURNING id INTO v_id;
      v_verdict := 'creee';
      v_seen    := v_seen || v_email;
    END IF;

    IF    v_verdict = 'creee'   THEN v_created := v_created + 1;
    ELSIF v_verdict = 'ignoree' THEN v_ignored := v_ignored + 1;
    ELSE                             v_refused := v_refused + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'line', coalesce((v_row->>'line')::integer, v_line),
      'email', v_email,
      'verdict', v_verdict,
      'reason', v_reason,
      'invitation_id', v_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'total',   v_line,
    'created', v_created,
    'ignored', v_ignored,
    'refused', v_refused,
    'results', v_results
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_box_invitation_paid(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        public.box_invitations;
  v_logged uuid;
BEGIN
  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;

  IF r.id IS NULL OR NOT public.is_box_owner_admin(r.box_id) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.mark_box_invitation_sent(p_invitation_id uuid, p_error text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.box_invitations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: invitation introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_box_owner_admin(r.box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.box_invitations
  SET last_sent_at    = now(),
      last_send_error = nullif(btrim(coalesce(p_error, '')), ''),
      send_count      = send_count + 1
  WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'id', r.id, 'delivered', p_error IS NULL);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_box_invitation(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.box_invitations;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: invitation introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_box_owner_admin(r.box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Révoquer une invitation déjà acceptée ne retirerait rien au membre : ce
  -- serait un faux geste de sécurité. L'exclusion passe par box_members.
  IF r.status = 'accepted' THEN
    RAISE EXCEPTION 'ALREADY_ACCEPTED: cette invitation a déjà été utilisée'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.box_invitations SET status = 'revoked' WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'id', r.id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rotate_box_invitation_token(p_invitation_id uuid, p_valid_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r       public.box_invitations;
  v_token text;
  v_days  integer := least(greatest(coalesce(p_valid_days, 7), 1), 30);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: invitation introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_box_owner_admin(r.box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Une invitation acceptée ou révoquée ne se relance pas : elle se recrée.
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'NOT_PENDING: cette invitation n''est plus en attente'
      USING ERRCODE = 'check_violation';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.box_invitations
  SET token_hash = encode(sha256(v_token::bytea), 'hex'),
      expires_at = now() + make_interval(days => v_days)
  WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true, 'id', r.id, 'token', v_token, 'email', r.email,
    'expires_at', now() + make_interval(days => v_days)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reactivate_box_member(p_box_id uuid, p_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_box_owner_admin(p_box_id) THEN
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
$function$
;


-- Policies : le journal comptoir et les invitations nominatives suivent la même
-- frontière que les RPC qui les alimentent.
DROP POLICY IF EXISTS "box_cash_payments_admin_read" ON public.box_cash_payments;
CREATE POLICY "box_cash_payments_owner_read"
ON public.box_cash_payments
FOR SELECT
TO authenticated
USING (public.is_box_owner_admin(box_id));

DROP POLICY IF EXISTS "box_invitations_admin_manage" ON public.box_invitations;
CREATE POLICY "box_invitations_owner_manage"
ON public.box_invitations
FOR ALL
TO authenticated
USING (public.is_box_owner_admin(box_id))
WITH CHECK (public.is_box_owner_admin(box_id));
