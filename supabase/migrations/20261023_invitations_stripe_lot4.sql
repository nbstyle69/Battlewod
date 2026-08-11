-- Invitations nominatives — lot 4 : branche Stripe.
--
-- Le Checkout et le webhook existent déjà (kind='membership'), et l'activation
-- ne vient QUE du webhook depuis toujours : le retour navigateur n'écrit rien.
-- Ce lot n'ajoute donc pas de circuit de paiement, il rattache l'invitation au
-- paiement — deux fonctions, toutes deux réservées au service_role, parce
-- qu'elles sont appelées par la route de Checkout et par le webhook, jamais par
-- un navigateur.
--
-- Pourquoi une résolution du jeton côté SQL : la page publique détient le
-- jeton, pas l'identifiant de l'invitation (le peek du lot 1 ne le révèle pas,
-- précisément pour que rien de nommable ne fuite). La route de Checkout lui
-- passe donc le jeton, et c'est le SQL qui le convertit en ligne — la recherche
-- se fait sur le SHA-256, la valeur brute ne touche jamais la table.

BEGIN;

-- ── 1. Jeton → invitation, pour préparer un Checkout ──────────────────────
--
-- Ne renvoie jamais le jeton ni le créateur. Le statut 'accepted' est un cas
-- NORMAL ici : le compte a été créé au lot 2, l'invitation a été consommée, et
-- c'est seulement maintenant que le membre paie.

CREATE OR REPLACE FUNCTION public.resolve_box_invitation_for_checkout(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r public.box_invitations;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_TOKEN');
  END IF;

  SELECT * INTO r
  FROM public.box_invitations
  WHERE token_hash = encode(sha256(btrim(p_token)::bytea), 'hex');

  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_TOKEN');
  END IF;

  IF r.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'REVOKED');
  END IF;

  -- L'expiration protège le lien, pas le paiement : une invitation déjà
  -- acceptée reste payable même après la date, sinon un membre créé la veille
  -- de l'expiration se retrouverait avec un compte et aucun moyen de payer.
  IF r.status = 'pending' AND r.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EXPIRED');
  END IF;

  IF r.payment_mode <> 'stripe' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_STRIPE');
  END IF;

  IF r.plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_PLAN');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', r.id,
    'box_id', r.box_id,
    'plan_id', r.plan_id,
    'email', r.email,
    'status', r.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_box_invitation_for_checkout(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_box_invitation_for_checkout(text) TO service_role;

-- ── 2. Paiement confirmé → invitation consommée ───────────────────────────
--
-- Appelée par le webhook, donc après un encaissement réel. Elle ne crée aucune
-- adhésion : c'est le webhook qui écrit box_members. Elle ferme l'invitation,
-- et elle refuse de la fermer au nom de quelqu'un d'autre — nommer un
-- utilisateur ne dit rien de son droit à cette invitation, l'e-mail du compte
-- est relu et comparé.

CREATE OR REPLACE FUNCTION public.accept_box_invitation_after_payment(
  p_invitation_id uuid,
  p_user_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r       public.box_invitations;
  v_email text;
BEGIN
  IF p_invitation_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'MISSING_ARGUMENT');
  END IF;

  SELECT * INTO r FROM public.box_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  SELECT lower(btrim(email)) INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'UNKNOWN_USER');
  END IF;

  IF v_email <> r.email THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'EMAIL_MISMATCH');
  END IF;

  IF r.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'REVOKED');
  END IF;

  -- Rejeu du même événement Stripe, ou invitation déjà consommée au lot 2 par
  -- ce même membre : succès silencieux.
  IF r.status = 'accepted' THEN
    IF r.accepted_by IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'ACCEPTED_BY_OTHER');
    END IF;
    RETURN jsonb_build_object('ok', true, 'id', r.id, 'already', true);
  END IF;

  UPDATE public.box_invitations
  SET status      = 'accepted',
      accepted_by = p_user_id,
      accepted_at = now()
  WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'id', r.id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_box_invitation_after_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_box_invitation_after_payment(uuid, uuid) TO service_role;

COMMIT;
