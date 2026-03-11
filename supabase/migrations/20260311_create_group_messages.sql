-- Table de chat pour les groupes (messages bidirectionnels)
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_id ON group_messages(sender_id);

-- RLS
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Box owners : lecture de tous les messages de leurs groupes
CREATE POLICY "box_owner_read_group_messages" ON group_messages
FOR SELECT USING (
  group_id IN (
    SELECT id FROM message_groups
    WHERE box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  )
);

-- Box owners : envoi de messages dans leurs groupes
CREATE POLICY "box_owner_insert_group_messages" ON group_messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  group_id IN (
    SELECT id FROM message_groups
    WHERE box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  )
);

-- Membres du groupe : lecture
CREATE POLICY "member_read_group_messages" ON group_messages
FOR SELECT USING (
  group_id IN (
    SELECT group_id FROM message_group_members
    WHERE user_id = auth.uid()
  )
);

-- Membres du groupe : envoi
CREATE POLICY "member_insert_group_messages" ON group_messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  group_id IN (
    SELECT group_id FROM message_group_members
    WHERE user_id = auth.uid()
  )
);

-- Activer le realtime pour les messages de groupe
ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
