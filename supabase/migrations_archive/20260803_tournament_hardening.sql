-- ═══════════════════════════════════════════════════════════════════════════
-- Durcissement tournois — suite au protocole de test (audit 03/08)
-- 1. Gardes SERVEUR à l'inscription (statut / capacité / box / genre) :
--    le blocage n'existait que côté UI, l'API acceptait un join sur un tournoi
--    plein, clôturé, d'une autre box ou du mauvais genre.
-- 2. Révélation programmée des WODs de tournoi de box : opens_at était une
--    colonne morte et la RLS « USING (true) » exposait le contenu des WODs
--    « À venir » à tout le monde.
-- 3. Daily : validation/contestation par les pairs opérante (avant : no-op
--    silencieux) + complétion fiable (avant : jamais complété si <max_players
--    ou si le dernier score ne venait pas du créateur → ELO jamais distribué).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1a. Tournois de box : garde d'inscription serveur
-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER : les sous-requêtes ne dépendent pas des RLS des tables lues.
CREATE OR REPLACE FUNCTION public.can_join_tournament(p_tournament_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournaments t
    WHERE t.id = p_tournament_id
      AND t.status = 'open'                                        -- clôturé/actif = refus
      AND (SELECT count(*) FROM tournament_participants tp
             WHERE tp.tournament_id = t.id) < COALESCE(t.max_participants, 2147483647)
      AND (                                                        -- membre de la box (ou staff)
        EXISTS (SELECT 1 FROM boxes b WHERE b.id = t.box_id AND b.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM box_members bm
                     WHERE bm.box_id = t.box_id AND bm.member_id = auth.uid()
                       AND COALESCE(bm.status, 'active') = 'active')
        OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
      )
      AND (                                                        -- genre cible
        COALESCE(t.gender_target, 'mix') = 'mix'
        OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = auth.uid() AND p.gender = t.gender_target)
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_join_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_join_tournament(uuid) TO authenticated;

DROP POLICY IF EXISTS "Athletes can join tournaments" ON tournament_participants;
CREATE POLICY "Athletes can join tournaments" ON tournament_participants
  FOR INSERT WITH CHECK (
    auth.uid() = athlete_id AND public.can_join_tournament(tournament_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 1b. Daily : garde d'inscription serveur (statut / fenêtre / capacité / genre)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_join_daily_tournament(p_tournament_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM daily_tournaments dt
    WHERE dt.id = p_tournament_id
      AND dt.status = 'open'
      AND now() < dt.ends_at
      AND (dt.is_official                                          -- l'officiel est illimité
           OR (SELECT count(*) FROM daily_tournament_participants dp
                 WHERE dp.tournament_id = dt.id) < COALESCE(dt.max_players, 5))
      AND (COALESCE(dt.gender_target, 'mix') = 'mix'
           OR EXISTS (SELECT 1 FROM profiles p
                        WHERE p.id = auth.uid() AND p.gender = dt.gender_target))
  );
$$;
REVOKE ALL ON FUNCTION public.can_join_daily_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_join_daily_tournament(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users join tournaments" ON daily_tournament_participants;
CREATE POLICY "Users join tournaments" ON daily_tournament_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.can_join_daily_tournament(tournament_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 1c. Inter-box : garde d'inscription serveur (statut / capacité)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_join_inter_competition(p_competition_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM inter_competitions ic
    WHERE ic.id = p_competition_id
      AND ic.status IN ('open', 'active')                          -- draft/closed = refus
      AND (ic.max_participants IS NULL
           OR (SELECT count(*) FROM inter_registrations ir
                 WHERE ir.competition_id = ic.id) < ic.max_participants)
  );
$$;
REVOKE ALL ON FUNCTION public.can_join_inter_competition(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_join_inter_competition(uuid) TO authenticated;

DROP POLICY IF EXISTS "athlete_register_self" ON inter_registrations;
CREATE POLICY "athlete_register_self" ON inter_registrations
  FOR INSERT WITH CHECK (
    (athlete_id = auth.uid()
      OR team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid()))
    AND public.can_join_inter_competition(competition_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Révélation programmée des WODs de tournoi de box (opens_at)
-- ─────────────────────────────────────────────────────────────
-- Avant : USING (true) → mouvements/charges des WODs « À venir » lisibles par
-- tous. Maintenant : un WOD n'est visible qu'à partir de opens_at (NULL = visible
-- immédiatement, rétro-compatible avec tous les WODs existants). Les admins de
-- la box voient tout (préparation dans TheHub).
DROP POLICY IF EXISTS "tournament_wods_public_read" ON tournament_wods;
CREATE POLICY "tournament_wods_public_read" ON tournament_wods
  FOR SELECT USING (
    opens_at IS NULL
    OR opens_at <= now()
    OR public.is_box_admin((SELECT t.box_id FROM tournaments t WHERE t.id = tournament_id))
  );

-- ─────────────────────────────────────────────────────────────
-- 3a. Daily : validation / contestation par les PAIRS (RPC)
-- ─────────────────────────────────────────────────────────────
-- La policy UPDATE (auth.uid() = user_id) rendait les boutons Valider/Contester
-- inopérants pour un pair (update filtré à 0 ligne, succès affiché à tort).
-- On passe par un RPC contrôlé plutôt que d'élargir la policy (un pair ne doit
-- toucher QUE le statut/motif, jamais la valeur du score).
CREATE OR REPLACE FUNCTION public.peer_review_daily_score(
  p_tournament_id uuid,
  p_user_id uuid,         -- auteur du score relu (1 score / user / tournoi)
  p_action text,          -- 'validated' | 'contested'
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_score daily_tournament_scores%ROWTYPE;
BEGIN
  IF p_action NOT IN ('validated', 'contested') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot review your own score';
  END IF;
  SELECT * INTO v_score FROM daily_tournament_scores
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'score not found'; END IF;
  IF v_score.status <> 'pending' THEN
    RAISE EXCEPTION 'score already reviewed';
  END IF;
  -- Le relecteur doit être participant du même tournoi, encore ouvert.
  IF NOT EXISTS (
    SELECT 1 FROM daily_tournament_participants dp
    JOIN daily_tournaments dt ON dt.id = dp.tournament_id
    WHERE dp.tournament_id = p_tournament_id
      AND dp.user_id = auth.uid()
      AND dt.status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'not a participant of this tournament';
  END IF;

  UPDATE daily_tournament_scores
  SET status = p_action,
      contested_by = CASE WHEN p_action = 'contested' THEN auth.uid() ELSE contested_by END,
      contest_reason = CASE WHEN p_action = 'contested' THEN p_reason ELSE contest_reason END
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.peer_review_daily_score(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_review_daily_score(uuid, uuid, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3b. Daily : complétion fiable (RPC, appelable par tout participant)
-- ─────────────────────────────────────────────────────────────
-- Complète si (tous les scores attendus sont là) OU (la fenêtre est expirée).
-- Idempotent ; ne touche jamais l'officiel (clos par sa propre fenêtre, ELO 0).
CREATE OR REPLACE FUNCTION public.complete_daily_tournament(p_tournament_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_t daily_tournaments%ROWTYPE;
  v_scores int;
BEGIN
  SELECT * INTO v_t FROM daily_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_t.status = 'completed' THEN RETURN true; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM daily_tournament_participants dp
    WHERE dp.tournament_id = p_tournament_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a participant of this tournament';
  END IF;

  SELECT count(*) INTO v_scores
  FROM daily_tournament_scores WHERE tournament_id = p_tournament_id;

  IF v_scores >= COALESCE(v_t.max_players, 5) OR now() >= v_t.ends_at THEN
    UPDATE daily_tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_daily_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_daily_tournament(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
