-- ============================================================================
-- 20261021 — Lot 2 : consommation d'invitation depuis le serveur d'inscription
--
-- La page publique /rejoindre/[token] crée le compte puis rattache le membre
-- dans la foulée. Le rattachement ne peut donc pas s'appuyer sur `auth.uid()` :
-- au moment où la route serveur veut consommer l'invitation, le compte vient
-- d'être créé et la route ne détient pas (forcément) la session du nouvel
-- inscrit — la confirmation d'e-mail, si elle est réactivée un jour, ferait
-- disparaître la session que `signUp()` renvoie aujourd'hui.
--
-- Plutôt que de dupliquer les gardes dans TypeScript, la logique de 20261020
-- descend dans une fonction interne `_consume_box_invitation(token, user_id)`,
-- exposée par deux entrées :
--
--   consume_box_invitation(token)              → authenticated, cible auth.uid()
--   consume_box_invitation_for(token, user_id) → service_role UNIQUEMENT
--
-- La seconde ne relâche aucune garde : l'e-mail du compte doit toujours
-- correspondre à celui de l'invitation, l'usage reste unique, la box reste lue
-- dans l'invitation. Elle ne fait que nommer l'utilisateur au lieu de le
-- déduire du JWT. `service_role` pouvant déjà écrire directement dans
-- `box_members`, elle n'ouvre aucun pouvoir nouveau — elle ferme au contraire
-- la tentation de réimplémenter ces règles côté application.
--
-- Pourquoi pas `pending_entitlements` ici : `claim_pending_entitlements()` pose
-- systématiquement `status='active'` + `subscription_status='active'`. Une
-- invitation Stripe non payée, ou une invitation comptoir pas encore encaissée,
-- y deviendrait un abonné actif. Le filet 7A-bis reste ce qu'il est — le
-- rattrapage d'un PAIEMENT reçu sans compte — et le chemin invitation garde ses
-- trois états.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._consume_box_invitation(
  p_token   text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r            public.box_invitations;
  v_user_email text;
  v_member     public.box_members;
  v_status     text;
  v_sub_status text;
  v_pay_method text;
BEGIN
  IF p_user_id IS NULL THEN
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
    IF r.accepted_by = p_user_id THEN
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
  SELECT lower(btrim(email)) INTO v_user_email FROM public.profiles WHERE id = p_user_id;
  IF v_user_email IS NULL OR v_user_email <> r.email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_non_correspondant');
  END IF;

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
  WHERE box_id = r.box_id AND member_id = p_user_id;

  IF v_member.id IS NULL THEN
    INSERT INTO public.box_members (
      box_id, member_id, role, plan_id, status, subscription_status, payment_method_type
    ) VALUES (
      r.box_id, p_user_id, 'member', r.plan_id, v_status, v_sub_status, v_pay_method
    )
    ON CONFLICT (box_id, member_id) DO NOTHING;
  ELSE
    IF v_member.status = 'banned' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'membre_exclu');
    END IF;

    UPDATE public.box_members SET
      plan_id             = coalesce(r.plan_id, plan_id),
      status              = CASE WHEN status = 'active' THEN 'active' ELSE v_status END,
      subscription_status = CASE WHEN status = 'active' AND v_status <> 'active'
                                 THEN subscription_status ELSE v_sub_status END,
      payment_method_type = coalesce(v_pay_method, payment_method_type)
    WHERE id = v_member.id;
  END IF;

  UPDATE public.box_invitations
  SET status = 'accepted', accepted_by = p_user_id, accepted_at = now()
  WHERE id = r.id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'invitation_id', r.id,
    'box_id', r.box_id, 'plan_id', r.plan_id,
    'payment_mode', r.payment_mode,
    'member_status', v_status, 'subscription_status', v_sub_status
  );
END;
$$;

COMMENT ON FUNCTION public._consume_box_invitation(text, uuid) IS
  'Cœur de la consommation d''invitation. Interne : appelée par consume_box_invitation (auth.uid()) et consume_box_invitation_for (service_role).';

-- Entrée client : la cible reste auth.uid(), aucun identifiant en argument.
CREATE OR REPLACE FUNCTION public.consume_box_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._consume_box_invitation(p_token, auth.uid());
END;
$$;

-- Entrée serveur : réservée à service_role, pour la route d'inscription.
CREATE OR REPLACE FUNCTION public.consume_box_invitation_for(
  p_token   text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public._consume_box_invitation(p_token, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.consume_box_invitation_for(text, uuid) IS
  'Variante service_role de la consommation, pour la route d''inscription par invitation. Mêmes gardes : e-mail contrôlé, usage unique, box lue dans l''invitation.';

-- ── Grants ─────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._consume_box_invitation(text, uuid)      FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_box_invitation(text)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_box_invitation(text)          TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_box_invitation_for(text, uuid)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_box_invitation_for(text, uuid) TO service_role;
