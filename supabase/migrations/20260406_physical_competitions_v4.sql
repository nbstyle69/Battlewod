-- ============================================
-- PHYSICAL COMPETITIONS V4: categories system
-- has_individual, has_team, individual_genders, team_genders
-- ============================================

-- 1. Boolean flags for format types (multi-select)
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS has_individual boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_team boolean DEFAULT false;

-- 2. Gender categories per format (jsonb arrays)
--    individual_genders: ["homme", "femme"]
--    team_genders:       ["homme", "femme", "mixte"]
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS individual_genders jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS team_genders jsonb DEFAULT '[]'::jsonb;

-- 3. Multi-select team sizes (jsonb array, e.g. [2, 4])
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS team_sizes jsonb DEFAULT '[]'::jsonb;

-- 4. Backfill existing rows from legacy 'format' column
UPDATE public.physical_competitions
SET
  has_individual = (format IN ('individual', 'both')),
  has_team       = (format IN ('team', 'both')),
  individual_genders = CASE WHEN format IN ('individual', 'both') THEN '["homme","femme"]'::jsonb ELSE '[]'::jsonb END,
  team_genders       = CASE WHEN format IN ('team', 'both')       THEN '["mixte"]'::jsonb        ELSE '[]'::jsonb END
WHERE has_individual IS NULL OR has_individual = false;

NOTIFY pgrst, 'reload schema';
