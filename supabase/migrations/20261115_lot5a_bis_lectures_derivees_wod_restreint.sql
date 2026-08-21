-- 20261115 — Lot 5-A bis : les lectures DÉRIVÉES d'un WOD restreint passent par
-- la même garde que le WOD lui-même.
--
-- Constat (mesuré en production) : 20261113 a fermé la lecture du WOD restreint
-- (`box_wods.member_see_published` appelle `wod_access_allowed`). Mais tout ce
-- qui est accroché à ce WOD est resté lisible par toute la box :
--
--   wod_scores       box_members_see_scores       box_id ∈ get_user_box_ids()
--   wod_completions  box_member_see_completions   box_id ∈ mes box  OR member_id = moi
--   elo_history      Members can view … their box  box_id ∈ mes box
--   box_elo_history  box_elo_history_read          box_id ∈ mes box  OR …
--   score_comments   box_members_comments          box_id ∈ get_user_box_ids()
--   score_reactions  member_see_reactions          true                ← aucune borne
--
-- Autrement dit, depuis 20261113 un membre hors groupe ne voit plus le WOD mais
-- lit toujours son classement, ses complétions, les gains d'ELO qu'il a produits
-- et les commentaires posés dessus. La fermeture du contenu sans la fermeture de
-- ses dérivés est une garde sur deux : 65 des 80 lignes de `wod_scores` en
-- production portent sur un WOD restreint.
--
-- `score_reactions` est un cas à part et pire : `USING (true)` avec le grant
-- SELECT à `anon` rend la table lisible à la clé publique — donc des couples
-- (score, athlète) sans aucune authentification.
--
-- Principe appliqué partout : une ligne dérivée est lisible si son WOD est
-- lisible (`wod_access_allowed`), si elle n'est rattachée à aucun WOD, ou si
-- c'est la sienne. Le staff garde ses policies (il doit voir ce qu'il
-- programme). Un WOD sans restriction reste visible de toute la box — c'est le
-- contrôle positif, sans lequel « plus personne ne voit rien » passerait pour un
-- succès.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. wod_scores — le classement du WOD restreint
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS box_members_see_scores ON public.wod_scores;
CREATE POLICY box_members_see_scores ON public.wod_scores
  FOR SELECT
  USING (
    box_id IN (SELECT get_user_box_ids())
    AND (wod_id IS NULL OR public.wod_access_allowed(wod_id))
  );
-- `member_own_scores` (ALL, member_id = auth.uid()) reste : un athlète garde son
-- propre score même si son accès au programme expire ensuite.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. wod_completions — qui a fait le WOD restreint
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS box_member_see_completions ON public.wod_completions;
CREATE POLICY box_member_see_completions ON public.wod_completions
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR (
      (
        box_id IN (
          SELECT bm.box_id FROM public.box_members bm
          WHERE bm.member_id = auth.uid() AND bm.status = 'active'
        )
        OR box_id IN (SELECT b.id FROM public.boxes b WHERE b.owner_id = auth.uid())
      )
      AND (wod_id IS NULL OR public.wod_access_allowed(wod_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. elo_history / box_elo_history — les gains produits par le WOD restreint
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can view elo_history of their box" ON public.elo_history;
CREATE POLICY "Members can view elo_history of their box" ON public.elo_history
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR (
      box_id IN (
        SELECT bm.box_id FROM public.box_members bm
        WHERE bm.member_id = auth.uid() AND bm.status = 'active'
      )
      AND (wod_id IS NULL OR public.wod_access_allowed(wod_id))
    )
  );

DROP POLICY IF EXISTS box_elo_history_read ON public.box_elo_history;
CREATE POLICY box_elo_history_read ON public.box_elo_history
  FOR SELECT
  USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
    OR (
      (
        box_id IN (
          SELECT bm.box_id FROM public.box_members bm
          WHERE bm.member_id = auth.uid() AND bm.status = 'active'
        )
        OR box_id IN (SELECT b.id FROM public.boxes b WHERE b.owner_id = auth.uid())
      )
      AND (wod_id IS NULL OR public.wod_access_allowed(wod_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. score_comments — les commentaires posés sur le score du WOD restreint
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS box_members_comments ON public.score_comments;
CREATE POLICY box_members_comments ON public.score_comments
  FOR SELECT
  USING (
    author_id = auth.uid()
    OR (
      box_id IN (SELECT get_user_box_ids())
      AND EXISTS (
        SELECT 1 FROM public.wod_scores ws
        WHERE ws.id = score_comments.score_id
          AND (ws.wod_id IS NULL OR public.wod_access_allowed(ws.wod_id))
      )
    )
  );
-- `coach_read_comments` reste : le staff lit les commentaires de sa box.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. score_reactions — `USING (true)` : lisible à la clé anon
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS member_see_reactions ON public.score_reactions;
CREATE POLICY member_see_reactions ON public.score_reactions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wod_scores ws
      WHERE ws.id = score_reactions.score_id
        AND ws.box_id IN (SELECT get_user_box_ids())
        AND (ws.wod_id IS NULL OR public.wod_access_allowed(ws.wod_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.wod_scores ws
      WHERE ws.id = score_reactions.score_id AND is_box_coach(ws.box_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôle mécanique : une migration affirme ce qu'elle a produit.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_manquantes text[] := '{}';
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'wod_scores|box_members_see_scores',
      'wod_completions|box_member_see_completions',
      'elo_history|Members can view elo_history of their box',
      'box_elo_history|box_elo_history_read',
      'score_comments|box_members_comments',
      'score_reactions|member_see_reactions'
    ]) AS cible
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = split_part(r.cible, '|', 1)
        AND policyname = split_part(r.cible, '|', 2)
        AND qual LIKE '%wod_access_allowed%'
    ) THEN
      v_manquantes := v_manquantes || r.cible;
    END IF;
  END LOOP;

  IF array_length(v_manquantes, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Policies sans garde d''accès au WOD : %', array_to_string(v_manquantes, ', ');
  END IF;

  IF has_function_privilege('anon', 'public.wod_access_allowed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'wod_access_allowed reste exécutable par anon';
  END IF;
END $$;
