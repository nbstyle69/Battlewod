-- Super admin can read all engagement tables for analytics dashboard

-- Helper: check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- class_reservations
DROP POLICY IF EXISTS "superadmin_read_reservations" ON class_reservations;
CREATE POLICY "superadmin_read_reservations" ON class_reservations
  FOR SELECT USING (is_super_admin());

-- box_messages
DROP POLICY IF EXISTS "superadmin_read_messages" ON box_messages;
CREATE POLICY "superadmin_read_messages" ON box_messages
  FOR SELECT USING (is_super_admin());

-- generated_wods
DROP POLICY IF EXISTS "superadmin_read_generated_wods" ON generated_wods;
CREATE POLICY "superadmin_read_generated_wods" ON generated_wods
  FOR SELECT USING (is_super_admin());

-- wod_scores
DROP POLICY IF EXISTS "superadmin_read_wod_scores" ON wod_scores;
CREATE POLICY "superadmin_read_wod_scores" ON wod_scores
  FOR SELECT USING (is_super_admin());

-- athlete_badges
DROP POLICY IF EXISTS "superadmin_read_badges" ON athlete_badges;
CREATE POLICY "superadmin_read_badges" ON athlete_badges
  FOR SELECT USING (is_super_admin());

-- box_members (for top boxes query)
DROP POLICY IF EXISTS "superadmin_read_box_members" ON box_members;
CREATE POLICY "superadmin_read_box_members" ON box_members
  FOR SELECT USING (is_super_admin());

NOTIFY pgrst, 'reload schema';
