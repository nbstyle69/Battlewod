-- ============================================
-- BattleWOD - Schéma Supabase
-- ============================================

-- Extension UUID
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLE : profiles (athlètes & admins)
-- ============================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  username text unique not null,
  avatar_url text,
  level text not null default 'scaled' check (level in ('scaled','inter','rx','rx+','gx','pro')),
  role text not null default 'athlete' check (role in ('athlete','admin')),
  elo integer not null default 1000,
  total_matches integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- ============================================
-- TABLE : wods
-- ============================================
create table if not exists wods (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  type text not null check (type in ('AMRAP','For Time','EMOM','Tabata','Max Reps')),
  duration_minutes integer not null default 5,
  level text not null check (level in ('scaled','inter','rx','rx+','gx','pro')),
  movements jsonb not null default '[]',
  equipment text[] default '{}',
  scoring text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table wods enable row level security;
create policy "WODs are viewable by everyone" on wods for select using (true);
create policy "Admins can manage WODs" on wods for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- TABLE : matches (1v1)
-- ============================================
create table if not exists matches (
  id uuid default uuid_generate_v4() primary key,
  athlete1_id uuid references profiles(id) not null,
  athlete2_id uuid references profiles(id) not null,
  wod_id uuid references wods(id),
  status text not null default 'pending' check (status in ('pending','active','completed','cancelled')),
  winner_id uuid references profiles(id),
  athlete1_score numeric,
  athlete2_score numeric,
  athlete1_video_url text,
  athlete2_video_url text,
  athlete1_validated boolean default false,
  athlete2_validated boolean default false,
  elo_change integer default 0,
  created_at timestamptz default now()
);

alter table matches enable row level security;
create policy "Athletes can view their own matches" on matches for select using (
  auth.uid() = athlete1_id or auth.uid() = athlete2_id
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Athletes can create matches" on matches for insert with check (auth.uid() = athlete1_id);
create policy "Athletes can update their matches" on matches for update using (
  auth.uid() = athlete1_id or auth.uid() = athlete2_id
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- TABLE : tournaments
-- ============================================
create table if not exists tournaments (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  max_participants integer not null default 16,
  level text not null check (level in ('scaled','inter','rx','rx+','gx','pro')),
  status text not null default 'open' check (status in ('open','active','completed')),
  prize text,
  start_date timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table tournaments enable row level security;
create policy "Tournaments viewable by everyone" on tournaments for select using (true);
create policy "Admins can manage tournaments" on tournaments for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- TABLE : tournament_participants
-- ============================================
create table if not exists tournament_participants (
  id uuid default uuid_generate_v4() primary key,
  tournament_id uuid references tournaments(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete cascade,
  score numeric default 0,
  rank integer,
  joined_at timestamptz default now(),
  unique(tournament_id, athlete_id)
);

alter table tournament_participants enable row level security;
create policy "Participants viewable by everyone" on tournament_participants for select using (true);
create policy "Athletes can join tournaments" on tournament_participants for insert with check (auth.uid() = athlete_id);

-- ============================================
-- TABLE : mini_tournaments (5 max / jour)
-- ============================================
create table if not exists mini_tournaments (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  level text not null check (level in ('scaled','inter','rx','rx+','gx','pro')),
  max_participants integer not null default 5,
  status text not null default 'open' check (status in ('open','active','completed')),
  wod_id uuid references wods(id),
  created_by uuid references profiles(id),
  day date not null default current_date,
  created_at timestamptz default now()
);

alter table mini_tournaments enable row level security;
create policy "Mini tournaments viewable by everyone" on mini_tournaments for select using (true);
create policy "Athletes can create mini tournaments" on mini_tournaments for insert with check (auth.uid() = created_by);

-- ============================================
-- TABLE : scores
-- ============================================
create table if not exists scores (
  id uuid default uuid_generate_v4() primary key,
  athlete_id uuid references profiles(id) not null,
  wod_id uuid references wods(id),
  match_id uuid references matches(id),
  value numeric not null,
  unit text not null check (unit in ('reps','time','kg')),
  video_url text,
  validated boolean default false,
  validated_by uuid references profiles(id),
  validated_at timestamptz,
  created_at timestamptz default now()
);

alter table scores enable row level security;
create policy "Athletes can view own scores" on scores for select using (
  auth.uid() = athlete_id
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Athletes can submit scores" on scores for insert with check (auth.uid() = athlete_id);
create policy "Admins can validate scores" on scores for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================
-- TABLE : personal_records (PRs)
-- ============================================
create table if not exists personal_records (
  id uuid default uuid_generate_v4() primary key,
  athlete_id uuid references profiles(id) on delete cascade,
  movement text not null,
  value numeric not null,
  unit text not null,
  achieved_at timestamptz default now(),
  unique(athlete_id, movement)
);

alter table personal_records enable row level security;
create policy "PRs viewable by owner" on personal_records for select using (auth.uid() = athlete_id);
create policy "Athletes can insert PRs" on personal_records for insert with check (auth.uid() = athlete_id);
create policy "Athletes can update PRs" on personal_records for update using (auth.uid() = athlete_id);

-- ============================================
-- TABLE : badges
-- ============================================
create table if not exists athlete_badges (
  id uuid default uuid_generate_v4() primary key,
  athlete_id uuid references profiles(id) on delete cascade,
  badge_key text not null,
  achieved_at timestamptz default now(),
  unique(athlete_id, badge_key)
);

alter table athlete_badges enable row level security;
create policy "Badges viewable by owner" on athlete_badges for select using (auth.uid() = athlete_id);

-- ============================================
-- FUNCTION : calculate ELO
-- ============================================
create or replace function calculate_elo(
  winner_elo integer,
  loser_elo integer,
  k_factor integer default 32
) returns table (new_winner_elo integer, new_loser_elo integer, elo_change integer) as $$
declare
  expected_winner numeric;
  change integer;
begin
  expected_winner := 1.0 / (1 + power(10.0, (loser_elo - winner_elo) / 400.0));
  change := round(k_factor * (1 - expected_winner));
  return query select
    (winner_elo + change)::integer,
    (loser_elo - change)::integer,
    change;
end;
$$ language plpgsql;

-- ============================================
-- FUNCTION : update ELO after match
-- ============================================
create or replace function update_elo_after_match()
returns trigger as $$
declare
  w_elo integer;
  l_elo integer;
  elo_result record;
  loser_id uuid;
begin
  if new.status = 'completed' and new.winner_id is not null and old.status != 'completed' then
    if new.winner_id = new.athlete1_id then
      loser_id := new.athlete2_id;
    else
      loser_id := new.athlete1_id;
    end if;

    select elo into w_elo from profiles where id = new.winner_id;
    select elo into l_elo from profiles where id = loser_id;

    select * into elo_result from calculate_elo(w_elo, l_elo);

    update profiles set
      elo = elo_result.new_winner_elo,
      wins = wins + 1,
      total_matches = total_matches + 1
    where id = new.winner_id;

    update profiles set
      elo = elo_result.new_loser_elo,
      losses = losses + 1,
      total_matches = total_matches + 1
    where id = loser_id;

    update matches set elo_change = elo_result.elo_change where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_match_completed
  after update on matches
  for each row execute function update_elo_after_match();
