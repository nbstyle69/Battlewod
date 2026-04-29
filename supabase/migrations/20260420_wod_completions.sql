-- WOD Completions: members mark a box_wod as "réalisé" (done) without submitting a score
CREATE TABLE IF NOT EXISTS wod_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_id       uuid NOT NULL REFERENCES box_wods(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(wod_id, member_id)
);

CREATE INDEX IF NOT EXISTS wod_completions_wod_id_idx    ON wod_completions(wod_id);
CREATE INDEX IF NOT EXISTS wod_completions_member_id_idx ON wod_completions(member_id);
CREATE INDEX IF NOT EXISTS wod_completions_box_id_idx    ON wod_completions(box_id);

ALTER TABLE wod_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_member_see_completions" ON wod_completions;
CREATE POLICY "box_member_see_completions" ON wod_completions
  FOR SELECT USING (
    box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active')
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
    OR member_id = auth.uid()
  );

DROP POLICY IF EXISTS "member_insert_completion" ON wod_completions;
CREATE POLICY "member_insert_completion" ON wod_completions
  FOR INSERT WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "member_delete_completion" ON wod_completions;
CREATE POLICY "member_delete_completion" ON wod_completions
  FOR DELETE USING (member_id = auth.uid());

NOTIFY pgrst, 'reload schema';
