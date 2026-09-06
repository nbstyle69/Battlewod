-- Contrôles D (après lot 4) : badges, amis, actualités, streaks, compteurs.
-- @@ D1 badges démo
with d as (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com')
select count(*) filter (where badge_key like 'mv_%') = (select count(*) from demo_stg.badges where member_ref = 'm013' and debloque = 'true')
         + count(*) filter (where badge_key in ('mv_polyvalent_5','mv_polyvalent_10','mv_polyvalent_20','mv_total_10k','mv_total_50k','mv_total_100k'))
       and count(*) filter (where badge_key in ('first_score','level_rx','streak_3w','first_win')) = 4 as ok,
       'D1 badges démo : mouvements du CSV (débloqués) + génériques dérivés' as controle,
       string_agg(badge_key, ' ' order by badge_key) as detail
  from public.athlete_badges where athlete_id = (select id from d);
-- @@ D2 badges verrouillés
select count(*) = 4 and count(*) filter (where exists (select 1 from public.athlete_badges ab join demo_stg.member_map mm on mm.user_id = ab.athlete_id
                                                        where mm.member_ref = b.member_ref and ab.badge_key = b.badge_key)) = 0 as ok,
       'D2 les 4 badges « verrouillés » du CSV ne sont pas attribués' as controle,
       string_agg(b.member_ref || ':' || b.badge_key, ', ') as detail
  from demo_stg.badges b where b.debloque = 'false';
-- @@ D3 compteurs de reps
select count(*) = (select count(*) from demo_stg.movement_reps) and bool_and(total_reps > 0) as ok,
       'D3 movement_rep_counts = CSV' as controle,
       format('lignes=%s démo=%s', count(*), (select string_agg(movement_key || '=' || total_reps, ' ' order by total_reps desc)
                                                from public.movement_rep_counts where athlete_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com'))) as detail
  from public.movement_rep_counts c join demo_stg.member_map mm on mm.user_id = c.athlete_id;
-- @@ D4 amis démo
select count(*) = 23 and (select total_friends from public.profiles where email = 'nbstylz+appledemo@gmail.com') = 23 as ok,
       'D4 démo : 23 amis acceptés, total_friends = 23' as controle,
       format('friendships=%s total_friends=%s', count(*), (select total_friends from public.profiles where email = 'nbstylz+appledemo@gmail.com')) as detail
  from public.friendships f where f.status = 'accepted'
   and (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com') in (f.requester_id, f.addressee_id);
-- @@ D5 actualités
select count(*) = 3 and bool_and(created_at <= now()) as ok, 'D5 3 actualités datées dans le passé' as controle,
       string_agg(title || ' (' || created_at::date || ')', ', ' order by created_at) as detail
  from public.box_articles where box_id = '{{BOX_ID}}';
-- @@ D6 streak démo
select s.current_streak = 6 and s.week_start = '{{ANCHOR}}'::date as ok, 'D6 streak démo = 6 semaines, semaine courante = ancre' as controle,
       format('current=%s longest=%s week_sessions=%s week_start=%s', s.current_streak, s.longest_streak, s.week_session_count, s.week_start) as detail
  from public.athlete_streaks s where s.athlete_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com');
-- @@ D7 BRUTAL GAUNTLET
select case when w.scheduled_date > current_date then count(ws.id) = 0
            else count(ws.id) >= 20 and count(ws.id) filter (where ws.member_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com')) = 1 end as ok,
       'D7 BRUTAL GAUNTLET : scores présents (dont celui du démo) si le WOD est passé, aucun s''il est à venir' as controle,
       format('wod=%s date=%s scores=%s', w.title, w.scheduled_date, count(ws.id)) as detail
  from public.box_wods w left join public.wod_scores ws on ws.wod_id = w.id
 where w.box_id = '{{BOX_ID}}' and w.title = 'BRUTAL GAUNTLET' group by w.id;
-- @@ D8 compteurs profil démo
select p.total_scores_submitted > 0 and p.total_tournaments = 4 and p.total_friends = 23 as ok,
       'D8 compteurs démo non nuls (scores, tournois, amis)' as controle,
       format('scores=%s tournois=%s wins_tournois=%s amis=%s', p.total_scores_submitted, p.total_tournaments, p.total_tournament_wins, p.total_friends) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ D9 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'D9 NBS2 : relevé identique au lot 0' as controle, demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
