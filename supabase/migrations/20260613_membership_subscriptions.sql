-- ============================================================
-- Abonnements de salle — formules payantes (Phase A)
-- Étend membership_plans (prix + Stripe) et box_members (suivi abonnement).
-- Base partagée : Battlewod (app) + TheHub (web back-office).
-- ============================================================

-- 1. Prix + Stripe sur les formules
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS price_cents        int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency           text    NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS is_active          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order         int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_product_id  text,
  ADD COLUMN IF NOT EXISTS stripe_price_id    text;

-- 2. Suivi de l'abonnement au niveau du membre
ALTER TABLE box_members
  ADD COLUMN IF NOT EXISTS subscription_status           text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id        text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id    text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS amount_cents                  int,
  ADD COLUMN IF NOT EXISTS platform_fee_cents            int;

CREATE INDEX IF NOT EXISTS idx_box_members_stripe_sub
  ON box_members(stripe_subscription_id);

-- 3. Lecture publique des formules actives (page box publique, clé anon)
DROP POLICY IF EXISTS "public_read_active_plans" ON membership_plans;
CREATE POLICY "public_read_active_plans" ON membership_plans
  FOR SELECT USING (is_active = true);

-- ============================================================
-- Phase B — Enforcement serveur du quota hebdomadaire de réservations
-- Source de vérité (impossible à contourner côté client). Le RPC advisory
-- check_weekly_limit reste pour l'UX (message avant réservation).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_weekly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max    int;
  v_used   int;
  v_date   date;
  v_monday date;
  v_sunday date;
BEGIN
  -- Seules les réservations confirmées consomment le quota.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Quota de la formule active du membre (NULL = illimité ou aucune formule).
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = NEW.member_id
    AND bm.box_id = NEW.box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT scheduled_date INTO v_date FROM class_schedules WHERE id = NEW.schedule_id;
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;
  v_monday := date_trunc('week', v_date)::date;
  v_sunday := v_monday + 6;

  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = NEW.member_id
    AND cr.box_id = NEW.box_id
    AND cr.status = 'confirmed'
    AND (TG_OP = 'INSERT' OR cr.id <> NEW.id)
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  IF v_used >= v_max THEN
    RAISE EXCEPTION 'WEEKLY_LIMIT_REACHED: %/% séances cette semaine', v_used, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_weekly_limit ON class_reservations;
CREATE TRIGGER trg_enforce_weekly_limit
  BEFORE INSERT ON class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_weekly_limit();

-- ============================================================
-- Phase C — Accès automatique aux cours : mapping formule ↔ groupes
-- ============================================================
CREATE TABLE IF NOT EXISTS membership_plan_groups (
  plan_id  uuid NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES message_groups(id)   ON DELETE CASCADE,
  PRIMARY KEY (plan_id, group_id)
);

ALTER TABLE membership_plan_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manage_plan_groups" ON membership_plan_groups;
CREATE POLICY "owner_manage_plan_groups" ON membership_plan_groups
  FOR ALL USING (
    plan_id IN (
      SELECT mp.id FROM membership_plans mp
      JOIN boxes b ON b.id = mp.box_id
      WHERE b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "read_plan_groups" ON membership_plan_groups;
CREATE POLICY "read_plan_groups" ON membership_plan_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Sync des groupes du membre selon sa formule.
-- Ajoute aux groupes de la formule ; retire des groupes gérés par une
-- formule auxquels il n'a plus droit. Les groupes NON rattachés à une
-- formule ne sont jamais touchés (accès manuels préservés).
CREATE OR REPLACE FUNCTION public.sync_member_plan_groups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  uuid := NEW.member_id;
  v_box     uuid := NEW.box_id;
  v_target  uuid[];
  v_managed uuid[];
BEGIN
  IF v_member IS NULL OR v_box IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(mpg.group_id), '{}') INTO v_target
  FROM membership_plan_groups mpg
  WHERE mpg.plan_id = NEW.plan_id;

  SELECT COALESCE(array_agg(DISTINCT mpg.group_id), '{}') INTO v_managed
  FROM membership_plan_groups mpg
  JOIN membership_plans mp ON mp.id = mpg.plan_id
  WHERE mp.box_id = v_box;

  -- Ajout aux groupes de la formule
  UPDATE message_groups
  SET members = (SELECT array_agg(DISTINCT e) FROM unnest(members || v_member) e)
  WHERE id = ANY(v_target)
    AND NOT (v_member = ANY(members));

  -- Retrait des groupes gérés non couverts par la formule
  UPDATE message_groups
  SET members = array_remove(members, v_member)
  WHERE id = ANY(v_managed)
    AND NOT (id = ANY(v_target))
    AND v_member = ANY(members);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_plan_groups ON box_members;
CREATE TRIGGER trg_sync_member_plan_groups
  AFTER INSERT OR UPDATE OF plan_id ON box_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_plan_groups();

NOTIFY pgrst, 'reload schema';
