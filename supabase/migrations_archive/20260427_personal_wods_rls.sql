-- ══════════════════════════════════════════════════════════════
-- Personal WODs (box_id IS NULL) — RLS policies
-- ══════════════════════════════════════════════════════════════
-- A user without a box (or even with one) can create/read/update/delete
-- their own personal WODs, identified by box_id IS NULL AND created_by = auth.uid().
-- These WODs are private to their author.
--
-- Display-side: WhiteboardScreen filters with `box_id IS NULL AND created_by = user.id`.
-- ══════════════════════════════════════════════════════════════

-- 1. SELECT: user can read their own personal WODs
DROP POLICY IF EXISTS "user_see_own_personal_wods" ON public.box_wods;
CREATE POLICY "user_see_own_personal_wods" ON public.box_wods
  FOR SELECT USING (
    box_id IS NULL
    AND created_by = auth.uid()
  );

-- 2. INSERT: user can create personal WODs (box_id NULL, created_by = self)
DROP POLICY IF EXISTS "user_create_personal_wods" ON public.box_wods;
CREATE POLICY "user_create_personal_wods" ON public.box_wods
  FOR INSERT WITH CHECK (
    box_id IS NULL
    AND created_by = auth.uid()
  );

-- 3. UPDATE: user can update their own personal WODs
DROP POLICY IF EXISTS "user_update_own_personal_wods" ON public.box_wods;
CREATE POLICY "user_update_own_personal_wods" ON public.box_wods
  FOR UPDATE USING (
    box_id IS NULL
    AND created_by = auth.uid()
  ) WITH CHECK (
    box_id IS NULL
    AND created_by = auth.uid()
  );

-- 4. DELETE: user can delete their own personal WODs
DROP POLICY IF EXISTS "user_delete_own_personal_wods" ON public.box_wods;
CREATE POLICY "user_delete_own_personal_wods" ON public.box_wods
  FOR DELETE USING (
    box_id IS NULL
    AND created_by = auth.uid()
  );
