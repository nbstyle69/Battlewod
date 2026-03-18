-- ============================================================
-- Daily Booking Limit: 1 créneau par jour sauf plan illimité
-- ============================================================

CREATE OR REPLACE FUNCTION check_daily_limit(p_user_id uuid, p_box_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max int;
  v_used int;
BEGIN
  -- Get the member's plan limit (NULL = unlimited)
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = p_user_id
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  -- NULL max = unlimited → no daily restriction
  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0);
  END IF;

  -- Count confirmed reservations on this specific day
  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = p_user_id
    AND cr.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date = p_date;

  RETURN jsonb_build_object(
    'allowed', v_used < 1,
    'used', v_used
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
