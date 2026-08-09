-- ═══════════════════════════════════════════════════════════════════════
-- daily_tournaments: mini-tournois flash quotidiens (max 5 participants)
-- daily_tournament_participants: inscriptions
-- daily_tournament_scores: scores soumis
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_tournaments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wod_name      text NOT NULL,
  wod_type      text NOT NULL,                     -- 'For Time','AMRAP','EMOM',...
  duration      int NOT NULL DEFAULT 0,            -- minutes
  level         text NOT NULL DEFAULT 'rx',
  movements     text NOT NULL,                     -- contenu du WOD
  scoring       text,
  score_mode    text NOT NULL DEFAULT 'time',      -- 'time','reps','rounds','weight'
  max_players   int NOT NULL DEFAULT 5,
  status        text NOT NULL DEFAULT 'open',      -- 'open','active','completed','cancelled'
  elo_reward    int NOT NULL DEFAULT 25,           -- points ELO pour le gagnant
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_daily_t_status    ON daily_tournaments(status);
CREATE INDEX idx_daily_t_ends      ON daily_tournaments(ends_at);
CREATE INDEX idx_daily_t_creator   ON daily_tournaments(creator_id);

-- ── Participants ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_tournament_participants (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id   uuid NOT NULL REFERENCES daily_tournaments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       timestamptz DEFAULT now(),

  UNIQUE(tournament_id, user_id)
);

CREATE INDEX idx_dtp_tournament ON daily_tournament_participants(tournament_id);
CREATE INDEX idx_dtp_user       ON daily_tournament_participants(user_id);

-- ── Scores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_tournament_scores (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id   uuid NOT NULL REFERENCES daily_tournaments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_value     numeric NOT NULL,
  rx              boolean DEFAULT true,
  notes           text,
  submitted_at    timestamptz DEFAULT now(),

  UNIQUE(tournament_id, user_id)
);

CREATE INDEX idx_dts_tournament ON daily_tournament_scores(tournament_id);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE daily_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tournament_scores ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut voir les tournois ouverts/actifs
CREATE POLICY "Anyone can view daily tournaments"
  ON daily_tournaments FOR SELECT USING (true);

CREATE POLICY "Authenticated users create daily tournaments"
  ON daily_tournaments FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creator can update own tournament"
  ON daily_tournaments FOR UPDATE
  USING (auth.uid() = creator_id);

-- Participants
CREATE POLICY "Anyone can view participants"
  ON daily_tournament_participants FOR SELECT USING (true);

CREATE POLICY "Users join tournaments"
  ON daily_tournament_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users leave tournaments"
  ON daily_tournament_participants FOR DELETE
  USING (auth.uid() = user_id);

-- Scores
CREATE POLICY "Anyone can view scores"
  ON daily_tournament_scores FOR SELECT USING (true);

CREATE POLICY "Users submit own scores"
  ON daily_tournament_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scores"
  ON daily_tournament_scores FOR UPDATE
  USING (auth.uid() = user_id);
