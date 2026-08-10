-- ============================================================================
-- 20261018 — Attribution des badges côté serveur + fermeture de la lecture anon
--
-- 1. `badges_public_read` était `USING (true)` : la gamification de tous les
--    athlètes était lisible par `anon`. Aucune page publique de TheHub
--    n'affiche de badge (seul /api/auth/signup en écrit, en service_role) :
--    la lecture passe à `authenticated`.
--
-- 2. L'attribution était forgeable par construction : `awardBadge()` faisait un
--    INSERT dans `athlete_badges` depuis la session de l'athlète. La policy ne
--    l'autorisant pas, l'insert échouait en silence (le badge de bienvenue n'a
--    donc jamais fonctionné) — mais si elle l'avait autorisé, n'importe qui se
--    serait forgé n'importe quel badge par PostgREST.
--
--    On ne répare pas le chemin client : on le remplace par `claim_badge()`,
--    SECURITY DEFINER, qui revérifie la condition côté serveur avant d'insérer.
--    L'athlète déclenche, le serveur décide. La RPC ne prend PAS d'identifiant
--    d'athlète : elle n'écrit que pour `auth.uid()`, donc réclamer pour autrui
--    est impossible par construction.
--
--    Les badges posés par l'owner (crédit de score, clôture de tournoi) restent
--    sur le chemin d'écriture directe, déjà scopé par `is_box_admin_of_athlete()`
--    (20261017). Coexistence-safe : la RPC est inerte tant que l'app ne l'appelle
--    pas, et l'app en place continue d'échouer en silence comme aujourd'hui.
-- ============================================================================

-- ── 1. Lecture des badges réservée aux comptes connectés ───────────────────

DROP POLICY IF EXISTS "badges_public_read"        ON public.athlete_badges;
DROP POLICY IF EXISTS "badges_authenticated_read" ON public.athlete_badges;

CREATE POLICY "badges_authenticated_read"
  ON public.athlete_badges FOR SELECT
  TO authenticated
  USING (true);

-- ── 2. Conditions d'obtention, revérifiées côté serveur ────────────────────
--
-- Ne sont éligibles que les badges dont la condition se lit dans une donnée que
-- l'athlète ne peut pas écrire lui-même :
--   • profiles.elo         — figé par le trigger prevent_role_escalation
--   • tournament_elo_history — écriture réservée à l'organisateur (20261017)
--   • tournament_participants / friendships / messages — relations réelles
--   • les tables de score    — une ligne existe ou non
--
-- Les badges adossés à un compteur de `profiles` librement modifiable par son
-- porteur (total_timer_sessions, total_wods_generated) ou à `athlete_streaks`
-- (self-writable) ne sont volontairement PAS réclamables : les rendre
-- réclamables reviendrait à rouvrir la faille par la fenêtre. Ils attendent une
-- source d'événements côté serveur.

CREATE OR REPLACE FUNCTION public.badge_condition_met(
  p_athlete_id uuid,
  p_badge_key  text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_elo   integer;
  v_count integer;
BEGIN
  IF p_athlete_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_badge_key

    -- Bienvenue : porté par tout profil existant.
    WHEN 'level_scaled' THEN
      RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete_id);

    -- Paliers de classement : ELO réel du profil.
    WHEN 'level_inter', 'level_rx', 'level_rx_plus', 'level_elite', 'level_pro' THEN
      SELECT elo INTO v_elo FROM public.profiles WHERE id = p_athlete_id;
      IF v_elo IS NULL THEN RETURN false; END IF;
      RETURN v_elo >= CASE p_badge_key
        WHEN 'level_inter'    THEN 1001
        WHEN 'level_rx'       THEN 1200
        WHEN 'level_rx_plus'  THEN 1400
        WHEN 'level_elite'    THEN 1600
        WHEN 'level_pro'      THEN 1800
      END;

    -- Premier score : une ligne de score existe réellement.
    WHEN 'first_score' THEN
      RETURN EXISTS (SELECT 1 FROM public.tournament_scores      WHERE athlete_id = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.daily_tournament_scores WHERE user_id    = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.wod_scores              WHERE member_id  = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.generated_wod_scores    WHERE user_id    = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.program_scores          WHERE user_id    = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.inter_scores            WHERE athlete_id = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.scores                  WHERE athlete_id = p_athlete_id);

    -- Palmarès : rang final distribué par l'organisateur à la clôture.
    WHEN 'first_win' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.tournament_elo_history
         WHERE athlete_id = p_athlete_id AND final_rank = 1
      );

    WHEN 'champion_5' THEN
      SELECT count(*) INTO v_count
        FROM public.tournament_elo_history
       WHERE athlete_id = p_athlete_id AND final_rank = 1;
      RETURN v_count >= 5;

    WHEN 'podium' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.tournament_elo_history
         WHERE athlete_id = p_athlete_id AND final_rank BETWEEN 1 AND 3
      );

    WHEN 'veteran_10' THEN
      SELECT count(DISTINCT tournament_id) INTO v_count
        FROM public.tournament_participants
       WHERE athlete_id = p_athlete_id;
      RETURN v_count >= 10;

    -- Social : amitiés réellement acceptées, dans les deux sens.
    WHEN 'social_5' THEN
      SELECT count(*) INTO v_count
        FROM public.friendships
       WHERE status = 'accepted'
         AND (requester_id = p_athlete_id OR addressee_id = p_athlete_id);
      RETURN v_count >= 5;

    -- Messages réellement envoyés (chat de groupe + messagerie directe).
    WHEN 'chatty_50' THEN
      SELECT (SELECT count(*) FROM public.group_messages WHERE sender_id = p_athlete_id)
           + (SELECT count(*) FROM public.messages       WHERE sender_id = p_athlete_id)
        INTO v_count;
      RETURN v_count >= 50;

    ELSE
      -- Badge sans source serveur fiable : jamais réclamable.
      RETURN false;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.badge_condition_met(uuid, text) IS
  'Revérifie la condition d''obtention d''un badge sur des données que l''athlète ne peut pas écrire. Renvoie false pour tout badge sans source serveur fiable.';

-- ── 3. RPC de réclamation : l'athlète déclenche, le serveur décide ─────────

CREATE OR REPLACE FUNCTION public.claim_badge(p_badge_key text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentification requise' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.badges_catalog WHERE badge_key = p_badge_key) THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false,
                              'badge_key', p_badge_key, 'reason', 'badge_inconnu');
  END IF;

  IF NOT public.badge_condition_met(v_uid, p_badge_key) THEN
    RETURN jsonb_build_object('ok', false, 'awarded', false,
                              'badge_key', p_badge_key, 'reason', 'condition_non_remplie');
  END IF;

  INSERT INTO public.athlete_badges (athlete_id, badge_key)
  VALUES (v_uid, p_badge_key)
  ON CONFLICT (athlete_id, badge_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Re-réclamation : succès, mais rien de neuf (awarded = false).
  RETURN jsonb_build_object('ok', true, 'awarded', v_inserted > 0,
                            'badge_key', p_badge_key);
END;
$$;

COMMENT ON FUNCTION public.claim_badge(text) IS
  'Attribution serveur d''un badge à auth.uid() après revérification de la condition. Idempotente. Ne prend pas d''identifiant d''athlète : réclamer pour autrui est impossible.';

-- `badge_condition_met` n'est appelée que depuis `claim_badge` (definer) : aucun
-- rôle client n'a besoin de l'exécuter directement.
REVOKE ALL ON FUNCTION public.badge_condition_met(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_badge(text)               FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_badge(text) TO authenticated, service_role;
