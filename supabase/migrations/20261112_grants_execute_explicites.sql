-- Grants EXECUTE explicites sur le schéma public — et la cause, pas l'occurrence.
--
-- Départ : le lot 4 avait oublié « REVOKE ... FROM PUBLIC » sur une RPC. Le
-- motif est appliqué depuis le lot 6a et présent dans 20 migrations, jamais
-- dans une règle écrite ni dans un contrôle. En le cherchant dans le catalogue
-- plutôt que dans le SQL, la cause est apparue : toute fonction créée dans le
-- schéma `public` naît atteignable à la clé anonyme, par deux chemins cumulés —
--
--   défaut du moteur   : EXECUTE accordé à PUBLIC sur toute fonction neuve
--   pg_default_acl     : postgres/public/f → {anon=X, authenticated=X, service_role=X}
--
-- Donc chaque fonction est née atteignable à la clé anonyme, et chaque
-- migration devait penser à la refermer. Douze occurrences de la même famille
-- ont cette forme : une valeur par défaut ouverte, refermée à la main.
--
-- Mesuré en production avant ce correctif : 67 fonctions accordaient EXECUTE à
-- PUBLIC, 82 l'accordaient nominativement à `anon`, dont — sans aucune garde
-- interne — `get_tournament_participants` (identifiants d'athlètes et scores),
-- `get_tournament_validated_scores`, `check_weekly_limit`, `is_blocked_pair`,
-- et deux mutateurs : `extend_all_class_schedules` (tous les créneaux de toutes
-- les box) et `generate_class_schedules_from_templates`.
--
-- Ce que fait cette migration :
--   1. retire l'héritage PUBLIC de toutes les fonctions du schéma ;
--   2. retire `anon` de toutes les fonctions hors liste blanche explicite ;
--   3. ferme la valeur par défaut, pour que l'oubli ne soit plus possible ;
--   4. rend nominatifs les grants des fonctions qui ne vivaient que de PUBLIC ;
--   5. ajoute la garde de box manquante au seul mutateur qui gardait un accès
--      utilisateur sans vérifier *quelle* box ;
--   6. se vérifie elle-même.
--
-- La liste blanche `anon` ne contient que des prédicats de policy portés par
-- des policies dont les rôles incluent `public` : une expression de policy est
-- évaluée avec les privilèges de l'appelant, donc sans EXECUTE la requête
-- **échoue** au lieu de rendre faux — et les pages publiques tombent. Plus
-- `peek_box_invitation`, appelée par la page publique /rejoindre/[token].
--
-- Le contrôle mécanique correspondant vit dans `scripts/test-grants.mjs`, câblé
-- aux suites d'intégration : une règle que la CI applique ne s'oublie pas.

-- ── 1. Retrait de l'héritage PUBLIC ──────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND EXISTS (
        SELECT 1 FROM aclexplode(p.proacl) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- ── 2. Retrait de `anon` hors liste blanche ──────────────────────────────────
DO $$
DECLARE
  -- Prédicats de policy (policies dont les rôles incluent `public`) : nombre de
  -- policies concernées entre parenthèses, mesuré dans pg_policies.
  blanche text[] := ARRAY[
    'get_user_box_ids',                 -- 24 policies
    'is_box_admin',                     -- 20 policies
    'is_super_admin',                   -- 10 policies
    'is_box_owner',                     --  8 policies
    'is_box_coach',                     --  7 policies
    'manages_box_funnel',               --  7 policies
    'manages_box',                      --  6 policies
    'is_box_owner_member',              --  6 policies
    'is_box_admin_of_athlete',          --  4 policies
    'tournament_wod_accepts_scores',    --  2 policies
    'is_box_member',                    --  1 policy
    'get_box_mate_ids',                 --  1 policy
    'can_join_tournament',              --  1 policy
    'can_join_daily_tournament',        --  1 policy
    'can_join_inter_competition',       --  1 policy
    'box_subscribes_programming',       --  1 policy
    -- Page publique /rejoindre/[token] : lue sans session, par construction.
    'peek_box_invitation'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT (p.proname = ANY (blanche))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;

  -- Un prédicat de policy sans EXECUTE fait échouer la requête anonyme au lieu
  -- de rendre faux : `box_subscribes_programming` était dans cet état.
  FOR r IN
    SELECT format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (blanche)
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ── 3. La valeur par défaut cesse d'ouvrir ───────────────────────────────────
-- Sans ceci, la prochaine fonction naît atteignable à la clé anonyme et le
-- correctif ci-dessus n'est vrai qu'aujourd'hui.
DO $$
DECLARE createur text;
BEGIN
  FOREACH createur IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    BEGIN
      -- Deux sources, deux portées — et la seconde m'a pris deux essais.
      --
      -- `anon=X` vient de pg_default_acl, posé par la plateforme sur le schéma
      -- public : il se retire avec la forme « IN SCHEMA public ».
      --
      -- Le `=X` de PUBLIC, lui, est le défaut câblé du moteur : il n'est *pas*
      -- annulé par la forme « IN SCHEMA » (mesuré — la fonction suivante naît
      -- encore `{=X/…}`). Seule la forme globale l'annule. Deux instructions
      -- qui se ressemblent, une seule qui agit : exactement le genre d'écart
      -- qu'un contrôle voit et qu'une relecture rate.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
        'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', createur);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE EXECUTE ON FUNCTIONS FROM anon', createur);
    EXCEPTION
      WHEN insufficient_privilege OR undefined_object THEN
        -- La CI reste le filet : test-grants.mjs échoue si `anon` récupère une
        -- fonction hors liste blanche, quelle qu'en soit la voie.
        RAISE NOTICE 'privilèges par défaut de % non modifiables ici', createur;
    END;
  END LOOP;
END $$;

-- ── 4. Grants nominatifs des fonctions qui ne vivaient que de PUBLIC ─────────
DO $$
DECLARE
  rpcs text[] := ARRAY[
    'public.advance_bracket_round(p_tournament_id uuid, p_completed_round integer)',
    'public.advance_inter_bracket_round(p_competition_id uuid, p_completed_round integer)',
    'public.calculate_elo(winner_elo integer, loser_elo integer, k_factor integer)',
    'public.check_weekly_limit(p_user_id uuid, p_box_id uuid)',
    'public.check_weekly_limit(p_user_id uuid, p_box_id uuid, p_target_date date)',
    'public.compute_inter_league_round(p_competition_id uuid, p_round_number integer)',
    'public.end_season_and_advance(p_tournament_id uuid)',
    'public.generate_bracket_round_1(p_tournament_id uuid)',
    'public.generate_inter_bracket_round_1(p_competition_id uuid)',
    'public.generate_inter_pool_groups(p_competition_id uuid, p_groups_count integer, p_advance_count integer)',
    'public.generate_inter_swiss_round(p_competition_id uuid)',
    'public.get_box_billing(p_box_id uuid)',
    'public.get_box_dunning(p_box_id uuid)',
    'public.get_my_membership_billing()',
    'public.get_total_box_count()',
    'public.get_tournament_participants(p_tournament_id uuid)',
    'public.get_tournament_validated_scores(p_tournament_id uuid)',
    'public.is_blocked_pair(u1 uuid, u2 uuid)',
    'public.is_inter_competition_manager(p_competition_id uuid)',
    'public.is_privileged_backend()',
    'public.is_tournament_manager(p_tournament_id uuid)',
    'public.is_box_staff(p_box_id uuid)',
    'public.is_support_admin()',
    'public.promote_relegate_divisions(p_tournament_id uuid)',
    'public.report_content(p_content_type text, p_content_id uuid, p_reported_user_id uuid, p_reason text, p_details text)',
    'public.resolve_inter_pool_match(p_match_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text)',
    'public.resolve_inter_swiss_pairing(p_pairing_id uuid, p_score1 numeric, p_score2 numeric, p_scoring_type text)'
  ];
  sig text;
BEGIN
  FOREACH sig IN ARRAY rpcs LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
  END LOOP;
END $$;

-- Cron et backend : service_role seul (le cron s'exécute en `postgres`).
GRANT EXECUTE ON FUNCTION public.extend_all_class_schedules() TO service_role;
GRANT EXECUTE ON FUNCTION public._daily_official_template(p_date date) TO service_role;

-- ── 5. Le seul mutateur de box qui restait sans garde interne ────────────────
-- Le grant `authenticated` ne dit pas *quelle* box : sans cette garde, un
-- membre pourrait générer les créneaux d'une autre salle.
CREATE OR REPLACE FUNCTION public.generate_class_schedules_from_templates(
  p_box_id uuid,
  p_weeks_ahead integer DEFAULT 8
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted INT := 0;
  v_start_date DATE := CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1));
  v_end_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : cette box ne vous appartient pas' USING ERRCODE = '42501';
  END IF;

  IF p_weeks_ahead IS NULL OR p_weeks_ahead < 1 THEN
    p_weeks_ahead := 8;
  END IF;

  v_end_date := v_start_date + (p_weeks_ahead * 7) - 1;

  WITH ins AS (
    INSERT INTO class_schedules
      (box_id, title, description, coach, scheduled_date, start_time, end_time, max_capacity)
    SELECT
      t.box_id, t.title, t.description, t.coach,
      d::date, t.start_time, t.end_time, t.max_capacity
    FROM schedule_templates t
    CROSS JOIN generate_series(v_start_date, v_end_date, INTERVAL '1 day') AS d
    WHERE t.box_id = p_box_id
      AND t.is_active = TRUE
      AND EXTRACT(ISODOW FROM d)::INT = t.day_of_week
      AND NOT EXISTS (
        SELECT 1 FROM class_schedules cs
        WHERE cs.box_id = t.box_id
          AND cs.scheduled_date = d::date
          AND cs.start_time = t.start_time
          AND cs.title = t.title
      )
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_class_schedules_from_templates(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_class_schedules_from_templates(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_class_schedules_from_templates(uuid, integer) TO authenticated, service_role;

-- ── 6. La migration se vérifie elle-même ─────────────────────────────────────
DO $$
DECLARE
  blanche text[] := ARRAY[
    'get_user_box_ids', 'is_box_admin', 'is_super_admin', 'is_box_owner',
    'is_box_coach', 'manages_box_funnel', 'manages_box', 'is_box_owner_member',
    'is_box_admin_of_athlete', 'tournament_wod_accepts_scores', 'is_box_member',
    'get_box_mate_ids', 'can_join_tournament', 'can_join_daily_tournament',
    'can_join_inter_competition', 'box_subscribes_programming',
    'peek_box_invitation'
  ];
  v_public text;
  v_anon text;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_public
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');

  IF v_public IS NOT NULL THEN
    RAISE EXCEPTION 'EXECUTE encore accordé à PUBLIC : %', v_public;
  END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_anon
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
    AND NOT (p.proname = ANY (blanche))
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION '`anon` exécute encore, hors liste blanche : %', v_anon;
  END IF;
END $$;
