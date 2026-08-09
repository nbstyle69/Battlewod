-- ═══════════════════════════════════════════════════════════════
-- Migration: WOD Blocks + ELO per session
-- ═══════════════════════════════════════════════════════════════

-- 1. Add block_name column to box_wods
ALTER TABLE box_wods ADD COLUMN IF NOT EXISTS block_name text;

-- 2. Create elo_history table to track ELO changes per WOD session
CREATE TABLE IF NOT EXISTS elo_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  wod_id      uuid NOT NULL REFERENCES box_wods(id) ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  elo_before  int  NOT NULL DEFAULT 1000,
  elo_after   int  NOT NULL DEFAULT 1000,
  elo_delta   int  NOT NULL DEFAULT 0,
  rank        int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(wod_id, member_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_elo_history_member ON elo_history(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_elo_history_wod    ON elo_history(wod_id);
CREATE INDEX IF NOT EXISTS idx_box_wods_block     ON box_wods(box_id, scheduled_date, block_name);

-- RLS
ALTER TABLE elo_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view elo_history of their box"
  ON elo_history FOR SELECT
  USING (box_id IN (
    SELECT bm.box_id FROM box_members bm WHERE bm.member_id = auth.uid() AND bm.status = 'active'
  ));

CREATE POLICY "System can insert elo_history"
  ON elo_history FOR INSERT
  WITH CHECK (true);

-- 3. Ensure profiles table has elo column (default 1000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'elo'
  ) THEN
    ALTER TABLE profiles ADD COLUMN elo int DEFAULT 1000;
  END IF;
END $$;
