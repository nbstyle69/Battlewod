-- ============================================
-- PHYSICAL COMPETITIONS V3: start_time, end_time, team_size, format 'both'
-- ============================================

-- 1. Add start_time + end_time columns
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;

-- 2. Add team_size column (2-6 for team competitions)
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS team_size integer;

-- 3. Update format CHECK constraint to allow 'both'
ALTER TABLE public.physical_competitions DROP CONSTRAINT IF EXISTS physical_competitions_format_check;
ALTER TABLE public.physical_competitions
  ADD CONSTRAINT physical_competitions_format_check
  CHECK (format IN ('individual', 'team', 'both'));

NOTIFY pgrst, 'reload schema';
