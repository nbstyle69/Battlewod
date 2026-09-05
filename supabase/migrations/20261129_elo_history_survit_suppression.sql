-- ELO (PR 2) : l'historique ne disparaît plus avec le tournoi ou le WOD.
--
-- Les sept tables d'historique référençaient leur événement (WOD, tournoi,
-- match, WOD de tournoi, mini-tournoi, compétition) en ON DELETE CASCADE :
-- supprimer l'événement effaçait la trace (elo_before / elo_after) tout en
-- laissant les points sur profiles.elo — c'est ce qui a produit les écarts
-- constatés sur JCVD après la purge des comptes jetables.
--
-- Désormais : la référence devient NULL, la ligne reste. L'égalité
-- « profiles.elo = dernier elo_after » survit à la suppression. Les clés vers
-- profiles / auth.users / boxes restent en CASCADE : la disparition d'un
-- athlète emporte son historique, c'est voulu (RGPD).
--
-- Les colonnes tournament_id de tournament_match_elo_history et
-- tournament_wod_elo_history n'ont pas de clé étrangère : elles gardent
-- l'identifiant du tournoi supprimé, ce qui n'empêche rien.

BEGIN;

-- 1. elo_history.wod_id → box_wods
ALTER TABLE public.elo_history
  ALTER COLUMN wod_id DROP NOT NULL,
  DROP CONSTRAINT elo_history_wod_id_fkey,
  ADD CONSTRAINT elo_history_wod_id_fkey
    FOREIGN KEY (wod_id) REFERENCES public.box_wods(id) ON DELETE SET NULL;

-- 2. box_elo_history.wod_id → box_wods
ALTER TABLE public.box_elo_history
  ALTER COLUMN wod_id DROP NOT NULL,
  DROP CONSTRAINT box_elo_history_wod_id_fkey,
  ADD CONSTRAINT box_elo_history_wod_id_fkey
    FOREIGN KEY (wod_id) REFERENCES public.box_wods(id) ON DELETE SET NULL;

-- 3. tournament_elo_history.tournament_id → tournaments
ALTER TABLE public.tournament_elo_history
  ALTER COLUMN tournament_id DROP NOT NULL,
  DROP CONSTRAINT tournament_elo_history_tournament_id_fkey,
  ADD CONSTRAINT tournament_elo_history_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 4. tournament_match_elo_history.match_id → tournament_bracket_matches
ALTER TABLE public.tournament_match_elo_history
  ALTER COLUMN match_id DROP NOT NULL,
  DROP CONSTRAINT tournament_match_elo_history_match_id_fkey,
  ADD CONSTRAINT tournament_match_elo_history_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.tournament_bracket_matches(id) ON DELETE SET NULL;

-- 5. tournament_wod_elo_history.tournament_wod_id → tournament_wods
ALTER TABLE public.tournament_wod_elo_history
  ALTER COLUMN tournament_wod_id DROP NOT NULL,
  DROP CONSTRAINT tournament_wod_elo_history_tournament_wod_id_fkey,
  ADD CONSTRAINT tournament_wod_elo_history_tournament_wod_id_fkey
    FOREIGN KEY (tournament_wod_id) REFERENCES public.tournament_wods(id) ON DELETE SET NULL;

-- 6. daily_tournament_elo_history.tournament_id → daily_tournaments
ALTER TABLE public.daily_tournament_elo_history
  ALTER COLUMN tournament_id DROP NOT NULL,
  DROP CONSTRAINT daily_tournament_elo_history_tournament_id_fkey,
  ADD CONSTRAINT daily_tournament_elo_history_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.daily_tournaments(id) ON DELETE SET NULL;

-- 7. inter_elo_history.competition_id → inter_competitions
ALTER TABLE public.inter_elo_history
  ALTER COLUMN competition_id DROP NOT NULL,
  DROP CONSTRAINT inter_elo_history_competition_id_fkey,
  ADD CONSTRAINT inter_elo_history_competition_id_fkey
    FOREIGN KEY (competition_id) REFERENCES public.inter_competitions(id) ON DELETE SET NULL;

-- profiles.losses : colonne morte. Aucune fonction serveur ni aucun écran ne
-- l'incrémente ou ne la lit ; les défaites affichées sont total_matches - wins.
COMMENT ON COLUMN public.profiles.losses IS
  'Colonne morte : jamais incrémentée. Les défaites se calculent total_matches - wins. Ne pas lire, ne pas afficher.';

-- Garde : les sept clés sont bien en SET NULL, aucune en CASCADE.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_constraint
  WHERE conname IN (
    'elo_history_wod_id_fkey', 'box_elo_history_wod_id_fkey',
    'tournament_elo_history_tournament_id_fkey', 'tournament_match_elo_history_match_id_fkey',
    'tournament_wod_elo_history_tournament_wod_id_fkey',
    'daily_tournament_elo_history_tournament_id_fkey', 'inter_elo_history_competition_id_fkey'
  ) AND confdeltype <> 'n';
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'ELO_HISTORY_FK : % clé(s) encore en CASCADE', v_bad;
  END IF;
END $$;

COMMIT;
