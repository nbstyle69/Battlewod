-- ============================================================
-- Add box info columns: address, website_url, contact_email
-- ============================================================

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS address         text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS website_url     text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS contact_email   text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS phone           text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS google_maps_url text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS founded_at      date;

-- ============================================================
-- Storage bucket for box logos
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('box-logos', 'box-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow box owners to upload/update their box logo
DROP POLICY IF EXISTS "box_owner_upload_logo" ON storage.objects;
CREATE POLICY "box_owner_upload_logo" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'box-logos'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "box_owner_update_logo" ON storage.objects;
CREATE POLICY "box_owner_update_logo" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'box-logos'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "box_owner_delete_logo" ON storage.objects;
CREATE POLICY "box_owner_delete_logo" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'box-logos'
    AND auth.uid() IS NOT NULL
  );

-- Public read for logos
DROP POLICY IF EXISTS "public_read_box_logos" ON storage.objects;
CREATE POLICY "public_read_box_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'box-logos');

-- ============================================================
-- Fix check_weekly_limit: use target date instead of CURRENT_DATE
-- so users can book for next week even if current week is full
-- ============================================================
CREATE OR REPLACE FUNCTION check_weekly_limit(p_user_id uuid, p_box_id uuid, p_target_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max int;
  v_used int;
  v_monday date;
  v_sunday date;
BEGIN
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = p_user_id
    AND bm.box_id = p_box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'max', null);
  END IF;

  v_monday := date_trunc('week', p_target_date)::date;
  v_sunday := v_monday + 6;

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

NOTIFY pgrst, 'reload schema';
