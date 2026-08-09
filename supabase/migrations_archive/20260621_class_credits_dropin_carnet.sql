-- ============================================================
-- Offres Drop-in & Carnet — accès aux cours par crédits
-- Base partagée : Battlewod (app) + TheHub (web back-office).
--
-- membership_plans.plan_type :
--   'subscription' (existant, quota hebdo max_sessions_per_week)
--   'drop_in'      (achat unique -> 1 crédit)
--   'pack'         (achat unique -> N crédits valables X jours = "carnet")
--
-- Un achat drop_in/pack crée une ligne member_class_credits.
-- La réservation d'un membre "en mode crédit" (a acheté des crédits et
-- n'a pas d'abonnement actif) consomme 1 crédit à la confirmation, et le
-- rend en cas d'annulation >= 5 h avant le début du cours.
-- ============================================================

-- 1. Typage des formules
ALTER TABLE public.membership_plans
  ADD COLUMN IF NOT EXISTS plan_type     text NOT NULL DEFAULT 'subscription'
    CHECK (plan_type IN ('subscription', 'drop_in', 'pack')),
  ADD COLUMN IF NOT EXISTS credits       int,   -- pack: nb de séances ; drop_in: 1
  ADD COLUMN IF NOT EXISTS validity_days int;   -- durée de validité des crédits

-- 2. Crédits achetés par membre (drop-in + carnets)
CREATE TABLE IF NOT EXISTS public.member_class_credits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES public.boxes(id)     ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  plan_id       uuid REFERENCES public.membership_plans(id)   ON DELETE SET NULL,
  credits_total int  NOT NULL CHECK (credits_total > 0),
  credits_used  int  NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  expires_at    timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'exhausted')),
  stripe_checkout_session_id text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_class_credits_lookup
  ON public.member_class_credits (member_id, box_id, status, expires_at);

ALTER TABLE public.member_class_credits ENABLE ROW LEVEL SECURITY;

-- Le membre lit ses propres crédits ; l'owner de la box lit ceux de sa box.
DROP POLICY IF EXISTS "read_own_or_owner_credits" ON public.member_class_credits;
CREATE POLICY "read_own_or_owner_credits" ON public.member_class_credits
  FOR SELECT USING (
    member_id = auth.uid()
    OR box_id IN (SELECT id FROM public.boxes WHERE owner_id = auth.uid())
  );
-- Écriture réservée au service role (webhook Stripe) -> aucune policy write.

-- 3. Lien réservation -> crédit consommé (pour le remboursement)
ALTER TABLE public.class_reservations
  ADD COLUMN IF NOT EXISTS credit_id uuid REFERENCES public.member_class_credits(id) ON DELETE SET NULL;

-- ============================================================
-- 4. Consommation d'un crédit à la confirmation d'une réservation
--    (BEFORE INSERT OR UPDATE OF status — nommé pour s'exécuter APRÈS
--    le trigger de capacité qui peut rétrograder confirmed -> waiting)
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_credit_on_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_sub    boolean;
  v_has_any    boolean;
  v_credit_id  uuid;
BEGIN
  -- Un crédit n'est consommé que par une réservation confirmée.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Déjà rattachée à un crédit (ex. UPDATE sans changement d'accès) -> rien.
  IF NEW.credit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mode abonnement : le quota hebdo (trigger dédié) s'applique, pas les crédits.
  SELECT EXISTS (
    SELECT 1
    FROM box_members bm
    JOIN membership_plans mp ON mp.id = bm.plan_id
    WHERE bm.member_id = NEW.member_id
      AND bm.box_id = NEW.box_id
      AND bm.status = 'active'
      AND mp.plan_type = 'subscription'
      AND COALESCE(bm.subscription_status, '') IN ('active', 'trialing', 'past_due')
  ) INTO v_has_sub;

  IF v_has_sub THEN
    RETURN NEW;
  END IF;

  -- Cherche un crédit disponible (le plus proche de l'expiration d'abord).
  SELECT id INTO v_credit_id
  FROM member_class_credits
  WHERE member_id = NEW.member_id
    AND box_id = NEW.box_id
    AND status = 'active'
    AND expires_at > now()
    AND credits_used < credits_total
  ORDER BY expires_at ASC
  FOR UPDATE
  LIMIT 1;

  IF v_credit_id IS NOT NULL THEN
    UPDATE member_class_credits
    SET credits_used = credits_used + 1,
        status = CASE WHEN credits_used + 1 >= credits_total THEN 'exhausted' ELSE status END
    WHERE id = v_credit_id;
    NEW.credit_id := v_credit_id;
    RETURN NEW;
  END IF;

  -- Pas de crédit dispo : si le membre a DÉJÀ acheté des crédits pour cette box
  -- (mode crédit), on bloque. Sinon (membre libre/invité) : accès inchangé.
  SELECT EXISTS (
    SELECT 1 FROM member_class_credits
    WHERE member_id = NEW.member_id AND box_id = NEW.box_id
  ) INTO v_has_any;

  IF v_has_any THEN
    RAISE EXCEPTION 'NO_CREDITS_LEFT: aucun crédit valide (carnet épuisé ou expiré)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zzz_consume_credit ON public.class_reservations;
CREATE TRIGGER trg_zzz_consume_credit
  BEFORE INSERT OR UPDATE OF status ON public.class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.consume_credit_on_reservation();

-- ============================================================
-- 5. Remboursement du crédit à l'annulation (>= 5 h avant le cours)
--    L'annulation = suppression de la ligne (cf. app). BEFORE DELETE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refund_credit_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
BEGIN
  IF OLD.credit_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT (cs.scheduled_date + cs.start_time::time) AT TIME ZONE 'Europe/Paris'
    INTO v_start
  FROM class_schedules cs
  WHERE cs.id = OLD.schedule_id;

  -- Remboursement seulement si annulation au moins 5 h avant le début.
  IF v_start IS NOT NULL AND v_start - now() >= interval '5 hours' THEN
    UPDATE member_class_credits
    SET credits_used = GREATEST(credits_used - 1, 0),
        status = CASE
          WHEN status = 'exhausted' AND expires_at > now() THEN 'active'
          ELSE status
        END
    WHERE id = OLD.credit_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_credit ON public.class_reservations;
CREATE TRIGGER trg_refund_credit
  BEFORE DELETE ON public.class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.refund_credit_on_cancel();

NOTIFY pgrst, 'reload schema';
