-- Contrôles B (après lot 2) : programmation, créneaux, réservations, scores, ELO mode A.
-- @@ B1 WODs
select count(*) = 48 and count(*) filter (where not is_published) = 0 and count(*) filter (where title ~* 'wod ?[0-9]|placeholder|lorem') = 0 as ok,
       'B1 48 WODs publiés, noms réels' as controle,
       format('wods=%s de %s à %s', count(*), min(scheduled_date), max(scheduled_date)) as detail
  from public.box_wods where box_id = '{{BOX_ID}}';
-- @@ B2 créneaux
select count(*) = 132 as ok, 'B2 132 créneaux' as controle,
       format('slots=%s futurs=%s', count(*), count(*) filter (where scheduled_date >= current_date)) as detail
  from public.class_schedules where box_id = '{{BOX_ID}}';
-- @@ B3 réservations
select count(*) = 1100 and count(*) filter (where status = 'waiting') = 0 as ok,
       'B3 1100 réservations confirmées, aucune en attente' as controle,
       format('total=%s waiting=%s présents=%s absents=%s à_venir=%s', count(*), count(*) filter (where status='waiting'),
              count(*) filter (where attended), count(*) filter (where attended = false), count(*) filter (where attended is null)) as detail
  from public.class_reservations where box_id = '{{BOX_ID}}';
-- @@ B4 capacité
with occ as (
  select s.id, s.scheduled_date, s.start_time, s.max_capacity, count(r.id) n,
         (s.scheduled_date + s.start_time::time) > now() as a_venir
    from public.class_schedules s left join public.class_reservations r on r.schedule_id = s.id and r.status = 'confirmed'
   where s.box_id = '{{BOX_ID}}' group by 1,2,3,4)
select count(*) filter (where n > max_capacity) = 0
       and count(*) filter (where a_venir and n = 0) = 0
       and count(*) filter (where a_venir and max_capacity - n < 4
                            and not (scheduled_date = '{{ANCHOR}}'::date + 4 and start_time = '17:30')) = 0
       and count(*) filter (where scheduled_date = '{{ANCHOR}}'::date + 4 and start_time = '17:30' and n = max_capacity) = 1 as ok,
       'B4 aucun dépassement, futurs ≥ 4 places sauf vendredi 17:30 complet, aucun futur vide' as controle,
       format('dépassements=%s futurs_vides=%s futurs_<4=%s vendredi_complet=%s',
              count(*) filter (where n > max_capacity), count(*) filter (where a_venir and n = 0),
              count(*) filter (where a_venir and max_capacity - n < 4),
              count(*) filter (where scheduled_date = '{{ANCHOR}}'::date + 4 and start_time = '17:30' and n = max_capacity)) as detail
  from occ;
-- @@ B5 quota hebdo
with w as (
  select r.member_id, date_trunc('week', s.scheduled_date)::date wk, count(*) n, max(mp.max_sessions_per_week) cap
    from public.class_reservations r join public.class_schedules s on s.id = r.schedule_id
    join public.box_members bm on bm.member_id = r.member_id and bm.box_id = r.box_id
    left join public.membership_plans mp on mp.id = bm.plan_id
   where r.box_id = '{{BOX_ID}}' and r.status = 'confirmed' group by 1,2)
select count(*) filter (where cap is not null and n > cap) = 0 as ok, 'B5 aucune semaine au-dessus de la formule' as controle,
       format('semaines=%s dépassements=%s', count(*), count(*) filter (where cap is not null and n > cap)) as detail from w;
-- @@ B6 scores
select count(*) = (select count(*) from demo_stg.wod_scores s join demo_stg.wod_map wm on wm.wod_ref = s.wod_ref
                    join public.box_wods w on w.id = wm.wod_id where w.scheduled_date <= current_date)
       and count(*) filter (where submitted_at > now()) = 0 as ok,
       'B6 scores = CSV filtré à la date d''exécution, aucun dans le futur' as controle,
       format('scores=%s futurs=%s wods_scorés=%s', count(*), count(*) filter (where submitted_at > now()), count(distinct wod_id)) as detail
  from public.wod_scores where box_id = '{{BOX_ID}}';
-- @@ B7 ELO démo
select p.elo between 1100 and 1320 as ok, 'B7 ELO démo après WODs, avant brackets (tolérance [1200, 1320] contrôlée en C7)' as controle,
       format('elo=%s matches=%s wins=%s', p.elo, p.total_matches, p.wins) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ B8 rang démo
with r as (select p.id, rank() over (order by p.elo desc) rk from public.profiles p
             join public.box_members bm on bm.member_id = p.id and bm.box_id = '{{BOX_ID}}' and bm.role <> 'owner')
select rk between 5 and 40 as ok, 'B8 rang démo après WODs, avant brackets (tolérance 5–20 contrôlée en C8)' as controle, format('rang=#%s/150', rk) as detail
  from r where id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com');
-- @@ B9 plage ELO
select min(p.elo) >= 900 and max(p.elo) <= 1500 as ok, 'B9 ELO membres dans [900, 1500]' as controle,
       format('min=%s max=%s moy=%s', min(p.elo), max(p.elo), round(avg(p.elo))) as detail
  from public.profiles p join public.box_members bm on bm.member_id = p.id and bm.box_id = '{{BOX_ID}}' and bm.role <> 'owner';
-- @@ B10 courbe ELO démo
with h as (select * from public.elo_history where member_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com') order by created_at)
select count(*) >= 10 and (select elo_after from h order by created_at desc limit 1) = (select elo from public.profiles where email = 'nbstylz+appledemo@gmail.com') as ok,
       'B10 courbe ELO démo : ≥ 10 points, dernier point = ELO profil' as controle,
       format('points=%s premier=%s dernier=%s', count(*), min(created_at)::date, max(created_at)::date) as detail from h;
-- @@ B11 box_elo
select count(*) = 150 and count(*) filter (where matches > 0) >= 140 as ok, 'B11 classement de box : 150 entrées' as controle,
       format('entrées=%s actives=%s', count(*), count(*) filter (where matches > 0)) as detail
  from public.box_elo where box_id = '{{BOX_ID}}';
-- @@ B12 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'B12 NBS2 : relevé identique au lot 0' as controle, demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
