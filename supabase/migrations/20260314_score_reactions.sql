-- Score reactions (likes, emojis) on wod_scores
CREATE TABLE IF NOT EXISTS score_reactions (
  id         uuid primary key default gen_random_uuid(),
  score_id   uuid references wod_scores(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique(score_id, user_id, emoji)
);

ALTER TABLE score_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone in the box can see reactions
DROP POLICY IF EXISTS "member_see_reactions" ON score_reactions;
CREATE POLICY "member_see_reactions" ON score_reactions
  FOR SELECT USING (true);

-- Members can add their own reactions
DROP POLICY IF EXISTS "member_add_reaction" ON score_reactions;
CREATE POLICY "member_add_reaction" ON score_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Members can remove their own reactions
DROP POLICY IF EXISTS "member_remove_reaction" ON score_reactions;
CREATE POLICY "member_remove_reaction" ON score_reactions
  FOR DELETE USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
