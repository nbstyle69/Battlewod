-- ============================================
-- REFERRAL CODE: auto-generate for new profiles
-- ============================================

-- Set a default so any INSERT without referral_code gets one automatically
ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET DEFAULT UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6));

-- Backfill any profiles that still have NULL referral_code
UPDATE public.profiles
SET referral_code = UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE referral_code IS NULL;
