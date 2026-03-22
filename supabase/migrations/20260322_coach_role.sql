-- ============================================
-- COACH ROLE: rôle coach dans box_members
-- ============================================

-- Ajouter colonne role à box_members (member par défaut)
ALTER TABLE public.box_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'coach'));

-- ── Fonction helper : is_box_coach ──
CREATE OR REPLACE FUNCTION public.is_box_coach(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND role = 'coach'
      AND status = 'active'
  )
$$;

-- ── RLS: les coachs peuvent gérer les WODs (CRUD) ──
DROP POLICY IF EXISTS "coach_manage_wods" ON public.box_wods;
CREATE POLICY "coach_manage_wods" ON public.box_wods
  FOR ALL USING (is_box_coach(box_id));

-- ── RLS: les coachs peuvent voir tous les scores de leur box ──
DROP POLICY IF EXISTS "coach_see_scores" ON public.wod_scores;
CREATE POLICY "coach_see_scores" ON public.wod_scores
  FOR SELECT USING (is_box_coach(box_id));

-- ── RLS: les coachs peuvent commenter les scores ──
DROP POLICY IF EXISTS "coach_comment_scores" ON public.score_comments;
CREATE POLICY "coach_comment_scores" ON public.score_comments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wod_scores ws
      WHERE ws.id = score_comments.score_id
        AND is_box_coach(ws.box_id)
    )
  );

-- ── RLS: les coachs peuvent lire les commentaires de scores ──
DROP POLICY IF EXISTS "coach_read_comments" ON public.score_comments;
CREATE POLICY "coach_read_comments" ON public.score_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wod_scores ws
      WHERE ws.id = score_comments.score_id
        AND is_box_coach(ws.box_id)
    )
  );

-- ── RLS: les coachs peuvent voir les articles de leur box ──
DROP POLICY IF EXISTS "articles_coach_read" ON public.box_articles;
CREATE POLICY "articles_coach_read" ON public.box_articles
  FOR SELECT USING (is_box_coach(box_id));

-- ── RLS: les coachs peuvent gérer les articles ──
DROP POLICY IF EXISTS "articles_coach_manage" ON public.box_articles;
CREATE POLICY "articles_coach_manage" ON public.box_articles
  FOR ALL USING (is_box_coach(box_id));

-- ── RLS: owner peut changer le role des membres ──
-- (déjà couvert par les policies existantes sur box_members pour le owner)
