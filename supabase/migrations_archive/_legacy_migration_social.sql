-- ─────────────────────────────────────────────────────────────────────────────
-- migration_social.sql  –  Friendships + profile bio/referral fields
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend profiles ──────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio            text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code  text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by    uuid references profiles(id) on delete set null;

-- Generate unique referral codes for existing users (6-char uppercase)
UPDATE profiles
SET referral_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE referral_code IS NULL;

-- ── 2. Friendships table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL references profiles(id) on delete cascade,
  addressee_id uuid NOT NULL references profiles(id) on delete cascade,
  status       text NOT NULL DEFAULT 'pending'  -- 'pending' | 'accepted' | 'declined'
               CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "see_own_friendships" ON friendships;
CREATE POLICY "see_own_friendships" ON friendships
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "send_friend_request" ON friendships;
CREATE POLICY "send_friend_request" ON friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "accept_or_decline" ON friendships;
CREATE POLICY "accept_or_decline" ON friendships
  FOR UPDATE USING (addressee_id = auth.uid());

DROP POLICY IF EXISTS "delete_friendship" ON friendships;
CREATE POLICY "delete_friendship" ON friendships
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ── 4. Allow public profile reads ───────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_profiles" ON profiles;
CREATE POLICY "public_read_profiles" ON profiles
  FOR SELECT USING (true);
