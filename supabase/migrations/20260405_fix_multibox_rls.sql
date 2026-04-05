-- ============================================================
-- FIX: Multi-box RLS policies (v3 — COMPLETE)
--
-- Remplace TOUTES les sous-requêtes inline sur box_members dans
-- les RLS policies par des fonctions SECURITY DEFINER.
--
-- SECURITY DEFINER = bypass RLS sur box_members → pas de récursion.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (SECURITY DEFINER = bypass RLS)
-- ══════════════════════════════════════════════════════════════

-- Retourne TOUS les box_id de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.get_user_box_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT bm.box_id FROM public.box_members bm
  WHERE bm.member_id = auth.uid() AND bm.status = 'active';
$$;

-- Retourne TOUS les member_id qui partagent une box avec l'utilisateur
CREATE OR REPLACE FUNCTION public.get_box_mate_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT bm2.member_id FROM public.box_members bm2
  WHERE bm2.box_id IN (
    SELECT bm.box_id FROM public.box_members bm
    WHERE bm.member_id = auth.uid() AND bm.status = 'active'
  ) AND bm2.status = 'active';
$$;

-- Vérifie si l'utilisateur est membre actif d'une box donnée
CREATE OR REPLACE FUNCTION public.is_box_member(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ══════════════════════════════════════════════════════════════
-- POLICIES — migration_b2b.sql originals
-- ══════════════════════════════════════════════════════════════

-- 1. boxes — member_see_box
DROP POLICY IF EXISTS "member_see_box" ON public.boxes;
CREATE POLICY "member_see_box" ON public.boxes
  FOR SELECT USING (id IN (SELECT public.get_user_box_ids()));

-- 2. box_wods — member_see_published
DROP POLICY IF EXISTS "member_see_published" ON public.box_wods;
CREATE POLICY "member_see_published" ON public.box_wods
  FOR SELECT USING (
    box_id IN (SELECT public.get_user_box_ids())
    AND is_published = true
    AND (publish_at IS NULL OR publish_at <= now())
  );

-- 3. wod_scores — box_members_see_scores
DROP POLICY IF EXISTS "box_members_see_scores" ON public.wod_scores;
CREATE POLICY "box_members_see_scores" ON public.wod_scores
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- 4. score_comments — box_members_comments
DROP POLICY IF EXISTS "box_members_comments" ON public.score_comments;
CREATE POLICY "box_members_comments" ON public.score_comments
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- 5. score_comments — member_post_comment
DROP POLICY IF EXISTS "member_post_comment" ON public.score_comments;
CREATE POLICY "member_post_comment" ON public.score_comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND box_id IN (SELECT public.get_user_box_ids())
  );

-- 6. messages — box_general_messages
DROP POLICY IF EXISTS "box_general_messages" ON public.messages;
CREATE POLICY "box_general_messages" ON public.messages
  FOR SELECT USING (
    (message_type = 'general' AND box_id IN (SELECT public.get_user_box_ids()))
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
  );

-- 7. events — member_see_events
DROP POLICY IF EXISTS "member_see_events" ON public.events;
CREATE POLICY "member_see_events" ON public.events
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- 8. competitions — member_see_competitions
DROP POLICY IF EXISTS "member_see_competitions" ON public.competitions;
CREATE POLICY "member_see_competitions" ON public.competitions
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260315_class_reservations.sql
-- ══════════════════════════════════════════════════════════════

-- 9. class_schedules — box_member_see_schedules
DROP POLICY IF EXISTS "box_member_see_schedules" ON public.class_schedules;
CREATE POLICY "box_member_see_schedules" ON public.class_schedules
  FOR SELECT USING (
    box_id IN (SELECT public.get_user_box_ids())
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- 10. class_reservations — box_member_see_reservations
DROP POLICY IF EXISTS "box_member_see_reservations" ON public.class_reservations;
CREATE POLICY "box_member_see_reservations" ON public.class_reservations
  FOR SELECT USING (
    box_id IN (SELECT public.get_user_box_ids())
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260316_schedule_templates.sql
-- ══════════════════════════════════════════════════════════════

-- 11. schedule_templates — member_read_templates
DROP POLICY IF EXISTS "member_read_templates" ON public.schedule_templates;
CREATE POLICY "member_read_templates" ON public.schedule_templates
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260317_membership_plans.sql
-- ══════════════════════════════════════════════════════════════

-- 12. membership_plans — member_see_plans
DROP POLICY IF EXISTS "member_see_plans" ON public.membership_plans;
CREATE POLICY "member_see_plans" ON public.membership_plans
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- 13. profiles — box_members_see_profiles (CRITICAL — caused recursion)
DROP POLICY IF EXISTS "box_members_see_profiles" ON public.profiles;
CREATE POLICY "box_members_see_profiles" ON public.profiles
  FOR SELECT USING (
    id IN (SELECT public.get_box_mate_ids())
    OR id = auth.uid()
  );

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260317_box_documents.sql
-- ══════════════════════════════════════════════════════════════

-- 14. box_documents — documents_member_read
DROP POLICY IF EXISTS "documents_member_read" ON public.box_documents;
CREATE POLICY "documents_member_read" ON public.box_documents
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      box_id IS NULL AND uploaded_by = auth.uid()
      OR box_id IN (SELECT public.get_user_box_ids())
      OR uploaded_by = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260320_fix_rls_policies.sql
-- ══════════════════════════════════════════════════════════════

-- 15. message_replies — box_member_read_replies
DROP POLICY IF EXISTS "box_member_read_replies" ON public.message_replies;
CREATE POLICY "box_member_read_replies" ON public.message_replies
  FOR SELECT USING (
    box_id IN (SELECT public.get_user_box_ids())
    OR box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- 16. event_registrations — member_see_event_registrations
DROP POLICY IF EXISTS "member_see_event_registrations" ON public.event_registrations;
CREATE POLICY "member_see_event_registrations" ON public.event_registrations
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events WHERE box_id IN (SELECT public.get_user_box_ids())
    )
  );

-- 17. competition_participants — member_see_comp_participants
DROP POLICY IF EXISTS "member_see_comp_participants" ON public.competition_participants;
CREATE POLICY "member_see_comp_participants" ON public.competition_participants
  FOR SELECT USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (SELECT public.get_user_box_ids())
    )
  );

-- 18. competition_scores — member_see_comp_scores
DROP POLICY IF EXISTS "member_see_comp_scores" ON public.competition_scores;
CREATE POLICY "member_see_comp_scores" ON public.competition_scores
  FOR SELECT USING (
    competition_id IN (
      SELECT id FROM competitions WHERE box_id IN (SELECT public.get_user_box_ids())
    )
  );

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260322_box_notifications.sql
-- ══════════════════════════════════════════════════════════════

-- 19. box_notifications — notif_member_read
DROP POLICY IF EXISTS "notif_member_read" ON public.box_notifications;
CREATE POLICY "notif_member_read" ON public.box_notifications
  FOR SELECT USING (
    public.is_box_member(box_id)
    AND (target = 'all' OR target = auth.uid()::text)
  );

-- ══════════════════════════════════════════════════════════════
-- POLICIES — 20260322_box_articles.sql
-- ══════════════════════════════════════════════════════════════

-- 20. box_articles — articles_member_read
DROP POLICY IF EXISTS "articles_member_read" ON public.box_articles;
CREATE POLICY "articles_member_read" ON public.box_articles
  FOR SELECT USING (box_id IN (SELECT public.get_user_box_ids()));

-- 21. box_article_comments — comments_member_read
DROP POLICY IF EXISTS "comments_member_read" ON public.box_article_comments;
CREATE POLICY "comments_member_read" ON public.box_article_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.box_articles a
      WHERE a.id = box_article_comments.article_id
        AND a.box_id IN (SELECT public.get_user_box_ids())
    )
  );

-- 22. box_article_likes — likes_member_read
DROP POLICY IF EXISTS "likes_member_read" ON public.box_article_likes;
CREATE POLICY "likes_member_read" ON public.box_article_likes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.box_articles a
      WHERE a.id = box_article_likes.article_id
        AND a.box_id IN (SELECT public.get_user_box_ids())
    )
  );

-- ══════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache
-- ══════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
