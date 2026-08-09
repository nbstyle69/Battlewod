-- Class schedules (created by box owner)
CREATE TABLE IF NOT EXISTS class_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid REFERENCES boxes(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  coach         text,
  scheduled_date date NOT NULL,
  start_time    text NOT NULL,   -- 'HH:MM'
  end_time      text NOT NULL,   -- 'HH:MM'
  max_capacity  int  NOT NULL DEFAULT 15,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_member_see_schedules" ON class_schedules;
CREATE POLICY "box_member_see_schedules" ON class_schedules
  FOR SELECT USING (
    box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "box_owner_manage_schedules" ON class_schedules;
CREATE POLICY "box_owner_manage_schedules" ON class_schedules
  FOR ALL USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- Class reservations (members book a slot)
CREATE TABLE IF NOT EXISTS class_reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  uuid REFERENCES class_schedules(id) ON DELETE CASCADE,
  member_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  box_id       uuid REFERENCES boxes(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(schedule_id, member_id)
);

ALTER TABLE class_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_member_see_reservations" ON class_reservations;
CREATE POLICY "box_member_see_reservations" ON class_reservations
  FOR SELECT USING (
    box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_add_reservation" ON class_reservations;
CREATE POLICY "member_add_reservation" ON class_reservations
  FOR INSERT WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "member_delete_reservation" ON class_reservations;
CREATE POLICY "member_delete_reservation" ON class_reservations
  FOR DELETE USING (member_id = auth.uid());

NOTIFY pgrst, 'reload schema';
