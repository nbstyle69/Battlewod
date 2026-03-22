-- ============================================
-- BOX ARTICLES: actualités de la box
-- ============================================

CREATE TABLE IF NOT EXISTS public.box_articles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  box_id      uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.box_article_comments (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id  uuid NOT NULL REFERENCES public.box_articles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.box_article_likes (
  article_id  uuid NOT NULL REFERENCES public.box_articles(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

ALTER TABLE public.box_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_article_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_article_likes ENABLE ROW LEVEL SECURITY;

-- ── box_articles policies ──
CREATE POLICY "articles_owner_all"
  ON public.box_articles FOR ALL
  USING (is_box_owner(box_id));

CREATE POLICY "articles_member_read"
  ON public.box_articles FOR SELECT
  USING (box_id = get_user_box_id());

-- ── box_article_comments policies ──
CREATE POLICY "comments_member_read"
  ON public.box_article_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.box_articles a
      WHERE a.id = box_article_comments.article_id
        AND a.box_id = get_user_box_id()
    )
  );

CREATE POLICY "comments_member_insert"
  ON public.box_article_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "comments_own_delete"
  ON public.box_article_comments FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "comments_owner_delete"
  ON public.box_article_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.box_articles a
      WHERE a.id = box_article_comments.article_id
        AND is_box_owner(a.box_id)
    )
  );

-- ── box_article_likes policies ──
CREATE POLICY "likes_member_read"
  ON public.box_article_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.box_articles a
      WHERE a.id = box_article_likes.article_id
        AND a.box_id = get_user_box_id()
    )
  );

CREATE POLICY "likes_member_toggle"
  ON public.box_article_likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "likes_member_remove"
  ON public.box_article_likes FOR DELETE
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_articles_box ON public.box_articles(box_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_comments ON public.box_article_comments(article_id, created_at);
CREATE INDEX IF NOT EXISTS idx_article_likes ON public.box_article_likes(article_id);
