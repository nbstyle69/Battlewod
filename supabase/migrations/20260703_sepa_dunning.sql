-- ============================================================
-- SEPA + impayés (dunning) sur les abonnements de salle
-- ------------------------------------------------------------
-- Complète 20260613_membership_subscriptions.sql :
--   1. Suivi de l'impayé au niveau du membre (depuis quand, tentatives,
--      motif d'échec, moyen de paiement) — alimenté par le webhook Connect
--      de TheHub (invoice.payment_failed / invoice.paid).
--   2. Délai de grâce configurable par box (`boxes.dunning_grace_days`).
--   3. Suspension automatique des droits : passé le délai de grâce, un
--      abonnement `past_due` ne peut plus réserver de créneau. Le blocage
--      est DÉRIVÉ de `past_due_since` + délai de grâce : aucun cron n'est
--      nécessaire pour suspendre ni pour réactiver (un `invoice.paid`
--      remet `past_due_since` à NULL → accès immédiatement rétabli).
-- ============================================================

BEGIN;

ALTER TABLE box_members
  ADD COLUMN IF NOT EXISTS payment_method_type      text,
  ADD COLUMN IF NOT EXISTS past_due_since           timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_attempts         int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_error       text,
  ADD COLUMN IF NOT EXISTS dunning_reminders_sent   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dunning_last_reminder_at timestamptz;

-- Les membres en impayé se listent par box dans le back-office.
CREATE INDEX IF NOT EXISTS idx_box_members_past_due
  ON box_members(box_id, past_due_since)
  WHERE past_due_since IS NOT NULL;

ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS dunning_grace_days int NOT NULL DEFAULT 7;

ALTER TABLE boxes
  DROP CONSTRAINT IF EXISTS boxes_dunning_grace_days_range;
ALTER TABLE boxes
  ADD CONSTRAINT boxes_dunning_grace_days_range
  CHECK (dunning_grace_days BETWEEN 0 AND 90);

-- ============================================================
-- Blocage dérivé — usage interne (trigger) : prend le membre en argument,
-- donc non exposé aux clients (voir le wrapper `my_membership_blocked`).
-- ============================================================
CREATE OR REPLACE FUNCTION public.membership_access_blocked(p_member uuid, p_box uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM box_members bm
    JOIN boxes b ON b.id = bm.box_id
    WHERE bm.member_id = p_member
      AND bm.box_id = p_box
      AND bm.subscription_status = 'past_due'
      AND bm.past_due_since IS NOT NULL
      AND bm.past_due_since
          < now() - make_interval(days => COALESCE(b.dunning_grace_days, 7))
  );
$$;

-- Révoquer PUBLIC aussi : sans ça l'EXECUTE accordé par défaut à PUBLIC
-- laisse n'importe quel utilisateur connecté sonder un autre membre.
REVOKE ALL ON FUNCTION public.membership_access_blocked(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.membership_access_blocked(uuid, uuid) FROM anon, authenticated;

-- Le membre connecté peut interroger SON propre statut (bannière in-app).
CREATE OR REPLACE FUNCTION public.my_membership_blocked(p_box uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.membership_access_blocked(auth.uid(), p_box);
$$;

GRANT EXECUTE ON FUNCTION public.my_membership_blocked(uuid) TO authenticated;

-- ============================================================
-- Suspension des droits de réservation au-delà du délai de grâce.
-- S'exécute AVANT la consommation de crédit et le quota hebdo : un
-- abonnement suspendu ne doit ni réserver ni consommer un carnet.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_membership_not_suspended()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF public.membership_access_blocked(NEW.member_id, NEW.box_id) THEN
    RAISE EXCEPTION 'MEMBERSHIP_PAST_DUE: abonnement impayé — réservations suspendues'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- `a_` préfixe le nom pour passer avant trg_consume_credit / trg_enforce_weekly_limit
-- (Postgres déclenche les triggers de même type par ordre alphabétique).
DROP TRIGGER IF EXISTS a_trg_enforce_membership_not_suspended ON class_reservations;
CREATE TRIGGER a_trg_enforce_membership_not_suspended
  BEFORE INSERT OR UPDATE OF status ON class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_not_suspended();

-- ============================================================
-- Vue back-office « Impayés » — les colonnes de dunning ne sont pas
-- accordées à `authenticated` (comme les colonnes de facturation, cf.
-- 20260610), donc le staff y accède par RPC SECURITY DEFINER.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_box_dunning(p_box_id uuid)
RETURNS TABLE (
  id uuid,
  member_id uuid,
  username text,
  email text,
  plan_name text,
  amount_cents integer,
  payment_method_type text,
  past_due_since timestamptz,
  dunning_attempts integer,
  dunning_reminders_sent integer,
  dunning_last_reminder_at timestamptz,
  last_payment_error text,
  has_stripe_sub boolean,
  suspended boolean,
  grace_days integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT bm.id, bm.member_id, pr.username, pr.email, mp.name,
         bm.amount_cents, bm.payment_method_type, bm.past_due_since,
         bm.dunning_attempts, bm.dunning_reminders_sent, bm.dunning_last_reminder_at,
         bm.last_payment_error,
         (bm.stripe_subscription_id IS NOT NULL),
         public.membership_access_blocked(bm.member_id, bm.box_id),
         COALESCE(b.dunning_grace_days, 7)
  FROM public.box_members bm
  JOIN public.boxes b ON b.id = bm.box_id
  LEFT JOIN public.profiles pr ON pr.id = bm.member_id
  LEFT JOIN public.membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.box_id = p_box_id
    AND bm.subscription_status = 'past_due'
    AND (
      public.is_box_owner(p_box_id)
      OR public.is_box_owner_member(p_box_id)
      OR public.is_super_admin()
    )
  ORDER BY bm.past_due_since ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_box_dunning(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
