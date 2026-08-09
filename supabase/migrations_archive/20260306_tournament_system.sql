-- ============================================================
-- BattleWOD – Tournament System Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. tournament_wods ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_wods (
  id               uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id    uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  order_index      integer     NOT NULL DEFAULT 0,
  title            text        NOT NULL,
  description      text,
  type             text        NOT NULL CHECK (type IN ('AMRAP','For Time','EMOM','Tabata','Max Reps','Strength')),
  duration_minutes integer     NOT NULL DEFAULT 10,
  movements        jsonb       NOT NULL DEFAULT '[]',
  scoring          text        NOT NULL DEFAULT 'Voir description',
  deadline_hours   integer     NOT NULL DEFAULT 24,
  opens_at         timestamptz,
  closes_at        timestamptz,
  status           text        NOT NULL CHECK (status IN ('pending','active','closed')) DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_wods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_wods_public_read"  ON public.tournament_wods
  FOR SELECT USING (true);

CREATE POLICY "tournament_wods_admin_all"    ON public.tournament_wods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

-- 2. tournament_scores ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_scores (
  id                 uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id      uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tournament_wod_id  uuid        NOT NULL REFERENCES public.tournament_wods(id) ON DELETE CASCADE,
  athlete_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score_value        text        NOT NULL,
  tiebreak_value     numeric,
  video_url          text,
  notes              text,
  status             text        NOT NULL CHECK (status IN ('pending','validated','rejected')) DEFAULT 'pending',
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  deadline_at        timestamptz,
  validated_by       uuid        REFERENCES public.profiles(id),
  validated_at       timestamptz,
  ai_analysis        text,
  elo_points         integer     NOT NULL DEFAULT 0,
  UNIQUE (tournament_wod_id, athlete_id)
);

ALTER TABLE public.tournament_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament_scores_owner_or_admin_read" ON public.tournament_scores
  FOR SELECT USING (
    auth.uid() = athlete_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

CREATE POLICY "tournament_scores_owner_insert" ON public.tournament_scores
  FOR INSERT WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "tournament_scores_owner_update_pending" ON public.tournament_scores
  FOR UPDATE USING (
    (auth.uid() = athlete_id AND status = 'pending') OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

-- 3. tournament_elo_history ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tournament_elo_history (
  id                  uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id       uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  athlete_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  final_rank          integer     NOT NULL,
  participants_count  integer     NOT NULL,
  avg_opponent_elo    integer     NOT NULL,
  elo_before          integer     NOT NULL,
  elo_after           integer     NOT NULL,
  elo_change          integer     NOT NULL,
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, athlete_id)
);

ALTER TABLE public.tournament_elo_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elo_history_owner_or_admin" ON public.tournament_elo_history
  FOR SELECT USING (
    auth.uid() = athlete_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

CREATE POLICY "elo_history_admin_write" ON public.tournament_elo_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

-- 4. movement_rep_counts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movement_rep_counts (
  id             uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  athlete_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_key   text        NOT NULL,
  movement_label text        NOT NULL,
  total_reps     integer     NOT NULL DEFAULT 0,
  last_updated   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, movement_key)
);

ALTER TABLE public.movement_rep_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movement_reps_owner_or_admin_read" ON public.movement_rep_counts
  FOR SELECT USING (
    auth.uid() = athlete_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

CREATE POLICY "movement_reps_admin_write" ON public.movement_rep_counts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

-- 5. athlete_badges (create if not exists) ───────────────────
CREATE TABLE IF NOT EXISTS public.athlete_badges (
  id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  athlete_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key   text        NOT NULL,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, badge_key)
);

ALTER TABLE public.athlete_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "badges_public_read" ON public.athlete_badges
  FOR SELECT USING (true);

CREATE POLICY "badges_admin_write" ON public.athlete_badges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner'))
  );

-- 6. tournament_participants score column ────────────────────
-- Add score column to tournament_participants if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'score'
  ) THEN
    ALTER TABLE public.tournament_participants ADD COLUMN score integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 7. Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournament_wods_tournament_id    ON public.tournament_wods(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_scores_tournament_id  ON public.tournament_scores(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_scores_athlete_id     ON public.tournament_scores(athlete_id);
CREATE INDEX IF NOT EXISTS idx_tournament_scores_wod_id         ON public.tournament_scores(tournament_wod_id);
CREATE INDEX IF NOT EXISTS idx_tournament_scores_status         ON public.tournament_scores(status);
CREATE INDEX IF NOT EXISTS idx_elo_history_tournament_id        ON public.tournament_elo_history(tournament_id);
CREATE INDEX IF NOT EXISTS idx_movement_reps_athlete_id         ON public.movement_rep_counts(athlete_id);
CREATE INDEX IF NOT EXISTS idx_athlete_badges_athlete_id        ON public.athlete_badges(athlete_id);
