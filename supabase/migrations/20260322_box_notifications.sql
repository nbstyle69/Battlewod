-- ============================================
-- BOX NOTIFICATIONS: custom notifs from box owner
-- ============================================

CREATE TABLE IF NOT EXISTS public.box_notifications (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  box_id      uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  target      text NOT NULL DEFAULT 'all', -- 'all' or a specific user_id
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.box_notifications ENABLE ROW LEVEL SECURITY;

-- Box owner can do everything on their box's notifications
CREATE POLICY "box_notifs_owner"
  ON public.box_notifications FOR ALL
  USING (is_box_owner(box_id));

-- Members can read notifications targeted to them or to 'all'
CREATE POLICY "box_notifs_member_read"
  ON public.box_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_members.box_id = box_notifications.box_id
        AND box_members.member_id = auth.uid()
        AND box_members.status = 'active'
    )
    AND (target = 'all' OR target = auth.uid()::text)
  );

CREATE INDEX IF NOT EXISTS idx_box_notifs_box ON public.box_notifications(box_id, created_at DESC);
