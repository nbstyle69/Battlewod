-- ============================================
-- WOD PUBLISH SCHEDULE: publication programmée
-- ============================================

-- Colonne publish_at sur box_wods (null = immédiat quand is_published=true)
ALTER TABLE public.box_wods ADD COLUMN IF NOT EXISTS publish_at timestamptz;

-- Colonnes settings sur boxes pour heures par défaut
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS daily_publish_hour int DEFAULT 6;
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS weekly_publish_day int DEFAULT 0;  -- 0=Dimanche
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS weekly_publish_hour int DEFAULT 18;

-- Mettre à jour la policy member_see_published pour respecter publish_at
DROP POLICY IF EXISTS "member_see_published" ON public.box_wods;
CREATE POLICY "member_see_published" ON public.box_wods
  FOR SELECT USING (
    box_id = get_user_box_id()
    AND is_published = true
    AND (publish_at IS NULL OR publish_at <= now())
  );
