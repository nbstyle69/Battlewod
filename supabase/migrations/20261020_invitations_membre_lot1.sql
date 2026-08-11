-- ============================================================================
-- 20261020 — Lot 1 : invitations nominatives créées par le gérant
--
-- Le gérant crée une invitation (prénom/nom, e-mail, formule, mode de paiement)
-- et la délivre par lien / QR / e-mail. Le destinataire ouvre une page publique
-- pré-remplie, crée son compte, et se retrouve rattaché à la box avec la bonne
-- formule.
--
-- Ce lot ne contient que la part serveur : la table, ses gardes, et les quatre
-- RPC qui l'encadrent. Rien n'est appelé par une app tant que les lots 2 à 4 ne
-- sont pas livrés — la migration est donc inerte à l'application.
--
-- Choix structurants :
--
--  • Le jeton n'est JAMAIS stocké en clair. La table ne garde que son SHA-256 ;
--    la valeur brute n'est renvoyée qu'une fois, à la création. Une fuite de la
--    base ne donne donc aucun lien utilisable.
--
--  • `peek_box_invitation()` est la seule lecture ouverte à `anon`, et elle ne
--    renvoie que ce que le destinataire doit voir pour se décider : nom de la
--    box, formule, son propre prénom. Ni le créateur de l'invitation, ni les
--    autres invitations, ni quoi que ce soit d'une autre box.
--
--  • `consume_box_invitation()` ne prend AUCUN identifiant de box : la cible
--    est lue dans l'invitation. Un jeton de la box A ne peut pas rattacher à B.
--
--  • L'activation d'un membre en mode `stripe` ne vient jamais d'ici : la
--    consommation le pose « en attente de paiement », et seul le webhook Stripe
--    l'activera (lot 4).
-- ============================================================================

-- ── 1. La table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.box_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES public.boxes(id)            ON DELETE CASCADE,
  email           text NOT NULL,
  first_name      text,
  last_name       text,
  plan_id         uuid          REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  payment_mode    text NOT NULL DEFAULT 'box',
  -- Case « Paiement déjà encaissé » du formulaire. Cochée : le membre est actif
  -- dès la création de son compte. Décochée : il arrive « à encaisser » et le
  -- gérant bascule en un clic (mark_box_invitation_paid).
  cash_collected  boolean NOT NULL DEFAULT false,
  token_hash      text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending',
  expires_at      timestamptz NOT NULL,
  created_by      uuid          REFERENCES public.profiles(id)         ON DELETE SET NULL,
  accepted_by     uuid          REFERENCES public.profiles(id)         ON DELETE SET NULL,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_invitations_payment_mode_check
    CHECK (payment_mode IN ('box', 'stripe')),
  CONSTRAINT box_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  -- Un encaissement comptoir n'a pas de sens sur le circuit Stripe.
  CONSTRAINT box_invitations_cash_only_on_box_mode
    CHECK (payment_mode = 'box' OR cash_collected = false),
  CONSTRAINT box_invitations_email_lowercase
    CHECK (email = lower(btrim(email)) AND email <> '')
);

COMMENT ON TABLE  public.box_invitations IS
  'Invitations nominatives émises par un gérant de box. Le jeton n''est stocké que haché : la valeur brute n''existe que dans le lien remis au destinataire.';
COMMENT ON COLUMN public.box_invitations.token_hash IS
  'SHA-256 hexadécimal du jeton. Aucune colonne ne contient le jeton en clair.';
COMMENT ON COLUMN public.box_invitations.cash_collected IS
  'Mode box : paiement encaissé au comptoir. Conditionne l''activation du membre.';

-- Une seule invitation vivante par (box, e-mail) : sans ça, deux liens
-- concurrents rattacheraient deux fois la même personne à des formules
-- différentes selon celui qu'elle ouvre.
CREATE UNIQUE INDEX IF NOT EXISTS box_invitations_one_pending_per_email
  ON public.box_invitations (box_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS box_invitations_box_created_idx
  ON public.box_invitations (box_id, created_at DESC);

-- ── 2. RLS : la table n'est lisible que par les admins de SA box ───────────
--
-- Le destinataire, lui, n'a aucun accès direct : il passe par
-- `peek_box_invitation()` (SECURITY DEFINER), qui filtre les colonnes.

ALTER TABLE public.box_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_invitations_admin_manage ON public.box_invitations;
CREATE POLICY box_invitations_admin_manage
  ON public.box_invitations
  TO authenticated
  USING      (public.is_box_admin(box_id))
  WITH CHECK (public.is_box_admin(box_id));

REVOKE ALL ON public.box_invitations FROM anon;

-- ── 3. Création — réservée aux admins de la box ────────────────────────────

CREATE OR REPLACE FUNCTION public.create_box_invitation(
  p_box_id         uuid,
  p_email          text,
  p_first_name     text    DEFAULT NULL,
  p_last_name      text    DEFAULT NULL,
  p_plan_id        uuid    DEFAULT NULL,
  p_payment_mode   text    DEFAULT 'box',
  p_cash_collected boolean DEFAULT false,
  p_valid_days     integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_id    uuid;
  v_days  integer := least(greatest(coalesce(p_valid_days, 7), 1), 30);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'INVALID_EMAIL: adresse e-mail invalide' USING ERRCODE = 'check_violation';
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

  -- Invitation déjà vivante pour cette adresse : on ne la double pas
  -- silencieusement, l'écran proposera de la relancer ou de la révoquer.
  UPDATE public.box_invitations
  SET status = 'revoked'
  WHERE box_id = p_box_id AND email = v_email
    AND status = 'pending' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.box_invitations
    WHERE box_id = p_box_id AND email = v_email AND status = 'pending'
  ) THEN
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
$$;

COMMENT ON FUNCTION public.create_box_invitation(uuid, text, text, text, uuid, text, boolean, integer) IS
  'Crée une invitation nominative pour une box administrée par l''appelant. Renvoie le jeton en clair une seule fois.';

-- ── 4. Lecture publique par jeton — surface minimale ───────────────────────
--
-- Ouverte à `anon` : le destinataire n'a pas encore de compte. Ne renvoie donc
-- que ce dont la page d'inscription a besoin, et rien qui appartienne au gérant
-- ou aux autres membres.

CREATE OR REPLACE FUNCTION public.peek_box_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r      public.box_invitations;
  v_box  public.boxes;
  v_plan public.membership_plans;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_absent');
  END IF;

  SELECT * INTO r FROM public.box_invitations
  WHERE token_hash = encode(sha256(btrim(p_token)::bytea), 'hex');

  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_introuvable');
  END IF;
  IF r.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_revoquee');
  END IF;
  IF r.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_deja_utilisee');
  END IF;
  IF r.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_expiree');
  END IF;

  SELECT * INTO v_box  FROM public.boxes            WHERE id = r.box_id;
  SELECT * INTO v_plan FROM public.membership_plans WHERE id = r.plan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'email',        r.email,          -- son propre e-mail : il le connaît déjà
    'first_name',   r.first_name,
    'last_name',    r.last_name,
    'payment_mode', r.payment_mode,
    'expires_at',   r.expires_at,
    'box', jsonb_build_object(
      'name', v_box.name, 'slug', v_box.slug,
      'city', v_box.city, 'logo_url', v_box.logo_url
    ),
    'plan', CASE WHEN v_plan.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', v_plan.name, 'description', v_plan.description,
      'price_cents', v_plan.price_cents, 'currency', v_plan.currency,
      'plan_type', v_plan.plan_type,
      'max_sessions_per_week', v_plan.max_sessions_per_week,
      'commitment_months', v_plan.commitment_months
    ) END
  );
END;
$$;

COMMENT ON FUNCTION public.peek_box_invitation(text) IS
  'Lecture publique d''une invitation par jeton : box, formule et destinataire uniquement. N''expose ni le créateur, ni les autres invitations.';

-- ── 5. Consommation — usage unique, liée à l'e-mail ────────────────────────

CREATE OR REPLACE FUNCTION public.consume_box_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r             public.box_invitations;
  v_uid         uuid := auth.uid();
  v_user_email  text;
  v_member      public.box_members;
  v_status      text;
  v_sub_status  text;
  v_pay_method  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO r FROM public.box_invitations
  WHERE token_hash = encode(sha256(btrim(coalesce(p_token, ''))::bytea), 'hex')
  FOR UPDATE;

  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_introuvable');
  END IF;

  -- Rejeu du même lien par la même personne : succès sans double effet.
  IF r.status = 'accepted' THEN
    IF r.accepted_by = v_uid THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'box_id', r.box_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_deja_utilisee');
  END IF;

  IF r.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_revoquee');
  END IF;
  IF r.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_expiree');
  END IF;

  -- L'invitation est nominative : le compte doit porter l'adresse invitée.
  -- Sans ce contrôle, un lien qui fuite rattacherait n'importe qui.
  SELECT lower(btrim(email)) INTO v_user_email FROM public.profiles WHERE id = v_uid;
  IF v_user_email IS NULL OR v_user_email <> r.email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_non_correspondant');
  END IF;

  -- État de départ du membre.
  --   box   + encaissé   → actif tout de suite (l'argent est en caisse)
  --   box   sans encaiss.→ « à encaisser » : rattaché, sans accès
  --   stripe             → « en attente de paiement » : seul le webhook active
  IF r.payment_mode = 'box' AND r.cash_collected THEN
    v_status     := 'active';
    v_sub_status := 'active';
    v_pay_method := 'cash';
  ELSIF r.payment_mode = 'box' THEN
    v_status     := 'inactive';
    v_sub_status := 'pending_cash';
    v_pay_method := 'cash';
  ELSE
    v_status     := 'inactive';
    v_sub_status := 'pending_payment';
    v_pay_method := NULL;
  END IF;

  SELECT * INTO v_member FROM public.box_members
  WHERE box_id = r.box_id AND member_id = v_uid;

  IF v_member.id IS NULL THEN
    INSERT INTO public.box_members (
      box_id, member_id, role, plan_id, status, subscription_status, payment_method_type
    ) VALUES (
      r.box_id, v_uid, 'member', r.plan_id, v_status, v_sub_status, v_pay_method
    )
    ON CONFLICT (box_id, member_id) DO NOTHING;
  ELSE
    -- Un membre banni ne revient pas par une invitation : ce serait contourner
    -- la décision du gérant qui l'a exclu.
    IF v_member.status = 'banned' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'membre_exclu');
    END IF;

    -- Déjà membre actif (le gérant lui vend une formule) : on ne le rétrograde
    -- jamais. Le statut ne peut que monter.
    UPDATE public.box_members SET
      plan_id             = coalesce(r.plan_id, plan_id),
      status              = CASE WHEN status = 'active' THEN 'active' ELSE v_status END,
      subscription_status = CASE WHEN status = 'active' AND v_status <> 'active'
                                 THEN subscription_status ELSE v_sub_status END,
      payment_method_type = coalesce(v_pay_method, payment_method_type)
    WHERE id = v_member.id;
  END IF;

  UPDATE public.box_invitations
  SET status = 'accepted', accepted_by = v_uid, accepted_at = now()
  WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'box_id', r.box_id, 'plan_id', r.plan_id,
    'payment_mode', r.payment_mode,
    'member_status', v_status, 'subscription_status', v_sub_status
  );
END;
$$;

COMMENT ON FUNCTION public.consume_box_invitation(text) IS
  'Consomme une invitation pour auth.uid() : usage unique, e-mail contrôlé, box lue dans l''invitation. En mode stripe, ne fait qu''inscrire « en attente de paiement » — l''activation reste au webhook.';

-- ── 6. Encaissement comptoir — un clic côté gérant ─────────────────────────

CREATE OR REPLACE FUNCTION public.mark_box_invitation_paid(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r public.box_invitations;
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

  UPDATE public.box_invitations SET cash_collected = true WHERE id = r.id;

  -- Le membre a déjà créé son compte : l'encaissement l'active. Sinon la
  -- consommation le fera, l'invitation portant désormais le paiement.
  IF r.accepted_by IS NOT NULL THEN
    UPDATE public.box_members SET
      status              = CASE WHEN status = 'banned' THEN status ELSE 'active' END,
      subscription_status = CASE WHEN status = 'banned' THEN subscription_status ELSE 'active' END,
      payment_method_type = 'cash'
    WHERE box_id = r.box_id AND member_id = r.accepted_by;
  END IF;

  RETURN jsonb_build_object('ok', true, 'activated', r.accepted_by IS NOT NULL);
END;
$$;

COMMENT ON FUNCTION public.mark_box_invitation_paid(uuid) IS
  'Marque une invitation « mode box » comme encaissée au comptoir et active le membre s''il a déjà créé son compte.';

-- ── 7. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.create_box_invitation(uuid, text, text, text, uuid, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_box_invitation(uuid, text, text, text, uuid, text, boolean, integer) TO authenticated, service_role;

-- Seule ouverture à `anon` du lot : le destinataire n'a pas encore de compte.
REVOKE ALL ON FUNCTION public.peek_box_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_box_invitation(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_box_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_box_invitation(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_box_invitation_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_box_invitation_paid(uuid) TO authenticated, service_role;
