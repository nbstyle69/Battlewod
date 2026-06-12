-- ─────────────────────────────────────────────────────────────────────────
-- Auto-assign new tournament participants to the LOWEST division
-- (only for league_div format)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_assign_lowest_division()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_format       text;
  v_lowest_div   uuid;
BEGIN
  -- Only act on league_div tournaments
  SELECT format INTO v_format
  FROM public.tournaments
  WHERE id = NEW.tournament_id;

  IF v_format IS DISTINCT FROM 'league_div' THEN
    RETURN NEW;
  END IF;

  -- Lowest division = highest level number
  SELECT id INTO v_lowest_div
  FROM public.tournament_divisions
  WHERE tournament_id = NEW.tournament_id
  ORDER BY level DESC
  LIMIT 1;

  IF v_lowest_div IS NULL THEN
    RETURN NEW; -- no divisions yet, nothing to do
  END IF;

  -- Insert (idempotent thanks to UNIQUE(division_id, athlete_id))
  INSERT INTO public.tournament_division_members (division_id, athlete_id, points, rank)
  VALUES (v_lowest_div, NEW.athlete_id, 0, NULL)
  ON CONFLICT (division_id, athlete_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_lowest_division ON public.tournament_participants;

CREATE TRIGGER trg_auto_assign_lowest_division
AFTER INSERT ON public.tournament_participants
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_lowest_division();

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: existing participants of league_div tournaments who aren't
-- yet in any division → assign them to the lowest division.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.tournament_division_members (division_id, athlete_id, points, rank)
SELECT DISTINCT ON (tp.tournament_id, tp.athlete_id)
  d.id, tp.athlete_id, 0, NULL
FROM public.tournament_participants tp
JOIN public.tournaments t ON t.id = tp.tournament_id AND t.format = 'league_div'
JOIN public.tournament_divisions d ON d.tournament_id = tp.tournament_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tournament_division_members tdm
  JOIN public.tournament_divisions dd ON dd.id = tdm.division_id
  WHERE dd.tournament_id = tp.tournament_id
    AND tdm.athlete_id = tp.athlete_id
)
ORDER BY tp.tournament_id, tp.athlete_id, d.level DESC
ON CONFLICT (division_id, athlete_id) DO NOTHING;
