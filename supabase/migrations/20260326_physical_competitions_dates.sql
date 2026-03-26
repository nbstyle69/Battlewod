-- ============================================
-- PHYSICAL COMPETITIONS: add start_date + end_date
-- ============================================

ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS start_date text,
  ADD COLUMN IF NOT EXISTS end_date text;

-- Migrate existing 'date' values into start_date for backward compat
UPDATE public.physical_competitions
SET start_date = date
WHERE start_date IS NULL AND date IS NOT NULL;
