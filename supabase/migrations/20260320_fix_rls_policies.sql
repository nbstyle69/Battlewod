-- ============================================================
-- Fix UNRESTRICTED views + add missing RLS policies
-- Run in Supabase SQL Editor
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. VIEWS — remove anon access where not needed
-- ════════════════════════════════════════════════════════════

-- message_group_members: only authenticated users need access
-- (used in group_messages RLS policies)
REVOKE SELECT ON message_group_members FROM anon;

-- inter_standings: public competition data — leave accessible
-- but remove anon access (only logged-in users see standings)
REVOKE SELECT ON inter_standings FROM anon;
GRANT SELECT ON inter_standings TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 2. message_groups — missing SELECT policies
-- ════════════════════════════════════════════════════════════

-- Box owner can manage all groups in their box
DROP POLICY IF EXISTS "owner_manage_groups" ON message_groups;
CREATE POLICY "owner_manage_groups" ON message_groups
  FOR ALL USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- Members can see groups they belong to
DROP POLICY IF EXISTS "member_see_own_groups" ON message_groups;
CREATE POLICY "member_see_own_groups" ON message_groups
  FOR SELECT USING (
    auth.uid() = ANY(members)
  );

-- ════════════════════════════════════════════════════════════
-- 3. message_replies — missing policies
-- ════════════════════════════════════════════════════════════

-- Members of the box can read replies
DROP POLICY IF EXISTS "box_member_read_replies" ON message_replies;
CREATE POLICY "box_member_read_replies" ON message_replies
  FOR SELECT USING (
    box_id IN (
      SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active'
    )
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- Authenticated users can post replies
DROP POLICY IF EXISTS "member_post_reply" ON message_replies;
CREATE POLICY "member_post_reply" ON message_replies
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Authors can delete own replies
DROP POLICY IF EXISTS "author_delete_reply" ON message_replies;
CREATE POLICY "author_delete_reply" ON message_replies
  FOR DELETE USING (sender_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 4. event_registrations — missing policies
-- ════════════════════════════════════════════════════════════

-- Box owner can see all registrations for their events
DROP POLICY IF EXISTS "owner_see_registrations" ON event_registrations;
CREATE POLICY "owner_see_registrations" ON event_registrations
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE box_id IN (
        SELECT id FROM boxes WHERE owner_id = auth.uid()
      )
    )
  );

-- Box owner can manage registrations
DROP POLICY IF EXISTS "owner_manage_registrations" ON event_registrations;
CREATE POLICY "owner_manage_registrations" ON event_registrations
  FOR ALL USING (
    event_id IN (
      SELECT id FROM events WHERE box_id IN (
        SELECT id FROM boxes WHERE owner_id = auth.uid()
      )
    )
  );

-- Members can see registrations for events in their box
DROP POLICY IF EXISTS "member_see_event_registrations" ON event_registrations;
CREATE POLICY "member_see_event_registrations" ON event_registrations
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE box_id IN (
        SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Members can register themselves
DROP POLICY IF EXISTS "member_register_event" ON event_registrations;
CREATE POLICY "member_register_event" ON event_registrations
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- Members can cancel their own registration
DROP POLICY IF EXISTS "member_cancel_registration" ON event_registrations;
CREATE POLICY "member_cancel_registration" ON event_registrations
  FOR DELETE USING (member_id = auth.uid());

-- Members can update their own registration (status change)
DROP POLICY IF EXISTS "member_update_registration" ON event_registrations;
CREATE POLICY "member_update_registration" ON event_registrations
  FOR UPDATE USING (member_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 5. competition_participants — missing policies
-- ════════════════════════════════════════════════════════════

-- Box owner manages participants
DROP POLICY IF EXISTS "owner_manage_comp_participants" ON competition_participants;
CREATE POLICY "owner_manage_comp_participants" ON competition_participants
  FOR ALL USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (
        SELECT id FROM boxes WHERE owner_id = auth.uid()
      )
    )
  );

-- Members can see participants in their box competitions
DROP POLICY IF EXISTS "member_see_comp_participants" ON competition_participants;
CREATE POLICY "member_see_comp_participants" ON competition_participants
  FOR SELECT USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (
        SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Members can register themselves
DROP POLICY IF EXISTS "member_join_competition" ON competition_participants;
CREATE POLICY "member_join_competition" ON competition_participants
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- Members can withdraw
DROP POLICY IF EXISTS "member_withdraw_competition" ON competition_participants;
CREATE POLICY "member_withdraw_competition" ON competition_participants
  FOR UPDATE USING (member_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- 6. competition_scores — missing policies
-- ════════════════════════════════════════════════════════════

-- Box owner manages scores
DROP POLICY IF EXISTS "owner_manage_comp_scores" ON competition_scores;
CREATE POLICY "owner_manage_comp_scores" ON competition_scores
  FOR ALL USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (
        SELECT id FROM boxes WHERE owner_id = auth.uid()
      )
    )
  );

-- Members can see scores in their box competitions
DROP POLICY IF EXISTS "member_see_comp_scores" ON competition_scores;
CREATE POLICY "member_see_comp_scores" ON competition_scores
  FOR SELECT USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (
        SELECT box_id FROM box_members WHERE member_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Members can submit own scores
DROP POLICY IF EXISTS "member_submit_comp_score" ON competition_scores;
CREATE POLICY "member_submit_comp_score" ON competition_scores
  FOR INSERT WITH CHECK (member_id = auth.uid());

NOTIFY pgrst, 'reload schema';
