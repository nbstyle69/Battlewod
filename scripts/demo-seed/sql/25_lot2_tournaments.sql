-- LOT 2 (2/2) : tournois et inscriptions (structure). Les matchs sont joués au lot 3, dans le flux
-- d'événements chronologique commun aux WODs ; ici on ne fait que préparer demo_stg.match_plan
-- (un uuid fixe et un horaire unique par match, pour l'ordre de rejeu et la reprise).
create table if not exists demo_stg.match_plan (
  match_ref text primary key, tournament_id uuid not null, match_id uuid not null unique,
  round int not null, match_number int not null, side text not null,
  participant1_id uuid not null, participant2_id uuid not null, winner_id uuid, loser_id uuid,
  status text not null, scheduled_at timestamptz not null, completed_at timestamptz, notes text,
  created_at timestamptz not null, event_at timestamptz not null
);

do $$
declare
  v_owner uuid := (select user_id from demo_stg.member_map where member_ref = 'owner');
  v_box   uuid := '{{BOX_ID}}';
begin
  if exists (select 1 from public.tournaments where box_id = v_box) then
    raise exception 'la box démo a déjà des tournois';
  end if;

  insert into demo_stg.tourn_map (tournament_ref, tournament_id)
  select tournament_ref, gen_random_uuid() from demo_stg.tournaments on conflict do nothing;

  -- ── Tournois ─────────────────────────────────────────────────────────────
  insert into public.tournaments (id, box_id, created_by, name, description, max_participants, level, status,
                                  start_date, end_date, format, gender_target, require_video_proof, prize, rules, created_at)
  select tm.tournament_id, v_box, v_owner, t.nom,
         case t.format
           when 'double_elimination'   then 'Bracket double élimination, 32 athlètes RX. Un WOD par tour, le perdant descend en loser bracket.'
           when 'inter_box'            then 'Inter-box Rhône : 64 places ouvertes aux boxes de la région, 3 WODs sur une journée.'
           when 'mini_tournoi'         then 'Sprint du jeudi : 8 athlètes, bracket express en une soirée, WODs courts.'
           when 'competition_physique' then 'Throwdown d''automne : 40 athlètes RX+, 4 épreuves, classement au cumul des points.'
         end,
         t.places::int,
         case t.categorie when 'RX' then 'rx' when 'RX+' then 'rx+' when 'Open' then 'gx' else lower(t.categorie) end,
         case t.statut when 'live' then 'active' when 'termine' then 'completed' else 'open' end,
         demo_stg.d(t.date_debut)::timestamptz + interval '18 hours',
         case when t.date_fin <> '' then demo_stg.d(t.date_fin)::timestamptz + interval '21 hours' end,
         case t.format when 'double_elimination' then 'bracket' when 'mini_tournoi' then 'bracket' else 'simple' end,
         'mix', false,
         case t.format when 'double_elimination' then 'Tenue AthleX + 1 mois offert'
                       when 'inter_box' then 'Trophée inter-box' else null end,
         'Scores saisis par le coach sur place. Standards RX de la box.',
         (demo_stg.d(t.date_debut) - 21)::timestamptz + interval '10 hours'
    from demo_stg.tournaments t join demo_stg.tourn_map tm on tm.tournament_ref = t.tournament_ref;
  perform public._demo_log('tournaments', id::text) from public.tournaments where box_id = v_box;

  -- ── Inscriptions ────────────────────────────────────────────────────────
  insert into public.tournament_participants (tournament_id, athlete_id, score, registered_at)
  select tm.tournament_id, mm.user_id,
         case when t.format = 'competition_physique' then (41 - p.seed::int) * 10 else null end,
         (demo_stg.d(t.date_debut) - 14)::timestamptz + make_interval(hours => 8 + p.seed::int % 12, mins => (abs(hashtext(p.member_ref)) % 60))
    from demo_stg.tournament_participants p
    join demo_stg.tourn_map tm on tm.tournament_ref = p.tournament_ref
    join demo_stg.tournaments t on t.tournament_ref = p.tournament_ref
    join demo_stg.member_map mm on mm.member_ref = p.member_ref;
  perform public._demo_log('tournament_participants', tp.id::text)
     from public.tournament_participants tp join public.tournaments t on t.id = tp.tournament_id where t.box_id = v_box;

  -- ── Plan des matchs : horaire de fin unique par jour (tour, puis bracket, puis match_ref) ──
  truncate demo_stg.match_plan;
  insert into demo_stg.match_plan
  select x.match_ref, tm.tournament_id, gen_random_uuid(), x.tour::int,
         row_number() over (partition by x.tournament_ref, x.bracket, x.tour order by x.match_ref),
         case when x.bracket = 'winners'
                   and x.tour::int = max(x.tour::int) filter (where x.bracket = 'winners') over (partition by x.tournament_ref)
                   and count(*) filter (where x.bracket = 'winners') over (partition by x.tournament_ref, x.tour) = 1
                   and exists (select 1 from demo_stg.tournament_matches y where y.tournament_ref = x.tournament_ref and y.bracket = 'losers')
              then 'grand_final'
              when x.bracket = 'winners' then 'winner' else 'loser' end,
         a.user_id, b.user_id, w.user_id, l.user_id,
         case x.statut when 'termine' then 'completed' else 'pending' end,
         demo_stg.d(x.jour)::timestamptz + interval '18 hours',
         case when x.statut = 'termine' then
           demo_stg.d(x.jour)::timestamptz + interval '18 hours'
             + (6 * row_number() over (partition by x.jour order by x.tour::int, case x.bracket when 'winners' then 0 else 1 end, x.match_ref) || ' minutes')::interval
         end,
         case when x.statut = 'termine' then x.score_vainqueur || ' – ' || x.score_perdant end,
         demo_stg.d(x.jour)::timestamptz + interval '8 hours',
         demo_stg.d(x.jour)::timestamptz + interval '18 hours'
           + (6 * row_number() over (partition by x.jour order by x.tour::int, case x.bracket when 'winners' then 0 else 1 end, x.match_ref) || ' minutes')::interval
    from demo_stg.tournament_matches x
    join demo_stg.tourn_map tm on tm.tournament_ref = x.tournament_ref
    join demo_stg.member_map a on a.member_ref = x.joueur_a
    join demo_stg.member_map b on b.member_ref = x.joueur_b
    left join demo_stg.member_map w on w.member_ref = x.vainqueur
    left join demo_stg.member_map l on l.member_ref = x.perdant;
end $$;

select
  (select count(*) from public.tournaments where box_id = '{{BOX_ID}}') as tournaments,
  (select count(*) from public.tournament_participants tp join public.tournaments t on t.id = tp.tournament_id where t.box_id = '{{BOX_ID}}') as participants,
  (select count(*) from demo_stg.match_plan) as matchs_planifies,
  (select count(*) from demo_stg.match_plan where status = 'completed' and completed_at > now()) as matchs_termines_futurs;
