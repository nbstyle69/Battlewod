-- ============================================================
-- Fix message_group_members view:
-- 1. Rename user_id → member_id (align with BO web code)
-- 2. Add INSTEAD OF triggers for INSERT/DELETE (view is read-only otherwise)
-- 3. Update RLS policies on group_messages to use member_id
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Drop old view and recreate with member_id ─────────────
DROP VIEW IF EXISTS message_group_members CASCADE;

CREATE OR REPLACE VIEW message_group_members AS
SELECT
  mg.id    AS group_id,
  m        AS member_id,
  mg.box_id
FROM message_groups mg,
     unnest(mg.members) AS m;

-- Grant access
GRANT SELECT ON message_group_members TO authenticated;

-- ── 2. INSTEAD OF INSERT trigger ─────────────────────────────
-- Adds a member to the message_groups.members array
CREATE OR REPLACE FUNCTION fn_message_group_members_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_groups
  SET members = array_append(members, NEW.member_id)
  WHERE id = NEW.group_id
    AND NOT (NEW.member_id = ANY(members));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_message_group_members_insert ON message_group_members;
CREATE TRIGGER trg_message_group_members_insert
  INSTEAD OF INSERT ON message_group_members
  FOR EACH ROW EXECUTE FUNCTION fn_message_group_members_insert();

-- ── 3. INSTEAD OF DELETE trigger ─────────────────────────────
-- Removes a member from the message_groups.members array
CREATE OR REPLACE FUNCTION fn_message_group_members_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE message_groups
  SET members = array_remove(members, OLD.member_id)
  WHERE id = OLD.group_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_message_group_members_delete ON message_group_members;
CREATE TRIGGER trg_message_group_members_delete
  INSTEAD OF DELETE ON message_group_members
  FOR EACH ROW EXECUTE FUNCTION fn_message_group_members_delete();

-- ── 4. Fix RLS policies on group_messages ────────────────────
-- These policies referenced user_id → now member_id

DROP POLICY IF EXISTS "member_read_group_messages" ON group_messages;
CREATE POLICY "member_read_group_messages" ON group_messages
FOR SELECT USING (
  group_id IN (
    SELECT group_id FROM message_group_members
    WHERE member_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "member_insert_group_messages" ON group_messages;
CREATE POLICY "member_insert_group_messages" ON group_messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  group_id IN (
    SELECT group_id FROM message_group_members
    WHERE member_id = auth.uid()
  )
);

-- ── 5. Reload PostgREST schema cache ─────────────────────────
NOTIFY pgrst, 'reload schema';
