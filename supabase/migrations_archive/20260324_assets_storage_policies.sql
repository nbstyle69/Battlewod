-- ============================================================
-- Storage policies for "assets" bucket
-- ============================================================

-- Ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if any (avoid duplicates)
DROP POLICY IF EXISTS "assets_public_read" ON storage.objects;
DROP POLICY IF EXISTS "assets_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "assets_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "assets_admin_delete" ON storage.objects;

-- Public read: anyone can view assets
CREATE POLICY "assets_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'assets');

-- Admin insert: super_admin and admin can upload
CREATE POLICY "assets_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- Admin update
CREATE POLICY "assets_admin_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- Admin delete
CREATE POLICY "assets_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'assets'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

NOTIFY pgrst, 'reload schema';
