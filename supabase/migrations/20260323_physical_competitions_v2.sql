-- ============================================
-- PHYSICAL COMPETITIONS V2: mode qualification / info
-- ============================================

-- Create physical_competitions table (if not exists)
CREATE TABLE IF NOT EXISTS public.physical_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  date text,
  location text DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'closed')),
  mode text NOT NULL DEFAULT 'qualification' CHECK (mode IN ('qualification', 'info')),
  logo_url text,
  registration_url text,
  format text DEFAULT 'individual' CHECK (format IN ('individual', 'team')),
  price text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Create physical_wods table (if not exists)
CREATE TABLE IF NOT EXISTS public.physical_wods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.physical_competitions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  timer_type text NOT NULL DEFAULT 'for-time',
  total_seconds integer NOT NULL DEFAULT 900,
  max_time integer DEFAULT 0,
  interval_seconds integer DEFAULT 0,
  rounds integer DEFAULT 3,
  work_time integer DEFAULT 40,
  rest_time integer DEFAULT 20,
  with_camera boolean DEFAULT true,
  order_index integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- RLS
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
