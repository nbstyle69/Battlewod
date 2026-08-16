-- ============================================================================
-- 20261029 — Import en masse d'invitations (portabilité, lot A)
--
-- Un gérant qui migre depuis un autre logiciel dépose un CSV de ses adhérents.
-- L'import n'écrit JAMAIS un membre : il écrit des invitations. Le pire qu'un
-- fichier douteux puisse produire est une invitation ratée, révocable, qui n'a
-- touché aucune donnée réelle.
--
-- Deux raisons rendent une RPC nécessaire plutôt qu'une boucle d'appels
-- unitaires depuis le navigateur :
--
--  1. « Un appel, un rapport ». 500 appels HTTP successifs se coupent au 300e :
--     l'import est à moitié fait, sans rapport, sans reprise possible. Ici le
--     lot est traité en une transaction de lecture/écriture unique et le
--     gérant reçoit un verdict par ligne.
--
--  2. Deux verdicts exigés du rapport n'existaient nulle part :
--       • « déjà membre »  n'était jamais vérifié à la création ;
--       • « membre exclu » ne l'était qu'à la CONSOMMATION — le gérant créait
--         l'invitation, l'envoyait, et n'apprenait jamais qu'elle était vouée
--         à échouer. C'est un refus silencieux différé.
--     Les deux gardes sont posées ici dans une fonction interne partagée, donc
--     la création unitaire en hérite mécaniquement : même bug, même correctif.
--
-- Ce que les gardes ne bloquent PAS, volontairement : un membre `inactive`.
-- Réinviter un adhérent dont l'abonnement s'est arrêté est le chemin normal
-- d'un renouvellement au comptoir — le fermer casserait les échéances.
--
-- Les jetons ne sont pas renvoyés par le lot. 500 jetons en clair dans une
-- réponse HTTP, puis dans la mémoire d'un navigateur, seraient une exposition
-- gratuite : chaque invitation reste délivrable une par une par la relance
-- existante (`rotate_box_invitation_token`), qui en émet un neuf.
-- ============================================================================

-- ── 1. Verdict d'une adresse pour une box ─────────────────────────────────
--
-- Ne lit rien de sensible et n'écrit rien : rend seulement la raison pour
-- laquelle une invitation ne peut pas être créée, ou NULL si elle le peut.
-- Interne (pas de GRANT à `authenticated`) : elle n'est appelée que par les
-- deux fonctions ci-dessous, qui ont déjà vérifié `is_box_admin`.

CREATE OR REPLACE FUNCTION public.invitation_target_blocker(
  p_box_id uuid,
  p_email  text
)
RETURNS text
-- VOLATILE : elle referme au passage les invitations expirées, qui ne doivent
-- pas bloquer une nouvelle invitation vers la même adresse.
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_status text;
BEGIN
  IF v_email = '' OR position('@' in v_email) = 0 OR position(' ' in v_email) > 0 THEN
    RETURN 'email_invalide';
  END IF;

  SELECT bm.status INTO v_status
  FROM public.box_members bm
  JOIN public.profiles p ON p.id = bm.member_id
  WHERE bm.box_id = p_box_id AND lower(p.email) = v_email;

  IF v_status = 'banned' THEN
    RETURN 'membre_exclu';
  END IF;
  IF v_status = 'active' THEN
    RETURN 'deja_membre';
  END IF;

  -- Expirée : on la referme, elle ne doit pas bloquer une nouvelle invitation.
  UPDATE public.box_invitations
  SET status = 'revoked'
  WHERE box_id = p_box_id AND email = v_email
    AND status = 'pending' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.box_invitations
    WHERE box_id = p_box_id AND email = v_email AND status = 'pending'
  ) THEN
    RETURN 'invitation_en_attente';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.invitation_target_blocker(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_target_blocker(uuid, text) TO service_role;

COMMENT ON FUNCTION public.invitation_target_blocker(uuid, text) IS
  'Raison pour laquelle une adresse ne peut pas recevoir d''invitation dans cette box (NULL = elle le peut). Interne : l''appelant a déjà vérifié is_box_admin.';

-- ── 2. Les deux gardes manquantes sur la création unitaire ────────────────
--
-- Même corps qu'en 20261020, plus les deux refus. Le message de « déjà membre »
-- est explicite : le gérant a souvent simplement oublié que la personne y est.

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
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_token   text;
  v_id      uuid;
  v_days    integer := least(greatest(coalesce(p_valid_days, 7), 1), 30);
  v_blocker text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_box_admin(p_box_id) THEN
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
$$;

-- ── 3. Le lot ──────────────────────────────────────────────────────────────
--
-- Une ligne du fichier = un objet {ligne, email, prenom, nom, formule}.
-- Une ligne = un verdict. Une ligne refusée n'empêche jamais les autres
-- d'être créées : le fichier de reprise d'un gérant en contient toujours.

CREATE OR REPLACE FUNCTION public.create_box_invitations_bulk(
  p_box_id     uuid,
  p_rows       jsonb,
  p_valid_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
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

  IF NOT public.is_box_admin(p_box_id) THEN
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
$$;

REVOKE ALL ON FUNCTION public.create_box_invitations_bulk(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_box_invitations_bulk(uuid, jsonb, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_box_invitations_bulk(uuid, jsonb, integer) IS
  'Crée jusqu''à 500 invitations en un appel pour une box administrée par l''appelant, et rend un verdict par ligne (creee / ignoree / refusee). Ne renvoie aucun jeton.';
