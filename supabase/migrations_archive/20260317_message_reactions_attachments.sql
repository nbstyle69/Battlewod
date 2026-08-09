-- ============================================================
-- Message Reactions + Attachments support
-- ============================================================

-- 1. Add attachment_url to group_messages (messages table already has it)
ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- 2. Alter existing message_reactions table:
--    - change message_id from uuid to text (to support "gc-xxx" and "admin-xxx" IDs)
--    - add emoji column
--    - add unique constraint

-- Drop old FK constraint if any, and change column type
ALTER TABLE message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_fkey;

ALTER TABLE message_reactions
  ALTER COLUMN message_id TYPE text USING message_id::text;

-- Add emoji column if missing
ALTER TABLE message_reactions
  ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '❤️';

-- Add unique constraint on (message_id, member_id, emoji)
ALTER TABLE message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_member_id_emoji_key;
ALTER TABLE message_reactions
  ADD CONSTRAINT message_reactions_message_id_member_id_emoji_key UNIQUE(message_id, member_id, emoji);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

-- RLS policies (drop first to avoid conflicts)
DROP POLICY IF EXISTS "read_reactions" ON message_reactions;
CREATE POLICY "read_reactions" ON message_reactions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "insert_own_reaction" ON message_reactions;
CREATE POLICY "insert_own_reaction" ON message_reactions
  FOR INSERT WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_reaction" ON message_reactions;
CREATE POLICY "delete_own_reaction" ON message_reactions
  FOR DELETE USING (member_id = auth.uid());

-- 3. Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload
DROP POLICY IF EXISTS "auth_upload_attachments" ON storage.objects;
CREATE POLICY "auth_upload_attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'message-attachments' AND auth.uid() IS NOT NULL
  );

-- Anyone can view attachments
DROP POLICY IF EXISTS "public_read_attachments" ON storage.objects;
CREATE POLICY "public_read_attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'message-attachments');
