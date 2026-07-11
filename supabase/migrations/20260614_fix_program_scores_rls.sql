-- ═══════════════════════════════════════════════════════════════════════
-- Security fix — program_scores write policies require active enrollment
--
-- The INSERT/UPDATE policies only checked `user_id = auth.uid()`, so any
-- authenticated user could persist a score for any program_wod_id (they did
-- not have to be enrolled in the program). The app's upsert path was only
-- incidentally blocked. Mirror the existing read policy: a member may only
-- write a score for a WOD of a program they are an ACTIVE member of.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "upsert_own_program_score" ON program_scores;
CREATE POLICY "upsert_own_program_score" ON program_scores FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND program_wod_id IN (
    SELECT pw.id FROM program_wods pw
    JOIN program_members pm ON pm.program_id = pw.program_id
    WHERE pm.user_id = auth.uid() AND pm.status = 'active'
  )
);

DROP POLICY IF EXISTS "update_own_program_score" ON program_scores;
CREATE POLICY "update_own_program_score" ON program_scores FOR UPDATE
USING (
  user_id = auth.uid()
  AND program_wod_id IN (
    SELECT pw.id FROM program_wods pw
    JOIN program_members pm ON pm.program_id = pw.program_id
    WHERE pm.user_id = auth.uid() AND pm.status = 'active'
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND program_wod_id IN (
    SELECT pw.id FROM program_wods pw
    JOIN program_members pm ON pm.program_id = pw.program_id
    WHERE pm.user_id = auth.uid() AND pm.status = 'active'
  )
);
