-- LOT 0 : journal d'écriture, schéma de staging. Idempotent. Rien dans les tables métier.
-- Aucun objet n'est exposé aux rôles anon / authenticated (RLS sans policy + révocation des grants).

create table if not exists public._demo_seed_log (
  id          bigserial primary key,
  table_name  text        not null,
  row_id      text        not null,
  seeded_at   timestamptz not null default now()
);
create unique index if not exists _demo_seed_log_table_row on public._demo_seed_log(table_name, row_id);
alter table public._demo_seed_log enable row level security;
revoke all on table public._demo_seed_log from anon, authenticated, public;
revoke all on sequence public._demo_seed_log_id_seq from anon, authenticated, public;

create or replace function public._demo_log(p_table text, p_id text)
returns void language sql as $$
  insert into public._demo_seed_log(table_name, row_id) values (p_table, p_id) on conflict do nothing;
$$;
revoke all on function public._demo_log(text, text) from anon, authenticated, public;

create schema if not exists demo_stg;
revoke all on schema demo_stg from anon, authenticated, public;

create table if not exists demo_stg.params (key text primary key, value text);
create table if not exists demo_stg.member_map (
  member_ref text primary key,
  email      text not null unique,
  user_id    uuid not null unique
);

create table if not exists demo_stg.members (
  member_ref text, email text, pseudo text, role text, elo text, tier text, rang text, victoires text,
  matchs text, streak text, wods_total text, reservations_total text, formule text,
  seances_cible_semaine text, is_demo_account text);
create table if not exists demo_stg.elo_start (member_ref text, elo_depart text, jour text);
create table if not exists demo_stg.class_slots (slot_ref text, box_id text, jour text, heure text, type text, capacite text);
create table if not exists demo_stg.reservations (slot_ref text, member_ref text, statut text);
create table if not exists demo_stg.wod_blocks (wod_ref text, box_id text, jour text, nom text, format text, detail text);
create table if not exists demo_stg.wod_scores (wod_ref text, member_ref text, jour text, unite text, valeur text, categorie text);
create table if not exists demo_stg.tournaments (
  tournament_ref text, box_id text, nom text, format text, categorie text, places text, inscrits text,
  statut text, date_debut text, date_fin text);
create table if not exists demo_stg.tournament_participants (tournament_ref text, member_ref text, seed text);
create table if not exists demo_stg.tournament_matches (
  tournament_ref text, match_ref text, bracket text, tour text, jour text, joueur_a text, joueur_b text,
  vainqueur text, perdant text, score_vainqueur text, score_perdant text, statut text);
create table if not exists demo_stg.elo_history (member_ref text, jour text, delta text, elo_apres text, source_type text, source_ref text);
create table if not exists demo_stg.badges (member_ref text, mouvement text, badge_key text, palier text, debloque text);
create table if not exists demo_stg.movement_reps (member_ref text, mouvement text, total_reps text);
create table if not exists demo_stg.friends (member_ref text, ami_ref text, statut text);
create table if not exists demo_stg.box_news (box_id text, jour text, titre text, contenu text);

-- Références générateur -> uuid réels, posées au fil des lots
create table if not exists demo_stg.wod_map   (wod_ref text primary key, wod_id uuid not null);
create table if not exists demo_stg.slot_map  (slot_ref text primary key, schedule_id uuid not null);
create table if not exists demo_stg.tourn_map (tournament_ref text primary key, tournament_id uuid not null);
create table if not exists demo_stg.plan_map  (formule text primary key, plan_id uuid not null);

-- Relevé NBS2 (jsonb) : même requête que nbs2_snapshot.sql, utilisée par les contrôles A9/B/C/D
create or replace function demo_stg.nbs2_snapshot(p_box uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'members',     (select count(*) from public.box_members where box_id = p_box)::text,
    'members_md5', (select md5(string_agg(member_id::text, ',' order by member_id)) from public.box_members where box_id = p_box),
    'wods',        (select count(*) from public.box_wods where box_id = p_box)::text,
    'slots',       (select count(*) from public.class_schedules where box_id = p_box)::text,
    'resas',       (select count(*) from public.class_reservations where box_id = p_box)::text,
    'scores',      (select count(*) from public.wod_scores where box_id = p_box)::text,
    'tournaments', (select count(*) from public.tournaments where box_id = p_box)::text,
    'elo_md5',     (select md5(string_agg(id::text || ':' || elo::text, ',' order by id)) from public.profiles p
                      where exists (select 1 from public.box_members bm where bm.box_id = p_box and bm.member_id = p.id)));
$$;

-- Date du générateur (relative à L0 = 2026-09-07) -> date réelle recalée sur l'ancre
create or replace function demo_stg.d(p_jour text)
returns date language sql stable as $$
  select case when p_jour is null or p_jour = '' then null
              else p_jour::date + (select value::int from demo_stg.params where key = 'shift_days') end;
$$;
