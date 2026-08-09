-- ═══════════════════════════════════════════════════════════════════════
-- tournament_participants : fiabiliser l'état d'inscription côté serveur
--
-- Contexte :
--  - L'app utilisait une béquille AsyncStorage pour deviner si l'user était
--    inscrit, car certaines lectures RLS pouvaient échouer selon l'appareil.
--  - "Se désinscrire" (DELETE par l'athlète) n'avait AUCUNE policy dédiée :
--    seul l'admin (FOR ALL, migration 20260518) pouvait supprimer une ligne,
--    donc handleLeave() échouait silencieusement pour un athlète normal.
--
-- Objectif : chaque athlète peut TOUJOURS lire ET supprimer sa propre ligne,
-- quel que soit le format du tournoi (simple / bracket / swiss / league_div).
-- Les policies RLS sont permissives (OR), donc ces ajouts ne font qu'élargir
-- l'accès sans casser les policies existantes (public read, admin manage).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

-- ── SELECT : garantir que l'athlète lit toujours sa propre inscription ──
-- (redondant avec la policy publique "Participants viewable by everyone"
--  mais garantit la lecture même si cette dernière venait à être retirée)
DROP POLICY IF EXISTS "tournament_participants_self_select" ON public.tournament_participants;
CREATE POLICY "tournament_participants_self_select" ON public.tournament_participants
  FOR SELECT
  USING (auth.uid() = athlete_id);

-- ── DELETE : l'athlète peut se désinscrire lui-même ──────────────────────
DROP POLICY IF EXISTS "tournament_participants_self_delete" ON public.tournament_participants;
CREATE POLICY "tournament_participants_self_delete" ON public.tournament_participants
  FOR DELETE
  USING (auth.uid() = athlete_id);
