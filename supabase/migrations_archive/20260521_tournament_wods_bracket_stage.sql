-- tournament_wods.bracket_stage (juin 2026)
-- Assigne un WOD a une ETAPE du bracket (format bracket / swiss).
-- Valeur = distance a la finale (robuste a la taille reelle du bracket) :
--   0 = Finale, 1 = Demi-finale, 2 = Quart, 3 = 8e, 4 = 16e, 5 = 32e ...
-- NULL = non assigne / toutes les etapes.
-- round_cible = nb_total_rounds - bracket_stage (Finale = dernier round).

ALTER TABLE public.tournament_wods
  ADD COLUMN IF NOT EXISTS bracket_stage int;

CREATE INDEX IF NOT EXISTS idx_tournament_wods_bracket_stage
  ON public.tournament_wods (tournament_id, bracket_stage);
