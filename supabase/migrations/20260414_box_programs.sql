-- ═══════════════════════════════════════════════════════════════
-- AthleX — slug sur boxes + table box_programs
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Ajouter slug unique sur boxes ─────────────────────────
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS slug text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_boxes_slug ON boxes(slug) WHERE slug IS NOT NULL;

-- ── 2. Générer un slug par défaut pour les boxes existantes ──
DO $$
DECLARE
  r RECORD;
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  FOR r IN SELECT id, name FROM boxes WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := LOWER(REGEXP_REPLACE(REPLACE(r.name, ' ', '-'), '[^a-z0-9\-]', '', 'g'));
    -- Trim trailing dashes
    base_slug := REGEXP_REPLACE(base_slug, '-+$', '');
    IF base_slug = '' THEN base_slug := 'box'; END IF;
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM boxes WHERE slug = final_slug AND id <> r.id) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    UPDATE boxes SET slug = final_slug WHERE id = r.id;
  END LOOP;
END $$;

-- ── 3. Table box_programs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS box_programs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  price         numeric(10,2),
  currency      text NOT NULL DEFAULT 'EUR',
  url           text NOT NULL,
  image_url     text,
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_box_programs_box ON box_programs(box_id, is_active, sort_order);

-- ── 4. RLS box_programs ──────────────────────────────────────
ALTER TABLE box_programs ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les programmes actifs
CREATE POLICY "anyone_read_active_box_programs"
  ON box_programs FOR SELECT
  USING (is_active = true);

-- Le owner de la box peut gérer ses programmes
CREATE POLICY "box_owner_manage_programs"
  ON box_programs FOR ALL
  USING (
    box_id IN (SELECT id FROM boxes WHERE owner_id = auth.uid())
  );

-- Super admin peut tout gérer
CREATE POLICY "admin_manage_box_programs"
  ON box_programs FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin')
    )
  );

-- ── 5. Storage bucket pour images programmes ─────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('box-program-images', 'box-program-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anyone_read_box_program_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'box-program-images');

CREATE POLICY "box_owner_upload_program_images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'box-program-images'
    AND auth.uid() IN (SELECT owner_id FROM boxes WHERE is_active = true)
  );

CREATE POLICY "box_owner_delete_program_images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'box-program-images'
    AND auth.uid() IN (SELECT owner_id FROM boxes WHERE is_active = true)
  );
