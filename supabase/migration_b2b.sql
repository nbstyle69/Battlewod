-- ═══════════════════════════════════════════════════════════════
-- BattleWOD B2B — Migration complète
-- Coller dans Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Mise à jour de profiles ────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name   text,
  ADD COLUMN IF NOT EXISTS avatar_url  text;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'box_owner', 'member', 'athlete', 'admin'));

-- ── 2. boxes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boxes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete cascade,
  name        text not null,
  description text,
  logo_url    text,
  invite_code text unique not null,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ── 3. box_members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS box_members (
  id        uuid primary key default gen_random_uuid(),
  box_id    uuid references boxes(id) on delete cascade,
  member_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  status    text check (status in ('active', 'banned')) default 'active',
  unique(box_id, member_id)
);

-- ── 4. box_wods ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS box_wods (
  id              uuid primary key default gen_random_uuid(),
  box_id          uuid references boxes(id) on delete cascade,
  created_by      uuid references profiles(id),
  title           text not null,
  description     text,
  wod_type        text, -- 'for-time' | 'amrap' | 'emom' | 'tabata' | 'strength' | 'custom'
  scheduled_date  date not null,
  time_cap_seconds int,
  rounds          int,
  notes           text,
  is_published    boolean default false,
  created_at      timestamptz default now()
);

-- ── 5. wod_scores ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wod_scores (
  id          uuid primary key default gen_random_uuid(),
  wod_id      uuid references box_wods(id) on delete cascade,
  member_id   uuid references profiles(id),
  box_id      uuid references boxes(id),
  score_type  text check (score_type in ('time', 'reps', 'weight', 'rounds')),
  score_value numeric not null,
  rx          boolean default true,
  scaled      boolean default false,
  notes       text,
  video_url   text,
  submitted_at timestamptz default now(),
  unique(wod_id, member_id)
);

-- ── 6. score_comments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS score_comments (
  id        uuid primary key default gen_random_uuid(),
  score_id  uuid references wod_scores(id) on delete cascade,
  box_id    uuid references boxes(id),
  author_id uuid references profiles(id),
  content   text not null,
  created_at timestamptz default now()
);

-- ── 7. message_groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_groups (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid references boxes(id) on delete cascade,
  name       text not null,
  created_by uuid references profiles(id),
  members    uuid[] not null,
  created_at timestamptz default now()
);

-- ── 8. messages ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              uuid primary key default gen_random_uuid(),
  box_id          uuid references boxes(id) on delete cascade,
  sender_id       uuid references profiles(id),
  receiver_id     uuid references profiles(id),
  group_id        uuid references message_groups(id),
  content         text not null,
  message_type    text check (message_type in ('general', 'group', 'direct')),
  is_announcement boolean default false,
  attachment_url  text,
  created_at      timestamptz default now(),
  read_by         uuid[] default '{}'
);

-- ── 9. message_reactions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  member_id  uuid references profiles(id),
  emoji      text not null,
  created_at timestamptz default now(),
  unique(message_id, member_id, emoji)
);

-- ── 10. message_replies ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_replies (
  id                uuid primary key default gen_random_uuid(),
  parent_message_id uuid references messages(id) on delete cascade,
  box_id            uuid references boxes(id),
  sender_id         uuid references profiles(id),
  content           text not null,
  created_at        timestamptz default now()
);

-- ── 11. events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                    uuid primary key default gen_random_uuid(),
  box_id                uuid references boxes(id) on delete cascade,
  created_by            uuid references profiles(id),
  title                 text not null,
  description           text,
  event_date            timestamptz not null,
  location              text,
  max_participants      int,
  registration_deadline timestamptz,
  is_competition        boolean default false,
  cover_url             text,
  created_at            timestamptz default now()
);

-- ── 12. event_registrations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS event_registrations (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references events(id) on delete cascade,
  member_id   uuid references profiles(id),
  registered_at timestamptz default now(),
  status      text check (status in ('registered', 'waitlist', 'cancelled')) default 'registered',
  unique(event_id, member_id)
);

-- ── 13. competitions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
  id               uuid primary key default gen_random_uuid(),
  box_id           uuid references boxes(id) on delete cascade,
  created_by       uuid references profiles(id),
  title            text not null,
  description      text,
  start_date       date not null,
  end_date         date not null,
  format           text, -- 'individual' | 'team'
  scoring_type     text, -- 'points' | 'time' | 'reps'
  status           text check (status in ('draft','open','ongoing','finished')) default 'draft',
  max_participants int,
  cover_url        text,
  created_at       timestamptz default now()
);

-- ── 14. competition_participants ──────────────────────────────
CREATE TABLE IF NOT EXISTS competition_participants (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  member_id      uuid references profiles(id),
  team_name      text,
  registered_at  timestamptz default now(),
  status         text check (status in ('registered', 'waitlist', 'cancelled')) default 'registered',
  unique(competition_id, member_id)
);

-- ── 15. competition_scores ────────────────────────────────────
CREATE TABLE IF NOT EXISTS competition_scores (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  wod_id         uuid references wods(id),
  member_id      uuid references profiles(id),
  score_value    numeric not null,
  rank           int,
  points         int,
  submitted_at   timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE boxes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_wods                ENABLE ROW LEVEL SECURITY;
ALTER TABLE wod_scores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_comments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_replies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_scores      ENABLE ROW LEVEL SECURITY;

-- ── Helper: box_id de l'utilisateur courant ───────────────────
CREATE OR REPLACE FUNCTION get_user_box_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT bm.box_id FROM box_members bm
  WHERE bm.member_id = auth.uid() AND bm.status = 'active'
  LIMIT 1;
$$;

-- ── Helper: l'utilisateur est box_owner de ce box ─────────────
CREATE OR REPLACE FUNCTION is_box_owner(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM boxes WHERE id = p_box_id AND owner_id = auth.uid()
  );
$$;

-- ── Policies: boxes ───────────────────────────────────────────
DROP POLICY IF EXISTS "box_owner_full" ON boxes;
CREATE POLICY "box_owner_full" ON boxes
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "member_see_box" ON boxes;
CREATE POLICY "member_see_box" ON boxes
  FOR SELECT USING (id = get_user_box_id());

DROP POLICY IF EXISTS "public_read_by_invite" ON boxes;
CREATE POLICY "public_read_by_invite" ON boxes
  FOR SELECT USING (true); -- nécessaire pour rejoindre via code

-- ── Policies: box_members ─────────────────────────────────────
DROP POLICY IF EXISTS "owner_manage_members" ON box_members;
CREATE POLICY "owner_manage_members" ON box_members
  FOR ALL USING (is_box_owner(box_id));

DROP POLICY IF EXISTS "member_see_own" ON box_members;
CREATE POLICY "member_see_own" ON box_members
  FOR SELECT USING (member_id = auth.uid());

DROP POLICY IF EXISTS "member_join" ON box_members;
CREATE POLICY "member_join" ON box_members
  FOR INSERT WITH CHECK (member_id = auth.uid());

-- ── Policies: wods ────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_manage_wods" ON box_wods;
CREATE POLICY "owner_manage_wods" ON box_wods
  FOR ALL USING (is_box_owner(box_id));

DROP POLICY IF EXISTS "member_see_published" ON box_wods;
CREATE POLICY "member_see_published" ON box_wods
  FOR SELECT USING (box_id = get_user_box_id() AND is_published = true);

-- ── Policies: wod_scores ──────────────────────────────────────
DROP POLICY IF EXISTS "member_own_scores" ON wod_scores;
CREATE POLICY "member_own_scores" ON wod_scores
  FOR ALL USING (member_id = auth.uid());

DROP POLICY IF EXISTS "box_members_see_scores" ON wod_scores;
CREATE POLICY "box_members_see_scores" ON wod_scores
  FOR SELECT USING (box_id = get_user_box_id());

DROP POLICY IF EXISTS "owner_see_scores" ON wod_scores;
CREATE POLICY "owner_see_scores" ON wod_scores
  FOR SELECT USING (is_box_owner(box_id));

-- ── Policies: score_comments ──────────────────────────────────
DROP POLICY IF EXISTS "box_members_comments" ON score_comments;
CREATE POLICY "box_members_comments" ON score_comments
  FOR SELECT USING (box_id = get_user_box_id());

DROP POLICY IF EXISTS "member_post_comment" ON score_comments;
CREATE POLICY "member_post_comment" ON score_comments
  FOR INSERT WITH CHECK (author_id = auth.uid() AND box_id = get_user_box_id());

DROP POLICY IF EXISTS "author_delete_comment" ON score_comments;
CREATE POLICY "author_delete_comment" ON score_comments
  FOR DELETE USING (author_id = auth.uid());

-- ── Policies: messages ────────────────────────────────────────
DROP POLICY IF EXISTS "box_general_messages" ON messages;
CREATE POLICY "box_general_messages" ON messages
  FOR SELECT USING (
    (message_type = 'general' AND box_id = get_user_box_id())
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
  );

DROP POLICY IF EXISTS "send_message" ON messages;
CREATE POLICY "send_message" ON messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- ── Policies: events ──────────────────────────────────────────
DROP POLICY IF EXISTS "owner_manage_events" ON events;
CREATE POLICY "owner_manage_events" ON events
  FOR ALL USING (is_box_owner(box_id));

DROP POLICY IF EXISTS "member_see_events" ON events;
CREATE POLICY "member_see_events" ON events
  FOR SELECT USING (box_id = get_user_box_id());

-- ── Policies: competitions ────────────────────────────────────
DROP POLICY IF EXISTS "owner_manage_competitions" ON competitions;
CREATE POLICY "owner_manage_competitions" ON competitions
  FOR ALL USING (is_box_owner(box_id));

DROP POLICY IF EXISTS "member_see_competitions" ON competitions;
CREATE POLICY "member_see_competitions" ON competitions
  FOR SELECT USING (box_id = get_user_box_id());
