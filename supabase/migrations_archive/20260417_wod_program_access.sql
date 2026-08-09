-- ═══════════════════════════════════════════════════════════════
-- WOD ↔ Program access (mirror of wod_group_access)
-- If a WOD has rows here, members of those programs can see it.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wod_program_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_id      uuid NOT NULL REFERENCES box_wods(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  UNIQUE(wod_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_wod_program_access_wod     ON wod_program_access(wod_id);
CREATE INDEX IF NOT EXISTS idx_wod_program_access_program ON wod_program_access(program_id);

ALTER TABLE wod_program_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_wod_program_access" ON wod_program_access;
CREATE POLICY "read_wod_program_access" ON wod_program_access
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "manage_wod_program_access" ON wod_program_access;
CREATE POLICY "manage_wod_program_access" ON wod_program_access
  FOR ALL USING (auth.uid() IS NOT NULL);
