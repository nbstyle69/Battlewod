-- Add personal_records JSONB column to profiles
-- Stores PR values and dates: { "Category_Movement": "value", "Category_Movement_date": "YYYY-MM-DD" }
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS personal_records jsonb DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
