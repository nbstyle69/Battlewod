-- ============================================================
-- UGC Moderation : reports + user blocks
-- Required for Apple App Store Guideline 1.2 (UGC safety)
-- ============================================================

-- =============== REPORTS ====================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('video', 'message', 'profile', 'comment', 'score', 'box')),
  content_id uuid,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'hate', 'cheating', 'nudity', 'violence', 'other')),
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports(created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own reports
DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Users can read their own reports
DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

-- Super admins can read all + update (for moderation)
DROP POLICY IF EXISTS "reports_admin_all" ON public.reports;
CREATE POLICY "reports_admin_all" ON public.reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));


-- =============== USER BLOCKS ================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can manage their own blocks
DROP POLICY IF EXISTS "user_blocks_own" ON public.user_blocks;
CREATE POLICY "user_blocks_own" ON public.user_blocks
  FOR ALL TO authenticated
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- Blocked users can see they are blocked (needed for filtering in client)
DROP POLICY IF EXISTS "user_blocks_select_blocked" ON public.user_blocks;
CREATE POLICY "user_blocks_select_blocked" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocked_id);


-- =============== HELPER : is_blocked_pair ===================
CREATE OR REPLACE FUNCTION public.is_blocked_pair(u1 uuid, u2 uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = u1 AND blocked_id = u2)
       OR (blocker_id = u2 AND blocked_id = u1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated;


-- =============== RPC : report_content =======================
-- Convenience RPC so the client doesn't need to know the table schema.
CREATE OR REPLACE FUNCTION public.report_content(
  p_content_type text,
  p_content_id uuid,
  p_reported_user_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  INSERT INTO public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details)
  VALUES (auth.uid(), p_reported_user_id, p_content_type, p_content_id, p_reason, p_details)
  RETURNING id INTO v_report_id;
  RETURN v_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_content(text, uuid, uuid, text, text) TO authenticated;
