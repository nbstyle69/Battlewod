-- ═══════════════════════════════════════════════════════════════
-- AthleX — Table partners (marques / sponsors)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS partners (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  logo_url          text,
  description       text,
  website_url       text,
  instagram_url     text,
  offer_title       text,
  offer_description text,
  offer_code        text,
  category          text DEFAULT 'other'
                    CHECK (category IN (
                      'nutrition','equipment','apparel','supplements',
                      'recovery','coaching','software','other'
                    )),
  is_active         boolean DEFAULT true,
  sort_order        int DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_partners_category ON partners(category);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- Everyone can read active partners
CREATE POLICY "anyone_read_active_partners"
  ON partners FOR SELECT
  USING (is_active = true);

-- Only super_admin / admin can manage partners
CREATE POLICY "admin_manage_partners"
  ON partners FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('super_admin', 'admin')
    )
  );

-- ── Storage bucket for partner logos ──────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('partner-logos', 'partner-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "admin_upload_partner_logo" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'partner-logos' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "admin_update_partner_logo" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'partner-logos' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "admin_delete_partner_logo" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'partner-logos' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "public_read_partner_logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'partner-logos');

-- ── RLS boxes: allow anyone authenticated to read listed boxes ──
CREATE POLICY "anyone_read_listed_boxes"
  ON boxes FOR SELECT
  USING (is_listed = true);

NOTIFY pgrst, 'reload schema';
