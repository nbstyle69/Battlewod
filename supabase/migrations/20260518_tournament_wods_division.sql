-- ═══════════════════════════════════════════════════════════════════════
-- tournament_wods.division_id (18 mai 2026)
-- Permet d'assigner un WOD à une division spécifique (NULL = général,
-- visible par toutes les divisions / tous les athlètes du tournoi).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournament_wods
  ADD COLUMN IF NOT EXISTS division_id uuid
    REFERENCES public.tournament_divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_wods_division
  ON public.tournament_wods(division_id);
