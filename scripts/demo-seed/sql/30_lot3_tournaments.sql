-- LOT 3 : tournois, inscriptions, matchs de bracket (un par un, ordre chronologique : le trigger
-- trg_bracket_match_elo écrit tournament_match_elo_history et met à jour profiles.elo/total_matches/wins).
-- finalize_tournament_elo n'est PAS appelée.
do $$
declare
  v_owner uuid := (select user_id from demo_stg.member_map where member_ref = 'owner');
  v_box   uuid := '{{BOX_ID}}';
  m       record;
  v_side  text;
  v_num   int;
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

  -- ── Matchs, un par un, ordre chronologique ──────────────────────────────
  for m in
    select x.*, tm.tournament_id,
           a.user_id as p1, b.user_id as p2, w.user_id as win, l.user_id as los,
           max(x.tour::int) filter (where x.bracket = 'winners') over (partition by x.tournament_ref) as max_wtour,
           count(*) filter (where x.bracket = 'winners') over (partition by x.tournament_ref, x.tour) as n_wtour,
           row_number() over (partition by x.tournament_ref, x.bracket, x.tour order by x.match_ref) as num
      from demo_stg.tournament_matches x
      join demo_stg.tourn_map tm on tm.tournament_ref = x.tournament_ref
      join demo_stg.member_map a on a.member_ref = x.joueur_a
      join demo_stg.member_map b on b.member_ref = x.joueur_b
      left join demo_stg.member_map w on w.member_ref = x.vainqueur
      left join demo_stg.member_map l on l.member_ref = x.perdant
     order by demo_stg.d(x.jour), x.tour::int, case x.bracket when 'winners' then 0 else 1 end, x.match_ref
  loop
    v_side := case when m.bracket = 'winners' and m.tour::int = m.max_wtour and m.n_wtour = 1
                        and exists (select 1 from demo_stg.tournament_matches y where y.tournament_ref = m.tournament_ref and y.bracket = 'losers')
                   then 'grand_final'
                   when m.bracket = 'winners' then 'winner' else 'loser' end;
    insert into public.tournament_bracket_matches
      (tournament_id, round, match_number, side, participant1_id, participant2_id, winner_id, loser_id,
       status, scheduled_at, completed_at, notes, created_at)
    values (m.tournament_id, m.tour::int, m.num, v_side, m.p1, m.p2, m.win, m.los,
            case m.statut when 'termine' then 'completed' else 'pending' end,
            demo_stg.d(m.jour)::timestamptz + interval '18 hours',
            case when m.statut = 'termine' then demo_stg.d(m.jour)::timestamptz + interval '19 hours' + (m.num * 12 || ' minutes')::interval end,
            case when m.statut = 'termine' then m.score_vainqueur || ' – ' || m.score_perdant end,
            demo_stg.d(m.jour)::timestamptz + interval '8 hours');
  end loop;

  -- Le trigger date l'historique à now() : recalé à la fin du match (courbe ELO).
  update public.tournament_match_elo_history h
     set created_at = bm.completed_at
    from public.tournament_bracket_matches bm
    join public.tournaments t on t.id = bm.tournament_id
   where h.match_id = bm.id and t.box_id = v_box and bm.completed_at is not null;

  perform public._demo_log('tournament_bracket_matches', bm.id::text)
     from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = v_box;
  perform public._demo_log('tournament_match_elo_history', h.id::text)
     from public.tournament_match_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = v_box;

  -- ── Compteurs de profil ─────────────────────────────────────────────────
  update public.profiles p
     set total_tournaments = c.n,
         total_tournament_wins = coalesce(w.n, 0)
    from (select tp.athlete_id, count(*) n from public.tournament_participants tp
            join public.tournaments t on t.id = tp.tournament_id where t.box_id = v_box group by 1) c
    left join (select bm.winner_id athlete_id, count(*) n from public.tournament_bracket_matches bm
                 join public.tournaments t on t.id = bm.tournament_id
                where t.box_id = v_box and bm.status = 'completed'
                  and bm.side = 'grand_final'
                group by 1) w on w.athlete_id = c.athlete_id
   where p.id = c.athlete_id;
end $$;

select
  (select count(*) from public.tournaments where box_id = '{{BOX_ID}}') as tournaments,
  (select count(*) from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = '{{BOX_ID}}') as matches,
  (select count(*) from public.tournament_match_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}') as match_elo_rows,
  (select elo from public.profiles where email = 'nbstylz+appledemo@gmail.com') as demo_elo;
