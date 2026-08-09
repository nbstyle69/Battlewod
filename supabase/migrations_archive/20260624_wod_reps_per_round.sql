-- ═══════════════════════════════════════════════════════════════════════
-- Add reps_per_round to tournament_wods
--
-- For AMRAP / Max Reps WODs the athlete score is normalized to a TOTAL rep
-- count (so ranking + auto-decide stay coherent regardless of whether the
-- athlete entered "rounds + reps" or a raw total). reps_per_round is the
-- number of reps in one full round, used to convert between the two
-- representations on both the athlete app and the back-office.
--
-- Auto-suggested from the WOD movements (sum of leading rep counts) but
-- editable by the owner (handles rounds that mix reps with cal/m/sec).
-- Nullable: NULL means "not set" → the app falls back to the auto sum, or
-- to raw total-reps entry only.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournament_wods
  ADD COLUMN IF NOT EXISTS reps_per_round integer;
