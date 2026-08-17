-- ═══════════════════════════════════════════════════════════════════════════
-- JOURNAL D'ENVOI DES NOTIFICATIONS DE TOURNOI (Lot C du chantier notifications)
--
-- Trois familles nouvelles, toutes sous la clé de préférence `tournament_updates`
-- (cf. mapping PREF_BY_TYPE de send-push) :
--   tournament_started   « 🏆 [Tournoi] démarre — le WOD 1 est disponible »
--   wod_scheduled        « 📅 Prochain WOD le … »
--   wod_open             « 🔥 Le WOD est ouvert, tu as [X] h pour soumettre »
--   submission_reminder  « ⏳ Il te reste [X] h pour soumettre ton score »
--
-- Ce journal EST le mécanisme d'unicité : « un seul rappel par WOD et par
-- personne » ne peut pas reposer sur une heure de balayage (le cron peut
-- repasser, se chevaucher, ou rejouer après incident). La contrainte d'unicité
-- rend le doublon impossible au niveau de la base, et non « improbable » au
-- niveau du code : le drain insère D'ABORD, puis n'envoie qu'aux lignes
-- réellement insérées.
--
-- NULLS NOT DISTINCT (PG 15+, prod en 17) est indispensable : `wod_id` est NULL
-- pour tournament_started, et un index unique classique considère deux NULL
-- comme différents — l'annonce de démarrage serait alors renvoyée à chaque
-- balayage.
--
-- AMORÇAGE (coexistence-safe) : sans lui, le premier balayage après déploiement
-- annoncerait « le tournoi démarre » pour tous les tournois DÉJÀ en cours et
-- « le WOD est ouvert » pour tous les WOD déjà ouverts depuis des semaines. On
-- inscrit donc l'état existant comme « déjà notifié ». Seuls les événements
-- POSTÉRIEURS au déploiement produisent une notification.
--
-- Aucune donnée métier modifiée. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tournament_notifications_sent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN (
                  'tournament_started', 'wod_scheduled', 'wod_open', 'submission_reminder')),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  wod_id        uuid REFERENCES public.tournament_wods(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tournament_notifications_sent IS
  'Une ligne = une notification de tournoi déjà envoyée à un athlète. Écrite '
  'AVANT l''envoi par la fonction edge tournament-notifications-cron : c''est '
  'l''unicité en base qui garantit « un seul rappel par WOD et par personne ».';

CREATE UNIQUE INDEX IF NOT EXISTS tournament_notifications_sent_uniq
  ON public.tournament_notifications_sent (kind, tournament_id, wod_id, athlete_id)
  NULLS NOT DISTINCT;

ALTER TABLE public.tournament_notifications_sent ENABLE ROW LEVEL SECURITY;

-- Aucune policy : table de service. Le drain tourne en service_role, qui
-- contourne la RLS ; personne d'autre ne lit ni n'écrit ce journal.
REVOKE ALL ON TABLE public.tournament_notifications_sent FROM anon, authenticated;
GRANT ALL ON TABLE public.tournament_notifications_sent TO service_role;

-- ── Amorçage de l'état existant ────────────────────────────────────────────
-- Démarrage : tournois déjà 'active' ou 'completed'.
INSERT INTO public.tournament_notifications_sent (kind, tournament_id, wod_id, athlete_id)
SELECT 'tournament_started', p.tournament_id, NULL, p.athlete_id
  FROM public.tournament_participants p
  JOIN public.tournaments t ON t.id = p.tournament_id
 WHERE t.status IN ('active', 'completed')
ON CONFLICT DO NOTHING;

-- WOD déjà visibles : ouverture ET rappel de soumission (le rappel d'un WOD
-- dont la fenêtre court déjà arriverait sans contexte).
INSERT INTO public.tournament_notifications_sent (kind, tournament_id, wod_id, athlete_id)
SELECT k.kind, w.tournament_id, w.id, p.athlete_id
  FROM public.tournament_wods w
  JOIN public.tournament_participants p ON p.tournament_id = w.tournament_id
 CROSS JOIN (VALUES ('wod_open'), ('submission_reminder'), ('wod_scheduled')) AS k(kind)
 WHERE w.status IN ('active', 'closed')
   AND (w.opens_at IS NULL OR w.opens_at <= now())
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
