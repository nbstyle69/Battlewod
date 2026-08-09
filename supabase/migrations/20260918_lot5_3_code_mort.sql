-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 5.3 — Suppression du code mort CONFIRMÉ SUR PIÈCES (registre Devin)
--
--  • get_user_box_id() (singulier, LIMIT 1 sans ORDER BY) : 0 policy depuis
--    4A-bis, 0 fonction ne la référence, 0 usage app hors types générés.
--  • mini_tournaments : 0 ligne, 0 FK entrante, 0 fonction, 0 écran app,
--    0 usage TheHub. Table publique morte portant encore policies + grants.
--
-- RÈGLE POST-AVATARS : chaque suppression re-vérifie sa cible À L'EXÉCUTION.
-- Si l'état a changé depuis le registre (une ligne apparue, une policy
-- recréée), la migration ÉCHOUE au lieu de détruire.
--
-- HORS PÉRIMÈTRE ICI : compute-elo-batch (exige le retrait de l'invoke dans
-- EloHistoryScreen → paquet build) ; les 5 edge non déployées sont des
-- fichiers du repo, supprimés dans la même PR (pas de SQL).
-- Idempotente (IF EXISTS partout, gardes non bloquantes si déjà supprimé).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. mini_tournaments : garde d'exécution puis DROP ──────────────────────
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.mini_tournaments') IS NULL THEN
    RAISE NOTICE 'mini_tournaments deja absente — rien a faire';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.mini_tournaments' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'mini_tournaments contient % ligne(s) — etat different du registre, ON NE DROPPE PAS', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.confrelid = 'public.mini_tournaments'::regclass AND c.contype = 'f'
  ) THEN
    RAISE EXCEPTION 'une FK pointe desormais vers mini_tournaments — ON NE DROPPE PAS';
  END IF;

  -- Policies et grants tombent avec la table.
  EXECUTE 'DROP TABLE public.mini_tournaments';
  RAISE NOTICE 'mini_tournaments supprimee (0 ligne, 0 FK — re-verifie a l''instant T)';
END $$;

-- ── 2. get_user_box_id() : garde d'exécution puis DROP ─────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.get_user_box_id()') IS NULL THEN
    RAISE NOTICE 'get_user_box_id() deja absente — rien a faire';
    RETURN;
  END IF;

  -- Aucune policy ne doit la référencer (4A-bis a migré la dernière).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      -- On neutralise d'abord le pluriel : sinon une policy citant les DEUX
      -- helpers passerait au travers du garde.
      AND replace(coalesce(qual,'') || coalesce(with_check,''),
                  'get_user_box_ids(', '') ILIKE '%get_user_box_id(%'
  ) THEN
    RAISE EXCEPTION 'une policy reference encore get_user_box_id() — ON NE DROPPE PAS';
  END IF;

  -- Aucune autre fonction ne doit l'appeler.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f','p')
      AND p.proname <> 'get_user_box_id'
      AND replace(pg_get_functiondef(p.oid), 'get_user_box_ids(', '')
          ILIKE '%get_user_box_id(%'
  ) THEN
    RAISE EXCEPTION 'une fonction reference encore get_user_box_id() — ON NE DROPPE PAS';
  END IF;

  DROP FUNCTION IF EXISTS public.get_user_box_id();
  RAISE NOTICE 'get_user_box_id() supprimee (0 reference — re-verifie a l''instant T)';
END $$;

NOTIFY pgrst, 'reload schema';
