-- ROLLBACK (1/3) : suppression des données métier du seed, ordre inverse des dépendances.
-- Périmètre strict : box démo + utilisateurs de demo_stg.member_map. Aucun DELETE sans ce filtre.
-- Les utilisateurs Auth sont supprimés ensuite par l'API admin (jamais de DELETE sur auth.users).
do $$
declare
  v_box uuid := '{{BOX_ID}}';
  v_users uuid[] := (select array_agg(user_id) from demo_stg.member_map);
begin
  if v_users is null then raise exception 'demo_stg.member_map vide : rien à annuler'; end if;

  delete from public.athlete_streaks where athlete_id = any(v_users);
  delete from public.box_articles where box_id = v_box;
  delete from public.friendships where requester_id = any(v_users) or addressee_id = any(v_users);
  delete from public.athlete_badges where athlete_id = any(v_users);
  delete from public.movement_rep_counts where athlete_id = any(v_users);

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

  delete from public.box_elo where box_id = v_box;
  delete from public.box_members where box_id = v_box;
  delete from public.membership_plans where box_id = v_box;
  delete from public.box_subscriptions where box_id = v_box;
  delete from public.boxes where id = v_box;
end $$;

-- Lignes journalisées qui subsisteraient hors périmètre box/users (attendu : 0)
select l.table_name, count(*) as restantes
  from public._demo_seed_log l
 where (l.table_name = 'boxes' and exists (select 1 from public.boxes where id::text = l.row_id))
    or (l.table_name = 'tournaments' and exists (select 1 from public.tournaments where id::text = l.row_id))
    or (l.table_name = 'box_wods' and exists (select 1 from public.box_wods where id::text = l.row_id))
    or (l.table_name = 'class_schedules' and exists (select 1 from public.class_schedules where id::text = l.row_id))
    or (l.table_name = 'friendships' and exists (select 1 from public.friendships where id::text = l.row_id))
    or (l.table_name = 'athlete_badges' and exists (select 1 from public.athlete_badges where id::text = l.row_id))
 group by 1;
