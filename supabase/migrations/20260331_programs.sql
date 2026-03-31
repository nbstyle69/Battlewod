-- ============================================================
-- Drop old tables if they exist (old schema without affiliate_id)
-- ============================================================
DROP TABLE IF EXISTS public.programs CASCADE;
DROP TABLE IF EXISTS public.program_affiliates CASCADE;

-- ============================================================
-- Table: program_affiliates — programmeurs / affiliés
-- ============================================================

CREATE TABLE public.program_affiliates (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  logo_url    text,
  category    text NOT NULL DEFAULT 'functional',   -- 'functional' | 'hybrid'
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_active_order ON public.program_affiliates (is_active, sort_order);

ALTER TABLE public.program_affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliates_read" ON public.program_affiliates FOR SELECT USING (true);
CREATE POLICY "affiliates_insert" ON public.program_affiliates FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "affiliates_update" ON public.program_affiliates FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "affiliates_delete" ON public.program_affiliates FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================
-- Table: programs — programmes en vente par affilié
-- ============================================================

CREATE TABLE public.programs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id  uuid NOT NULL REFERENCES public.program_affiliates(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  price         numeric(10,2),
  currency      text NOT NULL DEFAULT 'EUR',
  url           text NOT NULL,
  image_url     text,
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_affiliate ON public.programs (affiliate_id, is_active, sort_order);

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "programs_read" ON public.programs FOR SELECT USING (true);
CREATE POLICY "programs_insert" ON public.programs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "programs_update" ON public.programs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "programs_delete" ON public.programs FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================
-- Seed affiliates
-- ============================================================
INSERT INTO public.program_affiliates (id, name, category, description, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'HWPO',                'functional', 'Par Mat Fraser — Programming élite',          1),
  ('a0000000-0000-0000-0000-000000000002', 'Mayhem',              'functional', 'Rich Froning — Compétition & fitness',        2),
  ('a0000000-0000-0000-0000-000000000003', 'CompTrain',           'functional', 'Ben Bergeron — Méthodologie complète',         3),
  ('a0000000-0000-0000-0000-000000000004', 'PRVN Fitness',        'functional', 'Par CJ Martin — Programming avancée',         4),
  ('a0000000-0000-0000-0000-000000000005', 'Brute Strength',      'functional', 'Force & conditioning hybride',                 5),
  ('a0000000-0000-0000-0000-000000000006', 'FitProcess',          'functional', 'Programming française — Tous niveaux',         6),
  ('a0000000-0000-0000-0000-000000000007', 'EMF Performance',     'functional', 'Méthodologie européenne',                      7),
  ('a0000000-0000-0000-0000-000000000008', 'HYROX Training Club', 'hybrid',     'Programme officiel HYROX',                     8),
  ('a0000000-0000-0000-0000-000000000009', 'The Progrm',          'hybrid',     'Hybrid & endurance training',                  9),
  ('a0000000-0000-0000-0000-000000000010', 'Hybrid Performance',  'hybrid',     'Force + cardio — Méthode hybride',            10);

-- Seed programs (examples)
INSERT INTO public.programs (affiliate_id, name, description, price, url, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'HWPO Flagship',      'Le programme complet de Mat Fraser',                  49.99, 'https://www.hwpotraining.com',                    1),
  ('a0000000-0000-0000-0000-000000000001', 'HWPO Strength',      'Focus force & powerlifting',                          39.99, 'https://www.hwpotraining.com',                    2),
  ('a0000000-0000-0000-0000-000000000002', 'Mayhem Compete',     'Programme compétiteurs par Rich Froning',             44.99, 'https://www.crossfitmayhem.com/pages/programming', 1),
  ('a0000000-0000-0000-0000-000000000002', 'Mayhem Fitness',     'Programmation fitness quotidienne',                   29.99, 'https://www.crossfitmayhem.com/pages/programming', 2),
  ('a0000000-0000-0000-0000-000000000003', 'CompTrain Individual','Programmation individuelle Ben Bergeron',             34.99, 'https://comptrain.co',                             1),
  ('a0000000-0000-0000-0000-000000000004', 'PRVN Pro',           'Programming avancée CJ Martin',                       44.99, 'https://prvnfitness.com',                          1),
  ('a0000000-0000-0000-0000-000000000005', 'Brute Complete',     'Force & conditioning hybride',                        39.99, 'https://brutestrength.co',                         1),
  ('a0000000-0000-0000-0000-000000000006', 'FitProcess All',     'Tous niveaux — programmation française',              24.99, 'https://fitprocess.fr',                            1),
  ('a0000000-0000-0000-0000-000000000007', 'EMF Standard',       'Méthodologie européenne standard',                    29.99, 'https://emfperformance.com',                       1),
  ('a0000000-0000-0000-0000-000000000008', 'HYROX Race Prep',    'Préparation course HYROX officielle',                 34.99, 'https://hyrox.com/training',                       1),
  ('a0000000-0000-0000-0000-000000000009', 'The Progrm Hybrid',  'Hybrid & endurance training',                         39.99, 'https://theprogrm.com',                            1),
  ('a0000000-0000-0000-0000-000000000010', 'Hybrid Method',      'Force + cardio — méthode hybride complète',           44.99, 'https://hybridperformancemethod.com',              1);
