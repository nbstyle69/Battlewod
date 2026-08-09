-- ═══════════════════════════════════════════════════════════════════════════
-- PAQUET BUILD — PHASE 0-B : colonne `capped` (modèle DNF / time cap)
-- Additive, DEFAULT false → AUCUN changement de comportement : tout score
-- existant devient explicitement « finisseur ». Aucune fonction de tri/ELO
-- n'est modifiée ici.
--
-- POURQUOI COLONNE SEULE, SANS LE TRI : le classement d'un cappé (après les
-- finisseurs, départagé aux reps — standard CrossFit Games) doit être
-- IDENTIQUE entre l'aperçu app et le serveur. La logique de tri partira donc
-- avec la feature app en Phase 1 (l'app écrit `capped` + affiche le classement),
-- testée bout-en-bout des deux côtés. Poser le tri serveur seul maintenant, alors
-- qu'aucun score n'a capped=true, ne servirait à rien et créerait une fenêtre
-- d'incohérence app↔serveur.
--
-- Sémantique cible (documentée pour la Phase 1) : sur un WOD "for-time",
-- capped=true signifie « temps plafond atteint, non terminé » ; score_value
-- porte alors les reps réalisées. Au classement : finisseurs (capped=false)
-- d'abord par temps croissant, PUIS cappés par reps décroissantes.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wod_scores
  ADD COLUMN IF NOT EXISTS capped boolean NOT NULL DEFAULT false;

ALTER TABLE public.tournament_scores
  ADD COLUMN IF NOT EXISTS capped boolean NOT NULL DEFAULT false;

ALTER TABLE public.daily_tournament_scores
  ADD COLUMN IF NOT EXISTS capped boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
