-- 20261016 — garde serveur : un WOD de tournoi fermé (ou pas encore révélé)
-- n'accepte plus de score à la frontière RLS, pas seulement à l'écran.
--
-- Constat mesuré avec un vrai JWT athlète avant cette migration :
--   INSERT tournament_scores sur un WOD status='closed' → ACCEPTÉ.
-- `tournament_scores_owner_insert` ne vérifiait que `auth.uid() = athlete_id`,
-- et `tournament_scores_owner_update_pending` que la propriété + `pending`.
-- Fermer les WOD depuis le back-office ne figeait donc que l'affichage.
--
-- Périmètre : tournament_scores uniquement (daily/inter non traités ici).
-- La dérogation admin est conservée à l'identique : la fenêtre « En révision »
-- (valider / rejeter / corriger un score après fermeture des WOD) doit rester
-- ouverte à l'organisateur.

-- ── Helper : le WOD accepte-t-il des scores ? ───────────────────────────────
-- SECURITY DEFINER pour que le verdict ne dépende pas de la RLS de lecture de
-- tournament_wods (un WOD non révélé est invisible de l'athlète : sans cela le
-- garde dirait « non » pour la mauvaise raison, et dirait « oui » à un admin).
-- Vérifie aussi l'appartenance du WOD au tournoi référencé par le score.
CREATE OR REPLACE FUNCTION public.tournament_wod_accepts_scores(
  p_wod_id uuid,
  p_tournament_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tournament_wods w
     WHERE w.id = p_wod_id
       AND w.tournament_id = p_tournament_id
       AND w.status = 'active'
       AND (w.opens_at  IS NULL OR w.opens_at  <= now())
       AND (w.closes_at IS NULL OR w.closes_at >  now())
  );
$$;

-- Évaluée dans une policy, donc exécutée par le rôle appelant.
GRANT EXECUTE ON FUNCTION public.tournament_wod_accepts_scores(uuid, uuid) TO anon, authenticated, service_role;

-- ── INSERT : l'athlète ne peut soumettre que sur un WOD ouvert ──────────────
DROP POLICY IF EXISTS "tournament_scores_owner_insert" ON public.tournament_scores;
CREATE POLICY "tournament_scores_owner_insert"
  ON public.tournament_scores FOR INSERT
  WITH CHECK (
    (
      auth.uid() = athlete_id
      AND public.tournament_wod_accepts_scores(tournament_wod_id, tournament_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_scores.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );

-- ── UPDATE : idem pour la correction d'un score encore en attente ───────────
-- Les deux branches admin sont reprises telles quelles (cf. 20260921 lot 6A) :
-- ce sont elles qui portent la validation depuis TheHub.
DROP POLICY IF EXISTS "tournament_scores_owner_update_pending" ON public.tournament_scores;
CREATE POLICY "tournament_scores_owner_update_pending"
  ON public.tournament_scores FOR UPDATE
  USING (
    (
      auth.uid() = athlete_id
      AND status = 'pending'
      AND public.tournament_wod_accepts_scores(tournament_wod_id, tournament_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'box_owner'::text])
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_scores.tournament_id
         AND public.is_box_admin(t.box_id)
    )
  );
