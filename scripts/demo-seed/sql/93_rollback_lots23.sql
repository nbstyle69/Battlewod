-- ROLLBACK PARTIEL lots 2 et 3 : on garde box, comptes Auth, profils, formules, adhésions (lot 1).
-- Supprimé : WODs, créneaux, réservations, scores, complétions, tournois, inscriptions, matchs, tout
-- l'historique ELO de la box. profiles / box_elo remis à l'état de fin de lot 1 (elo_start.csv).
-- Périmètre strict : box démo + utilisateurs de demo_stg.member_map.
do $$
declare
  v_box   uuid := '{{BOX_ID}}';
  v_users uuid[] := (select array_agg(user_id) from demo_stg.member_map);
begin
  if v_users is null then raise exception 'demo_stg.member_map vide : rien à annuler'; end if;
  if (select value from demo_stg.params where key = 'lot4_done') = '1' then
    raise exception 'lot 4 appliqué : rollback partiel 2+3 impossible, utiliser le rollback complet';
  end if;

  delete from public.athlete_streaks where athlete_id = any(v_users);

  delete from public.tournament_match_elo_history where tournament_id in (select id from public.tournaments where box_id = v_box);
  delete from public.tournament_bracket_matches where tournament_id in (select id from public.tournaments where box_id = v_box);
  delete from public.tournament_participants where tournament_id in (select id from public.tournaments where box_id = v_box);
  delete from public.tournaments where box_id = v_box;

  delete from public.box_elo_history where box_id = v_box;
  delete from public.elo_history where box_id = v_box;
  delete from public.wod_completions where box_id = v_box;
  delete from public.wod_scores where box_id = v_box;
  delete from public.class_reservations where box_id = v_box;
  delete from public.class_schedules where box_id = v_box;
  delete from public.box_wods where box_id = v_box;

  -- Etat de fin de lot 1
  update public.profiles p
     set elo = es.elo_depart::int, total_matches = 0, wins = 0, losses = 0,
         total_scores_submitted = 0, total_tournaments = 0, total_tournament_wins = 0
    from demo_stg.member_map mm join demo_stg.elo_start es on es.member_ref = mm.member_ref
   where p.id = mm.user_id;
  update public.profiles p
     set total_matches = 0, wins = 0, losses = 0, total_scores_submitted = 0, total_tournaments = 0, total_tournament_wins = 0
   where p.id = (select user_id from demo_stg.member_map where member_ref = 'owner');
  update public.box_elo be
     set elo = es.elo_depart::int, matches = 0, wins = 0, updated_at = demo_stg.d('2026-07-27')::timestamptz
    from demo_stg.member_map mm join demo_stg.elo_start es on es.member_ref = mm.member_ref
   where be.box_id = v_box and be.member_id = mm.user_id;

  -- Journal et staging des lots 2/3
  delete from public._demo_seed_log
   where table_name in ('box_wods', 'class_schedules', 'class_reservations', 'wod_scores', 'wod_completions',
                        'elo_history', 'box_elo_history', 'tournaments', 'tournament_participants',
                        'tournament_bracket_matches', 'tournament_match_elo_history', 'athlete_streaks');
  truncate demo_stg.wod_map, demo_stg.slot_map, demo_stg.tourn_map;
  if to_regclass('demo_stg.match_plan') is not null then truncate demo_stg.match_plan; end if;
  delete from demo_stg.params where key in ('lot2_done', 'lot3_done');
end $$;

-- Vérification : tout à 0, profils = elo_start, journal réduit au lot 0/1
select 'box_wods' t, count(*) n from public.box_wods where box_id = '{{BOX_ID}}'
union all select 'class_schedules', count(*) from public.class_schedules where box_id = '{{BOX_ID}}'
union all select 'class_reservations', count(*) from public.class_reservations where box_id = '{{BOX_ID}}'
union all select 'wod_scores', count(*) from public.wod_scores where box_id = '{{BOX_ID}}'
union all select 'wod_completions', count(*) from public.wod_completions where box_id = '{{BOX_ID}}'
union all select 'elo_history', count(*) from public.elo_history where box_id = '{{BOX_ID}}'
union all select 'box_elo_history', count(*) from public.box_elo_history where box_id = '{{BOX_ID}}'
union all select 'tournaments', count(*) from public.tournaments where box_id = '{{BOX_ID}}'
union all select 'tournament_match_elo_history', count(*) from public.tournament_match_elo_history h join demo_stg.member_map mm on mm.user_id = h.athlete_id
union all select 'athlete_streaks', count(*) from public.athlete_streaks s join demo_stg.member_map mm on mm.user_id = s.athlete_id
union all select 'profils_hors_elo_start', count(*) from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id
            join demo_stg.elo_start es on es.member_ref = mm.member_ref
           where p.elo <> es.elo_depart::int or p.total_matches <> 0 or p.wins <> 0 or p.losses <> 0
              or p.total_scores_submitted <> 0 or p.total_tournaments <> 0 or p.total_tournament_wins <> 0
union all select 'box_elo_hors_elo_start', count(*) from public.box_elo be join demo_stg.member_map mm on mm.user_id = be.member_id
            join demo_stg.elo_start es on es.member_ref = mm.member_ref
           where be.box_id = '{{BOX_ID}}' and (be.elo <> es.elo_depart::int or be.matches <> 0 or be.wins <> 0)
union all select 'journal_hors_lot01', count(*) from public._demo_seed_log
           where table_name not in ('auth.users', 'boxes', 'profiles', 'box_members', 'membership_plans', 'box_subscriptions', 'box_elo')
union all select 'manque_lot1', 151 - (select count(*) from public.box_members where box_id = '{{BOX_ID}}')
                                 + 151 - (select count(*) from auth.users u join demo_stg.member_map mm on mm.user_id = u.id)
                                 + 150 - (select count(*) from public.box_elo where box_id = '{{BOX_ID}}');
