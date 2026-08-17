-- ============================================================================
-- 20261030 — Clés de préférences manquantes sur notification_preferences
--
-- Bug produit : des notifications partaient malgré des préférences désactivées.
-- La table ne portait que 5 clés (daily_reminder, friend_requests,
-- tournament_updates, score_updates, score_comments, score_reactions) alors que
-- l'app émet une vingtaine de familles de notifications. Une famille sans clé
-- ne peut pas être désactivée : elle part inconditionnellement, et l'écran de
-- réglages ment par omission.
--
-- Les sept clés ajoutées couvrent exactement les familles qui n'en avaient
-- aucune (recon du 2026-08-16) :
--
--   score_reminder     rappel local 18 h « entre ton score » — la notification
--                      que Nab a reçue préférences coupées
--   class_reminders    rappel local 1 h avant un cours réservé
--   new_wod            « nouveau WOD » publié par la box (push)
--   group_messages     message dans un groupe (push)
--   elo_updates        gains/pertes d'ELO et résultats inter-box (push)
--   box_announcements  annonces du back-office (send-box-notification)
--   badge_unlocks      notification locale immédiate au déblocage d'un badge
--
-- DÉFAUT `true` — coexistence-safe. Le défaut inverse aurait « corrigé » le bug
-- en coupant des notifications que personne n'a demandé à couper : les lignes
-- existantes ne portent pas ces colonnes, elles hériteraient donc d'un refus
-- que l'utilisateur n'a jamais exprimé. Le silence n'est pas un choix.
--
-- Le rappel de tournoi J-1 (local) et les mises à jour de tournoi (push) restent
-- sous la clé existante `tournament_updates` : ce sont les deux faces du même
-- réglage, en dédoubler la clé rendrait l'écran incompréhensible.
--
-- Idempotente. Aucune ligne réécrite : `ADD COLUMN ... DEFAULT true` remplit les
-- lignes existantes avec le défaut sans UPDATE explicite.
-- ============================================================================

-- L'interrupteur maître `notifications_enabled` est également une COLONNE et non
-- un simple réglage d'écran : un maître appliqué côté app ne couperait que ce
-- que l'app envoie, alors que les annonces de la box et les déclencheurs
-- temporels partent du serveur. Il est évalué avant toute clé de famille.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS score_reminder    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS class_reminders   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_wod           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS group_messages    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS elo_updates       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS box_announcements boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS badge_unlocks     boolean DEFAULT true;

COMMENT ON TABLE public.notification_preferences IS
  'Préférences de notification par utilisateur. Une colonne absente = famille '
  'non gouvernée : toute nouvelle famille de notification doit ajouter sa clé '
  'ici ET son entrée dans le mapping de send-push (PREF_BY_TYPE), sinon elle '
  'part inconditionnellement. Ligne absente = tout activé (défaut true).';

-- ── Grants : inchangés, mais réaffirmés sur les nouvelles colonnes ──────────
-- Piège du repo (Lot 1B) : les GRANT de colonnes ne s'étendent pas aux colonnes
-- ajoutées après coup quand le grant initial était colonne par colonne. Ici le
-- grant est au niveau table, donc rien à faire — vérifié par db-fidelity.
-- `anon` n'a et ne doit avoir aucun accès : les préférences sont nominatives.
REVOKE ALL ON TABLE public.notification_preferences FROM anon;
