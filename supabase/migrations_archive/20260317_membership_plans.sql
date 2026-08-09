-- ============================================================
-- Membership Plans + Weekly Reservation Limits
-- ============================================================

-- 1. membership_plans table
CREATE TABLE IF NOT EXISTS membership_plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id                uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name                  text NOT NULL,            -- e.g. "1x/semaine", "Illimité"
  max_sessions_per_week int,                      -- NULL = unlimited
  color                 text NOT NULL DEFAULT '#C9A227',
  created_at            timestamptz DEFAULT now(),
  UNIQUE(box_id, name)
);

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

-- Owner can manage plans
DROP POLICY IF EXISTS "owner_manage_plans" ON membership_plans;
CREATE POLICY "owner_manage_plans" ON membership_plans
  FOR ALL USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- Members can see plans of their box
DROP POLICY IF EXISTS "member_see_plans" ON membership_plans;
CREATE POLICY "member_see_plans" ON membership_plans
  FOR SELECT USING (
    box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
  );

-- 2. Add plan_id column to box_members (nullable = no plan = unlimited by default)
ALTER TABLE box_members
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES membership_plans(id) ON DELETE SET NULL;

-- 3. RPC: check how many confirmed reservations a user has this week
-- Returns JSON: { allowed: bool, used: int, max: int|null }
CREATE OR REPLACE FUNCTION check_weekly_limit(p_user_id uuid, p_box_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max int;
  v_used int;
  v_monday date;
  v_sunday date;
BEGIN
  -- Get the member's plan limit
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = p_user_id
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  -- NULL max = unlimited
  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'max', null);
  END IF;

  -- Calculate current week (Monday to Sunday)
  v_monday := date_trunc('week', CURRENT_DATE)::date;
  v_sunday := v_monday + 6;

  -- Count confirmed reservations this week
  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = p_user_id
    AND cr.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  RETURN jsonb_build_object(
    'allowed', v_used < v_max,
    'used', v_used,
    'max', v_max
  );
END;
$$;

-- 4. Allow owner to delete reservations (kick members)
DROP POLICY IF EXISTS "owner_delete_reservation" ON class_reservations;
CREATE POLICY "owner_delete_reservation" ON class_reservations
  FOR DELETE USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- 5. Allow members to see profiles of other members in the same box (for participant list)
-- This may already exist, but ensure it does
DROP POLICY IF EXISTS "box_members_see_profiles" ON profiles;
CREATE POLICY "box_members_see_profiles" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT bm2.member_id FROM box_members bm2
      WHERE bm2.box_id IN (
        SELECT bm.box_id FROM box_members bm WHERE bm.member_id = auth.uid() AND bm.status = 'active'
      )
    )
    OR id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
