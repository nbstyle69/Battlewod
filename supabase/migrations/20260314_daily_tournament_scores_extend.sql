-- Extend daily_tournament_scores with video, status, and contest fields
ALTER TABLE daily_tournament_scores
  ADD COLUMN IF NOT EXISTS video_url     text,
  ADD COLUMN IF NOT EXISTS status        text DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'contested', 'rejected')),
  ADD COLUMN IF NOT EXISTS contested_by  uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS contest_reason text;

NOTIFY pgrst, 'reload schema';
