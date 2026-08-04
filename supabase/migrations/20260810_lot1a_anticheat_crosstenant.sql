-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1A — Anti-triche & étanchéité inter-box (sécurité serveur)
-- Basé sur le DUMP RÉEL des policies de prod (reconnaissance du 08/2026), pas sur
-- le repo seul — comme la leçon tournois : on neutralise les policies permissives
-- réellement présentes, sinon elles court-circuitent en OU.
--
-- Aucune UX visible modifiée. Flux légitimes préservés (vérifiés dans l'app) :
--  • ELO/wins/matches écrits par les RPC SECURITY DEFINER (compute_wod_elo,
--    compute_daily_tournament_elo, update_user_elo) → bypassent la RLS, intacts.
--  • Le client ne fait que LIRE elo_history / user_movement_stats.
--  • Un vrai owner reste admin de SA box (branches owner_id / box_members).
-- Idempotente (DROP POLICY IF EXISTS + CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1A.1 — is_box_admin : suppression de la branche box_owner GLOBALE (cross-tenant)
-- Avant : tout profil role='box_owner' était admin de TOUTES les box (la 3e branche
-- ignorait p_box_id). Corrige ~20 policies d'un coup (tournois, brackets, saisons…).
-- Un owner légitime passe toujours par boxes.owner_id ; un coach/owner par box_members.
-- Les admins plateforme (admin/super_admin) restent global par design.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_box_admin(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id
        AND member_id = auth.uid()
        AND role IN ('owner','coach')
        AND COALESCE(status, 'active') = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')   -- box_owner RETIRÉ
    );
$$;
GRANT EXECUTE ON FUNCTION public.is_box_admin(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 1A.2 — profiles : gel des colonnes de classement (anti-triche ELO)
-- Le trigger ne protégeait QUE `role`. `elo/wins/losses/total_matches` étaient
-- librement modifiables par le propriétaire (grant UPDATE large + policy own-row
-- sans WITH CHECK) → 1re place du classement au PATCH. On étend le trigger : ces
-- 4 colonnes sont remises à OLD sauf pour le backend privilégié (les RPC ELO).
-- NB volontaire : `level` et les compteurs « vanité » NE sont PAS gelés ici — ils
-- sont encore incrémentés côté client ; `level` sera gelé APRÈS le passage de
-- syncLevelAndBadges côté serveur (lot ultérieur), pour ne rien casser.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL OR NEW.role NOT IN ('member', 'athlete') THEN
      NEW.role := 'member';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;
    -- Colonnes de compétition : écriture réservée aux RPC serveur (definer).
    NEW.elo           := OLD.elo;
    NEW.wins          := OLD.wins;
    NEW.losses        := OLD.losses;
    NEW.total_matches := OLD.total_matches;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ─────────────────────────────────────────────────────────────
-- 1A.3 — Historiques ELO : fermeture de l'INSERT ouvert (CHECK(true))
-- Avant : tout authentifié pouvait insérer une ligne d'historique → se fabriquer
-- un delta OU bloquer définitivement la distribution ELO d'un WOD (l'historique
-- sert de verrou d'idempotence : une ligne bidon = « déjà calculé »).
-- Les RPC compute_*_elo sont SECURITY DEFINER → écrivent malgré l'absence de
-- policy INSERT pour authenticated. Le client ne fait que SELECT (vérifié).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "System can insert elo_history" ON public.elo_history;
DROP POLICY IF EXISTS "daily_elo_history_insert"       ON public.daily_tournament_elo_history;
-- (pas de policy INSERT de remplacement : réservé au backend definer)

-- ─────────────────────────────────────────────────────────────
-- 1A.4 — user_movement_stats : fin de l'écriture directe (farm de badges mouvement)
-- Avant : movement_stats_own_write (FOR ALL, user_id=auth.uid()) laissait écrire
-- ses propres cumuls → badges de mouvement farmables. On retire l'écriture client ;
-- les cumuls passent exclusivement par increment_movement_stats (durci en 1A.5).
-- La lecture (movement_stats_own_read) est conservée.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "movement_stats_own_write" ON public.user_movement_stats;

-- ─────────────────────────────────────────────────────────────
-- 1A.5 — increment_movement_stats : cible forcée à auth.uid()  [À COMPLÉTER PAR DEVIN]
-- Intention : la fonction prend p_user_id → un client peut gonfler les cumuls d'un
-- AUTRE utilisateur. On veut ignorer p_user_id pour l'appelant non-backend et forcer
-- auth.uid() (signature inchangée → l'appel gamification.ts continue de marcher).
--
-- Je ne réécris PAS le corps ici : il faut le VRAI corps (colonnes exactes de
-- user_movement_stats, issu du dump). Devin : reprends la définition réelle de
-- public.increment_movement_stats et insère, tout en haut du BEGIN, ce garde —
-- puis remplace p_user_id par v_target dans l'UPSERT existant :
--
--   DECLARE v_target uuid;
--   BEGIN
--     v_target := CASE WHEN public.is_privileged_backend()
--                        THEN COALESCE(p_user_id, auth.uid())
--                      ELSE auth.uid() END;
--     IF v_target IS NULL THEN RETURN; END IF;
--     -- ... corps existant, avec p_user_id -> v_target ...
--
-- Ajoute aussi (défense en profondeur) :
--   REVOKE ALL ON FUNCTION public.increment_movement_stats(...) FROM PUBLIC;
--   GRANT EXECUTE ... TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
