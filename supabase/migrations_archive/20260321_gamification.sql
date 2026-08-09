-- ============================================
-- GAMIFICATION: badges_catalog + athlete_streaks
-- ============================================

-- 1. Catalogue de badges ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges_catalog (
  badge_key   text PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL,
  icon        text NOT NULL DEFAULT '🏅',
  category    text NOT NULL DEFAULT 'activity',
  sort_order  int  NOT NULL DEFAULT 0
);

ALTER TABLE public.badges_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_catalog_public_read" ON public.badges_catalog FOR SELECT USING (true);

-- Seed badges ────────────────────────────────────────────────────────
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  -- Activité (semaines actives consécutives, 3+ sessions/semaine)
  ('streak_1w',   'Première flamme',  '1 semaine active (3+ sessions)',          '🔥', 'activity', 10),
  ('streak_3w',   'En feu',           '3 semaines actives consécutives',         '🔥', 'activity', 11),
  ('streak_8w',   'Régulier',         '8 semaines actives consécutives (~2 mois)', '🔥', 'activity', 12),
  ('streak_16w',  'Inarrêtable',      '16 semaines consécutives (~4 mois)',      '💪', 'activity', 13),
  ('streak_26w',  'Machine',          '26 semaines consécutives (~6 mois)',      '🏛️', 'activity', 14),

  -- Tournois
  ('first_win',       'Première victoire', 'Top 1 d''un tournoi',             '🏆', 'tournament', 20),
  ('podium',          'Podium',            'Top 3 d''un tournoi',             '🥉', 'tournament', 21),
  ('veteran_10',      'Vétéran',           '10 tournois complétés',           '⚔️', 'tournament', 22),
  ('champion_5',      'Champion',          '5 victoires en tournoi',          '🏅', 'tournament', 23),

  -- Social
  ('social_5',        'Social',            '5 amis ajoutés',                  '👥', 'social', 30),
  ('chatty_50',       'Bavard',            '50 messages envoyés',             '💬', 'social', 31),

  -- WOD
  ('wod_gen_100',     'Générateur fou',    '100 WODs générés',                '🏋️', 'wod', 40),
  ('timer_50',        'Chronomètre',       '50 sessions timer complétées',    '⏱️', 'wod', 41),
  ('first_score',     'Premier pas',       '1er score soumis',                '✅', 'wod', 42),

  -- ELO
  ('elo_1200',        'Rising Star',       'Atteindre 1200 ELO',             '📈', 'elo', 50),
  ('elo_1500',        'Diamant',           'Atteindre 1500 ELO',             '💎', 'elo', 51),
  ('elo_2000',        'Légende',           'Atteindre 2000 ELO',             '👑', 'elo', 52)

ON CONFLICT (badge_key) DO NOTHING;

-- 2. Streaks (semaines actives) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.athlete_streaks (
  athlete_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak    int  NOT NULL DEFAULT 0,
  longest_streak    int  NOT NULL DEFAULT 0,
  week_session_count int NOT NULL DEFAULT 0,
  week_start        date NOT NULL DEFAULT date_trunc('week', now())::date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.athlete_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "streaks_read_own" ON public.athlete_streaks FOR SELECT USING (auth.uid() = athlete_id);
CREATE POLICY "streaks_write_own" ON public.athlete_streaks FOR ALL USING (auth.uid() = athlete_id);

CREATE INDEX IF NOT EXISTS idx_streaks_athlete ON public.athlete_streaks(athlete_id);

-- 3. Compteurs d'activité pour badges cumulatifs ─────────────────────
-- On ajoute des colonnes compteur au profil existant
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_scores_submitted int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wods_generated   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_timer_sessions   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_messages_sent    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tournaments      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tournament_wins  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_friends          int NOT NULL DEFAULT 0;

-- 4. Ajouter foreign key sur athlete_badges → badges_catalog ─────────
-- (pas de FK stricte pour ne pas casser les badges existants, mais on ajoute un index)
CREATE INDEX IF NOT EXISTS idx_athlete_badges_key ON public.athlete_badges(badge_key);
