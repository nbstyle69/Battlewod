-- Add leaderboard_enabled flag to box_wods
-- When false, scores are still saved (history) but no ranking/ELO is shown
ALTER TABLE box_wods
  ADD COLUMN IF NOT EXISTS leaderboard_enabled boolean NOT NULL DEFAULT true;
