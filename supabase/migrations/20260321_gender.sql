-- Add gender column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female')) DEFAULT NULL;

-- Add gender_target column to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS gender_target text CHECK (gender_target IN ('male', 'female', 'mix')) DEFAULT 'mix';

-- Add gender_target column to daily_tournaments
ALTER TABLE daily_tournaments ADD COLUMN IF NOT EXISTS gender_target text CHECK (gender_target IN ('male', 'female', 'mix')) DEFAULT 'mix';
