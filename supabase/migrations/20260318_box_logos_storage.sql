-- ============================================================
-- Storage bucket for box logos
-- ============================================================

-- Create the bucket (public so logos are accessible via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('box-logos', 'box-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow box owners to upload/update their logo
CREATE POLICY "owner_upload_logo" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'box-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM boxes WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_logo" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'box-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM boxes WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_delete_logo" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'box-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM boxes WHERE owner_id = auth.uid()
    )
  );

-- Public read access (logos are visible to all members)
CREATE POLICY "public_read_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'box-logos');

NOTIFY pgrst, 'reload schema';
