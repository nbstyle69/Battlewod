-- ============================================================
-- Box Documents — PDF import & reading
-- ============================================================

-- 1. Table box_documents
CREATE TABLE IF NOT EXISTS box_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid REFERENCES boxes(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title       text NOT NULL,
  file_url    text NOT NULL,
  file_size   bigint DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Allow documents without a box (personal docs)
-- box_id can be NULL for users without a box

-- Index
CREATE INDEX IF NOT EXISTS idx_box_documents_box ON box_documents(box_id);
CREATE INDEX IF NOT EXISTS idx_box_documents_user ON box_documents(uploaded_by);

-- RLS
ALTER TABLE box_documents ENABLE ROW LEVEL SECURITY;

-- Members of the box can read all docs in their box
DROP POLICY IF EXISTS "read_box_documents" ON box_documents;
CREATE POLICY "read_box_documents" ON box_documents
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      box_id IS NULL AND uploaded_by = auth.uid()
      OR box_id IN (SELECT box_id FROM box_members WHERE member_id = auth.uid())
      OR uploaded_by = auth.uid()
    )
  );

-- Authenticated users can upload documents
DROP POLICY IF EXISTS "insert_box_documents" ON box_documents;
CREATE POLICY "insert_box_documents" ON box_documents
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);

-- Users can delete their own documents
DROP POLICY IF EXISTS "delete_own_documents" ON box_documents;
CREATE POLICY "delete_own_documents" ON box_documents
  FOR DELETE USING (auth.uid() = uploaded_by);

-- 2. Storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload
DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
CREATE POLICY "auth_upload_documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' AND auth.uid() IS NOT NULL
  );

-- Anyone can view documents (public bucket)
DROP POLICY IF EXISTS "public_read_documents" ON storage.objects;
CREATE POLICY "public_read_documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Users can delete their own uploads
DROP POLICY IF EXISTS "delete_own_doc_objects" ON storage.objects;
CREATE POLICY "delete_own_doc_objects" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' AND auth.uid() IS NOT NULL
  );
