-- ============================================
-- PHYSICAL COMPETITIONS V2: mode qualification / info
-- ============================================

-- Add new columns to physical_competitions
ALTER TABLE public.physical_competitions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'qualification'
    CHECK (mode IN ('qualification', 'info')),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS registration_url text,
  ADD COLUMN IF NOT EXISTS format text DEFAULT 'individual'
    CHECK (format IN ('individual', 'team')),
  ADD COLUMN IF NOT EXISTS price text;

-- RLS policies (if not already set)
ALTER TABLE public.physical_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_wods ENABLE ROW LEVEL SECURITY;

-- Everyone can read competitions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_competitions_select' AND tablename = 'physical_competitions') THEN
    CREATE POLICY physical_competitions_select ON public.physical_competitions FOR SELECT USING (true);
  END IF;
END $$;

-- Only super_admin can insert/update/delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_competitions_insert' AND tablename = 'physical_competitions') THEN
    CREATE POLICY physical_competitions_insert ON public.physical_competitions FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_competitions_update' AND tablename = 'physical_competitions') THEN
    CREATE POLICY physical_competitions_update ON public.physical_competitions FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_competitions_delete' AND tablename = 'physical_competitions') THEN
    CREATE POLICY physical_competitions_delete ON public.physical_competitions FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;

-- Everyone can read WODs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_wods_select' AND tablename = 'physical_wods') THEN
    CREATE POLICY physical_wods_select ON public.physical_wods FOR SELECT USING (true);
  END IF;
END $$;

-- Only super_admin can manage WODs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_wods_insert' AND tablename = 'physical_wods') THEN
    CREATE POLICY physical_wods_insert ON public.physical_wods FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_wods_update' AND tablename = 'physical_wods') THEN
    CREATE POLICY physical_wods_update ON public.physical_wods FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'physical_wods_delete' AND tablename = 'physical_wods') THEN
    CREATE POLICY physical_wods_delete ON public.physical_wods FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );
  END IF;
END $$;
