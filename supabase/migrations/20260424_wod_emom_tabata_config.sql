-- ─────────────────────────────────────────────────────────────
-- Per-WOD EMOM interval and Tabata work/rest configuration.
--
-- Box owners can now choose:
--   • EMOM: interval in minutes (1..5) → EMOM, E2MOM, E3MOM, E4MOM, E5MOM
--   • Tabata: work seconds and rest seconds (defaults 20/10)
--
-- These values are consumed by the mobile Timer helper
-- (`src/utils/wodToTimer.ts`) when launching a preconfigured timer
-- from a WOD card on the whiteboard.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.box_wods
  ADD COLUMN IF NOT EXISTS emom_interval_minutes SMALLINT,
  ADD COLUMN IF NOT EXISTS tabata_work_seconds   SMALLINT,
  ADD COLUMN IF NOT EXISTS tabata_rest_seconds   SMALLINT;

-- Validation: EMOM interval must be 1..5 when set
ALTER TABLE public.box_wods
  DROP CONSTRAINT IF EXISTS box_wods_emom_interval_check;
ALTER TABLE public.box_wods
  ADD CONSTRAINT box_wods_emom_interval_check
    CHECK (emom_interval_minutes IS NULL OR emom_interval_minutes BETWEEN 1 AND 5);

-- Validation: Tabata work/rest must be positive when set
ALTER TABLE public.box_wods
  DROP CONSTRAINT IF EXISTS box_wods_tabata_work_check;
ALTER TABLE public.box_wods
  ADD CONSTRAINT box_wods_tabata_work_check
    CHECK (tabata_work_seconds IS NULL OR tabata_work_seconds BETWEEN 5 AND 300);

ALTER TABLE public.box_wods
  DROP CONSTRAINT IF EXISTS box_wods_tabata_rest_check;
ALTER TABLE public.box_wods
  ADD CONSTRAINT box_wods_tabata_rest_check
    CHECK (tabata_rest_seconds IS NULL OR tabata_rest_seconds BETWEEN 0 AND 300);

COMMENT ON COLUMN public.box_wods.emom_interval_minutes IS
  'EMOM interval in minutes (1=EMOM, 2=E2MOM, 3=E3MOM, 4=E4MOM, 5=E5MOM). Null for non-EMOM WODs.';
COMMENT ON COLUMN public.box_wods.tabata_work_seconds IS
  'Tabata work phase duration in seconds. Null for non-Tabata WODs. Default usage: 20s.';
COMMENT ON COLUMN public.box_wods.tabata_rest_seconds IS
  'Tabata rest phase duration in seconds. Null for non-Tabata WODs. Default usage: 10s.';
