-- ============================================================
-- WOD Group Access — restrict WOD visibility to specific groups
-- ============================================================
-- If a WOD has NO rows in this table, it is visible to ALL members (backward compatible).
-- If a WOD has rows, only members of those groups can see it.

CREATE TABLE IF NOT EXISTS wod_group_access (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_id    uuid NOT NULL REFERENCES box_wods(id) ON DELETE CASCADE,
  group_id  uuid NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,
  UNIQUE(wod_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_wod_group_access_wod   ON wod_group_access(wod_id);
CREATE INDEX IF NOT EXISTS idx_wod_group_access_group ON wod_group_access(group_id);

ALTER TABLE wod_group_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_wod_group_access" ON wod_group_access;
CREATE POLICY "read_wod_group_access" ON wod_group_access
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "manage_wod_group_access" ON wod_group_access;
CREATE POLICY "manage_wod_group_access" ON wod_group_access
  FOR ALL USING (auth.uid() IS NOT NULL);
