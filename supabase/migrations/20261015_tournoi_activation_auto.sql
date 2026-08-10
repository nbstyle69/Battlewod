-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVATION AUTOMATIQUE DES TOURNOIS (demande produit Nab, 2026-08-10)
--
-- Règle : un tournoi en « Inscriptions ouvertes » (status='open') passe
-- automatiquement « En cours » (status='active') dès que son PREMIER WOD
-- devient visible des athlètes — c'est-à-dire wod.status='active' ET
-- (opens_at IS NULL OR opens_at <= now()). Le passage à 'active' ferme les
-- inscriptions côté app (canRegister exige status='open') : comportement
-- « inscriptions fermées au lancement », validé par Nab.
--
-- Deux mécanismes, une seule logique :
--   1. TRIGGER sur tournament_wods → cas « l'organisateur lance un WOD
--      maintenant » : activation instantanée.
--   2. pg_cron toutes les 15 min → cas « WOD programmé (opens_at futur) » :
--      aucune écriture n'a lieu au moment où l'heure passe, seul un balayage
--      peut le voir.
--
-- VOLONTAIREMENT HORS PÉRIMÈTRE : la clôture automatique en fin de tournoi.
-- « Clôturer & ELO » fige le classement et distribue l'ELO (irréversible) et
-- le règlement laisse 48 h de validation des scores : la clôture reste un
-- geste explicite de l'organisateur (TheHub affiche un rappel, PR séparée).
--
-- Idempotente. Aucune ligne existante modifiée à l'application : la fonction
-- de balayage n'est appelée que par le cron/trigger, pas à la migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Fonction de balayage (aussi appelée par le trigger) ─────────────────
CREATE OR REPLACE FUNCTION public.sync_tournament_activation() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE tournaments t
     SET status = 'active'
   WHERE t.status = 'open'
     AND EXISTS (
       SELECT 1 FROM tournament_wods w
        WHERE w.tournament_id = t.id
          AND w.status = 'active'
          AND (w.opens_at IS NULL OR w.opens_at <= now())
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Piège Lot 5.1 : CREATE FUNCTION donne EXECUTE à PUBLIC → on retire tout,
-- seul service_role (et le cron, qui tourne en superuser) peut l'appeler.
REVOKE ALL ON FUNCTION public.sync_tournament_activation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tournament_activation() TO service_role;

-- ── 2. Trigger : activation instantanée quand un WOD devient visible ───────
CREATE OR REPLACE FUNCTION public.trg_tournament_wod_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND (NEW.opens_at IS NULL OR NEW.opens_at <= now()) THEN
    UPDATE tournaments SET status = 'active'
     WHERE id = NEW.tournament_id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_tournament_wod_activation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tournament_wod_activation ON public.tournament_wods;
CREATE TRIGGER trg_tournament_wod_activation
  AFTER INSERT OR UPDATE OF status, opens_at ON public.tournament_wods
  FOR EACH ROW EXECUTE FUNCTION public.trg_tournament_wod_activation();

-- ── 3. Balayage périodique pour les opens_at programmés ────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('tournament_activation_sweep')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tournament_activation_sweep');
  PERFORM cron.schedule(
    'tournament_activation_sweep',
    '*/15 * * * *',
    $job$SELECT public.sync_tournament_activation()$job$
  );
END $$;

NOTIFY pgrst, 'reload schema';
