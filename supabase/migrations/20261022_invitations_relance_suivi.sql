-- Invitations nominatives — lot 3 : relance, révocation et suivi de délivrance.
--
-- Le lot 1 a décidé de ne pas stocker le jeton en clair. Conséquence directe
-- sur l'écran de gestion : « relancer » ne peut pas renvoyer le même lien, il
-- n'existe plus nulle part. La relance REGÉNÈRE donc le jeton, ce qui invalide
-- l'ancien lien — effet de bord souhaitable : un lien envoyé à la mauvaise
-- adresse meurt à la première relance.
--
-- On ajoute aussi de quoi rendre visible l'échec d'envoi : le domaine d'envoi
-- n'étant pas vérifié chez Resend, l'écran doit dire « e-mail non parti »
-- plutôt que de laisser croire à une délivrance.

BEGIN;

-- ── 1. Suivi de délivrance ────────────────────────────────────────────────

ALTER TABLE public.box_invitations
  ADD COLUMN IF NOT EXISTS last_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_send_error text,
  ADD COLUMN IF NOT EXISTS send_count      integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.box_invitations.last_send_error IS
  'Dernière erreur d''envoi e-mail (NULL si le dernier envoi a réussi). Le lien reste utilisable : le QR et la copie ne dépendent pas de l''e-mail.';

-- ── 2. Relance : un nouveau jeton, l'ancien lien meurt ────────────────────

CREATE OR REPLACE FUNCTION public.rotate_box_invitation_token(
  p_invitation_id uuid,
  p_valid_days    integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
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

  IF NOT public.is_box_admin(r.box_id) THEN
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
$$;

-- ── 3. Révocation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_box_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
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

  IF NOT public.is_box_admin(r.box_id) THEN
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
$$;

-- ── 4. Trace d'envoi ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_box_invitation_sent(
  p_invitation_id uuid,
  p_error         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
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

  IF NOT public.is_box_admin(r.box_id) THEN
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
$$;

-- ── 5. Grants ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rotate_box_invitation_token(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_box_invitation_token(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revoke_box_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_box_invitation(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_box_invitation_sent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_box_invitation_sent(uuid, text) TO authenticated, service_role;

COMMIT;
