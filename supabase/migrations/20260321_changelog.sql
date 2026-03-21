-- ============================================
-- CHANGELOG: app_changelog + changelog_reads
-- ============================================

-- 1. Table des entrées changelog ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_changelog (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  type       text NOT NULL DEFAULT 'update' CHECK (type IN ('fix', 'feature', 'update')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.app_changelog ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire
CREATE POLICY "changelog_public_read"
  ON public.app_changelog FOR SELECT USING (true);

-- Seul le créateur (super_admin) peut insérer/modifier/supprimer
CREATE POLICY "changelog_admin_write"
  ON public.app_changelog FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 2. Table de lecture (lu/non lu) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.changelog_reads (
  user_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  changelog_id uuid REFERENCES public.app_changelog(id) ON DELETE CASCADE,
  read_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, changelog_id)
);

ALTER TABLE public.changelog_reads ENABLE ROW LEVEL SECURITY;

-- Chaque user peut lire/écrire ses propres reads
CREATE POLICY "changelog_reads_own"
  ON public.changelog_reads FOR ALL
  USING (user_id = auth.uid());

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON public.app_changelog (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_reads_user ON public.changelog_reads (user_id);
