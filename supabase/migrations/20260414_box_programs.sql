-- ═══════════════════════════════════════════════════════════════
-- AthleX — Programmes payants (marketplace Stripe Connect)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Slug unique sur boxes (inchangé) ──────────────────────
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS slug text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_boxes_slug ON boxes(slug) WHERE slug IS NOT NULL;

DO $$
DECLARE r RECORD; base_slug text; final_slug text; counter int;
BEGIN
  FOR r IN SELECT id, name FROM boxes WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := LOWER(REGEXP_REPLACE(REPLACE(r.name, ' ', '-'), '[^a-z0-9\-]', '', 'g'));
    base_slug := REGEXP_REPLACE(base_slug, '-+$', '');
    IF base_slug = '' THEN base_slug := 'box'; END IF;
    final_slug := base_slug; counter := 1;
    WHILE EXISTS (SELECT 1 FROM boxes WHERE slug = final_slug AND id <> r.id) LOOP
      counter := counter + 1; final_slug := base_slug || '-' || counter;
    END LOOP;
    UPDATE boxes SET slug = final_slug WHERE id = r.id;
  END LOOP;
END $$;

-- ── 2. Stripe Connect sur boxes ──────────────────────────────
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS stripe_account_id text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false;

-- ── 3. Table programmes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES auth.users(id),
  title           text NOT NULL,
  description     text,
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  currency        text NOT NULL DEFAULT 'eur',
  type            text NOT NULL CHECK (type IN ('fixed','ongoing')),
  duration_weeks  integer,
  days_per_week   integer DEFAULT 5,
  invite_code     text UNIQUE NOT NULL,
  stripe_price_id text,
  image_url       text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_box  ON programs(box_id, is_active);
CREATE INDEX IF NOT EXISTS idx_programs_code ON programs(invite_code);

-- ── 4. WODs d'un programme ───────────────────────────────────
CREATE TABLE IF NOT EXISTS program_wods (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  day_number       integer,
  scheduled_date   date,
  week_number      integer,
  title            text NOT NULL,
  description      text NOT NULL,
  wod_type         text DEFAULT 'custom',
  scoring_type     text,
  time_cap_seconds integer,
  notes            text,
  sort_order       integer DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT day_or_date CHECK (day_number IS NOT NULL OR scheduled_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pw_prog ON program_wods(program_id, day_number);
CREATE INDEX IF NOT EXISTS idx_pw_date ON program_wods(program_id, scheduled_date);

-- ── 5. Membres d'un programme (acheteurs) ────────────────────
CREATE TABLE IF NOT EXISTS program_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id            uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  start_date            date NOT NULL,
  stripe_payment_intent text,
  amount_cents          integer,
  platform_fee_cents    integer,
  status                text DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','refunded')),
  purchased_at          timestamptz DEFAULT now(),
  UNIQUE(program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_user ON program_members(user_id, status);

-- ── 6. Scores sur WODs programme ─────────────────────────────
CREATE TABLE IF NOT EXISTS program_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_wod_id  uuid NOT NULL REFERENCES program_wods(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  score_type      text NOT NULL DEFAULT 'reps',
  score_value     integer NOT NULL,
  rx              boolean DEFAULT false,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(program_wod_id, user_id)
);

-- ── 7. RLS ───────────────────────────────────────────────────
ALTER TABLE programs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_wods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_scores  ENABLE ROW LEVEL SECURITY;

-- programs
DROP POLICY IF EXISTS "read_active_programs"  ON programs;
CREATE POLICY "read_active_programs"  ON programs FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "owner_manage_programs" ON programs;
CREATE POLICY "owner_manage_programs" ON programs FOR ALL   USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "admin_manage_programs" ON programs;
CREATE POLICY "admin_manage_programs" ON programs FOR ALL   USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('super_admin','admin'))
);

-- program_wods
DROP POLICY IF EXISTS "member_read_program_wods" ON program_wods;
CREATE POLICY "member_read_program_wods" ON program_wods FOR SELECT USING (
  program_id IN (SELECT program_id FROM program_members WHERE user_id = auth.uid() AND status = 'active')
  OR program_id IN (SELECT id FROM programs WHERE owner_id = auth.uid())
);
DROP POLICY IF EXISTS "owner_manage_program_wods" ON program_wods;
CREATE POLICY "owner_manage_program_wods" ON program_wods FOR ALL USING (
  program_id IN (SELECT id FROM programs WHERE owner_id = auth.uid())
);
DROP POLICY IF EXISTS "admin_manage_program_wods" ON program_wods;
CREATE POLICY "admin_manage_program_wods" ON program_wods FOR ALL USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('super_admin','admin'))
);

-- program_members
DROP POLICY IF EXISTS "read_own_membership"       ON program_members;
CREATE POLICY "read_own_membership"       ON program_members FOR SELECT USING (
  user_id = auth.uid()
  OR program_id IN (SELECT id FROM programs WHERE owner_id = auth.uid())
);
DROP POLICY IF EXISTS "member_join_program"       ON program_members;
CREATE POLICY "member_join_program"       ON program_members FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "owner_manage_pm"           ON program_members;
CREATE POLICY "owner_manage_pm"           ON program_members FOR ALL    USING (
  program_id IN (SELECT id FROM programs WHERE owner_id = auth.uid())
);
DROP POLICY IF EXISTS "admin_manage_pm"           ON program_members;
CREATE POLICY "admin_manage_pm"           ON program_members FOR ALL    USING (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('super_admin','admin'))
);

-- program_scores
DROP POLICY IF EXISTS "read_program_scores" ON program_scores;
CREATE POLICY "read_program_scores" ON program_scores FOR SELECT USING (
  program_wod_id IN (
    SELECT pw.id FROM program_wods pw
    JOIN program_members pm ON pm.program_id = pw.program_id
    WHERE pm.user_id = auth.uid() AND pm.status = 'active'
  )
  OR program_wod_id IN (
    SELECT pw.id FROM program_wods pw
    JOIN programs p ON p.id = pw.program_id WHERE p.owner_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "upsert_own_program_score" ON program_scores;
CREATE POLICY "upsert_own_program_score" ON program_scores FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "update_own_program_score" ON program_scores;
CREATE POLICY "update_own_program_score" ON program_scores FOR UPDATE USING  (user_id = auth.uid());

-- ── 8. Storage bucket ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('program-images', 'program-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anyone_read_prog_images" ON storage.objects;
CREATE POLICY "anyone_read_prog_images" ON storage.objects FOR SELECT
  USING (bucket_id = 'program-images');
DROP POLICY IF EXISTS "owner_upload_prog_images" ON storage.objects;
CREATE POLICY "owner_upload_prog_images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'program-images' AND auth.uid() IN (SELECT owner_id FROM boxes WHERE is_active = true));
DROP POLICY IF EXISTS "owner_delete_prog_images" ON storage.objects;
CREATE POLICY "owner_delete_prog_images" ON storage.objects FOR DELETE
  USING (bucket_id = 'program-images' AND auth.uid() IN (SELECT owner_id FROM boxes WHERE is_active = true));

