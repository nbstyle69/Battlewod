-- ROLLBACK (2/3) : vérification après suppression des comptes Auth. Toutes les valeurs doivent être 0.
select 'boxes' t, count(*) n from public.boxes where id = '{{BOX_ID}}'
union all select 'profiles', count(*) from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id
union all select 'auth_users', count(*) from auth.users u join demo_stg.member_map mm on mm.user_id = u.id
union all select 'auth_users_email', count(*) from auth.users where email like '%@demo.athlexapp.eu' or email in ('nbstylz+athlexfitness@gmail.com','nbstylz+appledemo@gmail.com')
union all select 'box_members', count(*) from public.box_members where box_id = '{{BOX_ID}}'
union all select 'membership_plans', count(*) from public.membership_plans where box_id = '{{BOX_ID}}'
union all select 'box_subscriptions', count(*) from public.box_subscriptions where box_id = '{{BOX_ID}}'
union all select 'box_wods', count(*) from public.box_wods where box_id = '{{BOX_ID}}'
union all select 'class_schedules', count(*) from public.class_schedules where box_id = '{{BOX_ID}}'
union all select 'class_reservations', count(*) from public.class_reservations where box_id = '{{BOX_ID}}'
union all select 'wod_scores', count(*) from public.wod_scores where box_id = '{{BOX_ID}}'
union all select 'elo_history', count(*) from public.elo_history where box_id = '{{BOX_ID}}'
union all select 'box_elo', count(*) from public.box_elo where box_id = '{{BOX_ID}}'
union all select 'tournaments', count(*) from public.tournaments where box_id = '{{BOX_ID}}'
union all select 'tournament_match_elo_history', count(*) from public.tournament_match_elo_history h join demo_stg.member_map mm on mm.user_id = h.athlete_id
union all select 'athlete_badges', count(*) from public.athlete_badges b join demo_stg.member_map mm on mm.user_id = b.athlete_id
union all select 'friendships', count(*) from public.friendships f join demo_stg.member_map mm on mm.user_id in (f.requester_id, f.addressee_id)
union all select 'box_articles', count(*) from public.box_articles where box_id = '{{BOX_ID}}'
union all select 'athlete_streaks', count(*) from public.athlete_streaks s join demo_stg.member_map mm on mm.user_id = s.athlete_id
union all select 'movement_rep_counts', count(*) from public.movement_rep_counts c join demo_stg.member_map mm on mm.user_id = c.athlete_id;
