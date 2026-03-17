-- ============================================================
-- Inter-box Competitions
-- ============================================================

-- 1. COMPETITIONS
CREATE TABLE IF NOT EXISTS inter_competitions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  description      text,
  format           text NOT NULL DEFAULT 'league' CHECK (format IN ('league','bracket','pool','swiss')),
  type             text NOT NULL DEFAULT 'individual' CHECK (type IN ('individual','team')),
  team_size        int  NOT NULL DEFAULT 1 CHECK (team_size BETWEEN 1 AND 5),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','active','closed')),
  registration_open_at  timestamptz,
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_participants int,
  banner_url       text,
  rules            text,
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE inter_competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_competitions" ON inter_competitions;
CREATE POLICY "super_admin_manage_competitions" ON inter_competitions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "anyone_can_view_competitions" ON inter_competitions;
CREATE POLICY "anyone_can_view_competitions" ON inter_competitions
  FOR SELECT USING (status != 'draft' OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin')
  ));

-- ============================================================
-- 2. COMPETITION WODs
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_competition_wods (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES inter_competitions(id) ON DELETE CASCADE,
  title          text NOT NULL,
  description    text,
  order_index    int  NOT NULL DEFAULT 1,
  time_cap       int,                          -- minutes
  scoring_type   text DEFAULT 'reps' CHECK (scoring_type IN ('reps','time','weight','rounds_reps')),
  revealed_at    timestamptz,                  -- NULL = not revealed yet
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE inter_competition_wods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_wods" ON inter_competition_wods;
CREATE POLICY "super_admin_manage_wods" ON inter_competition_wods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "anyone_can_view_revealed_wods" ON inter_competition_wods;
CREATE POLICY "anyone_can_view_revealed_wods" ON inter_competition_wods
  FOR SELECT USING (
    revealed_at IS NOT NULL AND revealed_at <= now()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

-- ============================================================
-- 3. TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES inter_competitions(id) ON DELETE CASCADE,
  name           text NOT NULL,
  captain_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  box_id         uuid REFERENCES boxes(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'forming' CHECK (status IN ('forming','ready','disqualified')),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE inter_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_view_teams" ON inter_teams;
CREATE POLICY "anyone_can_view_teams" ON inter_teams
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "captain_manage_team" ON inter_teams;
CREATE POLICY "captain_manage_team" ON inter_teams
  FOR ALL USING (captain_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

-- ============================================================
-- 4. TEAM MEMBERS & INVITATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid REFERENCES inter_teams(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  invited_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  UNIQUE(team_id, user_id)
);

ALTER TABLE inter_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view_own_invitations" ON inter_team_members;
CREATE POLICY "view_own_invitations" ON inter_team_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "captain_invite_members" ON inter_team_members;
CREATE POLICY "captain_invite_members" ON inter_team_members
  FOR INSERT WITH CHECK (
    team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid())
  );

DROP POLICY IF EXISTS "member_answer_invitation" ON inter_team_members;
CREATE POLICY "member_answer_invitation" ON inter_team_members
  FOR UPDATE USING (user_id = auth.uid()
    OR team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "captain_or_admin_delete_member" ON inter_team_members;
CREATE POLICY "captain_or_admin_delete_member" ON inter_team_members
  FOR DELETE USING (
    team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

-- ============================================================
-- 5. REGISTRATIONS (individual OR team)
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES inter_competitions(id) ON DELETE CASCADE,
  athlete_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,   -- NULL if team
  team_id        uuid REFERENCES inter_teams(id) ON DELETE CASCADE, -- NULL if individual
  box_id         uuid REFERENCES boxes(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disqualified','withdrawn')),
  registered_at  timestamptz DEFAULT now(),
  UNIQUE(competition_id, athlete_id),
  UNIQUE(competition_id, team_id)
);

ALTER TABLE inter_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_view_registrations" ON inter_registrations;
CREATE POLICY "anyone_can_view_registrations" ON inter_registrations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "athlete_register_self" ON inter_registrations;
CREATE POLICY "athlete_register_self" ON inter_registrations
  FOR INSERT WITH CHECK (athlete_id = auth.uid()
    OR team_id IN (SELECT id FROM inter_teams WHERE captain_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_manage_registrations" ON inter_registrations;
CREATE POLICY "admin_manage_registrations" ON inter_registrations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

-- ============================================================
-- 6. SCORES
-- ============================================================
CREATE TABLE IF NOT EXISTS inter_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES inter_competitions(id) ON DELETE CASCADE,
  wod_id         uuid REFERENCES inter_competition_wods(id) ON DELETE CASCADE,
  athlete_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  team_id        uuid REFERENCES inter_teams(id) ON DELETE CASCADE,
  score_value    numeric,
  score_display  text,                   -- ex: "12 rds + 5 reps"
  video_url      text,                   -- YouTube link
  video_local_uri text,                  -- local URI avant upload
  notes          text,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','validated','rejected')),
  rejection_reason text,
  reviewed_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  submitted_at   timestamptz DEFAULT now()
);

ALTER TABLE inter_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "athlete_submit_score" ON inter_scores;
CREATE POLICY "athlete_submit_score" ON inter_scores
  FOR INSERT WITH CHECK (athlete_id = auth.uid()
    OR team_id IN (
      SELECT itm.team_id FROM inter_team_members itm
      WHERE itm.user_id = auth.uid() AND itm.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "athlete_view_own_score" ON inter_scores;
CREATE POLICY "athlete_view_own_score" ON inter_scores
  FOR SELECT USING (
    athlete_id = auth.uid()
    OR team_id IN (
      SELECT itm.team_id FROM inter_team_members itm WHERE itm.user_id = auth.uid()
    )
    OR status = 'validated'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "admin_validate_scores" ON inter_scores;
CREATE POLICY "admin_validate_scores" ON inter_scores
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS "admin_delete_scores" ON inter_scores;
CREATE POLICY "admin_delete_scores" ON inter_scores
  FOR DELETE USING (
    athlete_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','admin'))
  );

-- ============================================================
-- 7. STANDINGS (computed view)
-- ============================================================
CREATE OR REPLACE VIEW inter_standings AS
SELECT
  s.competition_id,
  s.wod_id,
  s.athlete_id,
  s.team_id,
  p.username,
  p.level,
  b.name AS box_name,
  s.score_value,
  s.score_display,
  s.status,
  s.submitted_at,
  RANK() OVER (
    PARTITION BY s.competition_id, s.wod_id
    ORDER BY s.score_value DESC NULLS LAST
  ) AS rank
FROM inter_scores s
LEFT JOIN profiles p ON p.id = s.athlete_id
LEFT JOIN boxes b ON b.id = (
  SELECT box_id FROM inter_registrations
  WHERE competition_id = s.competition_id AND athlete_id = s.athlete_id
  LIMIT 1
)
WHERE s.status = 'validated';

-- ============================================================
-- 8. updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_inter_competitions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inter_competitions_updated_at ON inter_competitions;
CREATE TRIGGER trg_inter_competitions_updated_at
  BEFORE UPDATE ON inter_competitions
  FOR EACH ROW EXECUTE FUNCTION update_inter_competitions_updated_at();

NOTIFY pgrst, 'reload schema';
