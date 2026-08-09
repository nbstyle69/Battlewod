-- Lot 7A-bis — achat public : entitlement en attente réclamée à l'inscription.
--
-- Les tunnels /box/[slug] sont publics : un visiteur sans compte peut payer.
-- L'attribution se fait désormais sur l'e-mail vérifié par Stripe, et non plus
-- sur un champ libre. Quand cet e-mail n'a aucun profil, l'achat est déposé ici
-- au lieu d'être perdu (aujourd'hui : simple console.warn, argent encaissé sans
-- adhésion), puis réclamé automatiquement à la création du profil.

CREATE TABLE IF NOT EXISTS public.pending_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Toujours stocké en minuscules : c'est la clé de rapprochement.
  email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('membership', 'credit', 'program')),
  payload jsonb NOT NULL,
  -- Idempotence : Stripe ré-émet le même événement.
  stripe_checkout_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pending_entitlements_email_unclaimed_idx
  ON public.pending_entitlements (email)
  WHERE claimed_at IS NULL;

-- Table de back-office serveur : ni lecture ni écriture par les clients.
ALTER TABLE public.pending_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_entitlements FROM anon, authenticated;

-- ── Réclamation ───────────────────────────────────────────────────────────
-- Rejoue l'attribution que le webhook aurait faite si le compte avait existé.
CREATE OR REPLACE FUNCTION public.claim_pending_entitlements(
  p_user_id uuid,
  p_email text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.pending_entitlements;
  v_claimed integer := 0;
  v_member_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.pending_entitlements
    WHERE email = lower(btrim(p_email))
      AND claimed_at IS NULL
    ORDER BY created_at
    FOR UPDATE
  LOOP
    IF r.kind = 'membership' THEN
      SELECT id INTO v_member_id FROM public.box_members
      WHERE box_id = (r.payload->>'box_id')::uuid AND member_id = p_user_id;

      IF v_member_id IS NULL THEN
        INSERT INTO public.box_members (
          box_id, member_id, role, plan_id, status, subscription_status,
          stripe_subscription_id, stripe_checkout_session_id,
          subscription_current_period_end, amount_cents, platform_fee_cents,
          commitment_end_date, payment_method_type
        ) VALUES (
          (r.payload->>'box_id')::uuid, p_user_id, 'member',
          (r.payload->>'plan_id')::uuid, 'active', 'active',
          r.payload->>'stripe_subscription_id', r.stripe_checkout_session_id,
          (r.payload->>'subscription_current_period_end')::timestamptz,
          (r.payload->>'amount_cents')::integer,
          (r.payload->>'platform_fee_cents')::integer,
          (r.payload->>'commitment_end_date')::timestamptz,
          r.payload->>'payment_method_type'
        );
      ELSE
        UPDATE public.box_members SET
          plan_id = (r.payload->>'plan_id')::uuid,
          status = 'active',
          subscription_status = 'active',
          stripe_subscription_id = r.payload->>'stripe_subscription_id',
          stripe_checkout_session_id = r.stripe_checkout_session_id,
          subscription_current_period_end = (r.payload->>'subscription_current_period_end')::timestamptz,
          amount_cents = (r.payload->>'amount_cents')::integer,
          platform_fee_cents = (r.payload->>'platform_fee_cents')::integer,
          commitment_end_date = (r.payload->>'commitment_end_date')::timestamptz,
          payment_method_type = r.payload->>'payment_method_type'
        WHERE id = v_member_id;
      END IF;

    ELSIF r.kind = 'credit' THEN
      -- La validité court à partir de la réclamation : des séances prépayées
      -- ne doivent pas expirer pendant que l'acheteur n'a pas encore de compte.
      INSERT INTO public.member_class_credits (
        box_id, member_id, plan_id, credits_total, credits_used,
        expires_at, status, stripe_checkout_session_id, stripe_payment_intent
      ) VALUES (
        (r.payload->>'box_id')::uuid, p_user_id,
        NULLIF(r.payload->>'plan_id', '')::uuid,
        (r.payload->>'credits')::integer, 0,
        now() + make_interval(days => (r.payload->>'validity_days')::integer),
        'active', r.stripe_checkout_session_id, r.payload->>'stripe_payment_intent'
      )
      -- Index unique PARTIEL en prod (uq_member_class_credits_session) :
      -- l'inférence exige de répéter son prédicat.
      ON CONFLICT (stripe_checkout_session_id)
        WHERE stripe_checkout_session_id IS NOT NULL DO NOTHING;

    ELSIF r.kind = 'program' THEN
      INSERT INTO public.program_members (
        program_id, user_id, start_date, amount_cents, platform_fee_cents,
        status, stripe_checkout_session_id, stripe_subscription_id, stripe_payment_intent
      ) VALUES (
        (r.payload->>'program_id')::uuid, p_user_id, current_date,
        (r.payload->>'amount_cents')::integer,
        (r.payload->>'platform_fee_cents')::integer,
        'active', r.stripe_checkout_session_id,
        r.payload->>'stripe_subscription_id', r.payload->>'stripe_payment_intent'
      )
      ON CONFLICT (program_id, user_id) DO UPDATE SET
        status = 'active',
        stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        stripe_payment_intent = EXCLUDED.stripe_payment_intent;
    END IF;

    UPDATE public.pending_entitlements
    SET claimed_at = now(), claimed_by = p_user_id
    WHERE id = r.id;
    v_claimed := v_claimed + 1;
  END LOOP;

  RETURN v_claimed;
END;
$$;

-- CREATE FUNCTION accorde EXECUTE a PUBLIC : sans ce REVOKE, anon pourrait
-- appeler un SECURITY DEFINER et se faire attribuer l'achat d'un autre e-mail.
REVOKE ALL ON FUNCTION public.claim_pending_entitlements(uuid, text) FROM PUBLIC, anon, authenticated;

-- Le profil est créé côté application (pas de trigger handle_new_user en prod) :
-- on accroche la réclamation à l'insertion du profil, ce qui couvre aussi bien
-- l'inscription web que l'inscription mobile.
CREATE OR REPLACE FUNCTION public.trg_claim_pending_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.claim_pending_entitlements(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_claim_pending_entitlements() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_claim_pending_entitlements ON public.profiles;
CREATE TRIGGER trg_profiles_claim_pending_entitlements
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_claim_pending_entitlements();
