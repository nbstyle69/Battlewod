-- ═══════════════════════════════════════════════════════════════════════
-- Add season_number to tournament_wods so league_div WODs are scoped per
-- season. New WODs created from the BO inherit the tournament's
-- current_season; existing rows are backfilled to season 1.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournament_wods
  ADD COLUMN IF NOT EXISTS season_number int NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS tournament_wods_tid_season_idx
  ON public.tournament_wods (tournament_id, season_number);

-- Trigger: when a WOD is inserted without explicit season_number,
-- auto-assign the tournament's current_season.
CREATE OR REPLACE FUNCTION public.tournament_wods_set_season()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_season int;
BEGIN
  IF NEW.season_number IS NULL OR NEW.season_number = 1 THEN
    SELECT COALESCE(current_season, 1) INTO v_season
    FROM public.tournaments WHERE id = NEW.tournament_id;
    NEW.season_number := COALESCE(v_season, 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_wods_set_season ON public.tournament_wods;
CREATE TRIGGER trg_tournament_wods_set_season
  BEFORE INSERT ON public.tournament_wods
  FOR EACH ROW
  EXECUTE FUNCTION public.tournament_wods_set_season();
