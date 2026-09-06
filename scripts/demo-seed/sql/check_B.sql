-- Contrôles B (après lot 2) : programmation, créneaux, réservations, tournois et inscriptions (structure, ELO au lot 3).
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
-- @@ B6 tournois
select count(*) = 7 and count(*) filter (where status = 'completed') = 4 and count(*) filter (where status = 'active') = 1
       and count(*) filter (where status = 'open') = 2 as ok,
       'B6 7 tournois (4 terminés, 1 en cours, 2 ouverts)' as controle,
       string_agg(name || ':' || format || '/' || status || '/' || level, ', ' order by start_date) as detail
  from public.tournaments where box_id = '{{BOX_ID}}';
-- @@ B7 inscriptions
select sum(n) = 173 as ok, 'B7 173 inscriptions' as controle,
       string_agg(t.name || '=' || n || '/' || t.max_participants, ', ' order by t.start_date) as detail
  from (select tournament_id, count(*) n from public.tournament_participants group by 1) x
  join public.tournaments t on t.id = x.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ B8 plan des matchs
select count(*) = 135 and count(*) filter (where status = 'completed') = (select count(*) from demo_stg.tournament_matches where statut = 'termine')
       and count(distinct completed_at) = count(*) filter (where status = 'completed') as ok,
       'B8 plan de 135 matchs, horaire de fin unique par match terminé' as controle,
       format('matchs=%s terminés=%s futurs=%s', count(*), count(*) filter (where status = 'completed'),
              count(*) filter (where status = 'completed' and completed_at > now())) as detail
  from demo_stg.match_plan;
-- @@ B9 aucun ELO calculé avant le lot 3
select (select count(*) from public.wod_scores where box_id = '{{BOX_ID}}') = 0
       and (select count(*) from public.elo_history where box_id = '{{BOX_ID}}') = 0
       and (select count(*) from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = '{{BOX_ID}}') = 0
       and count(*) filter (where p.elo <> es.elo_depart::int or p.total_matches <> 0 or p.wins <> 0) = 0 as ok,
       'B9 lot 2 = structure seule : 0 score, 0 match, profils à elo_start' as controle,
       format('profils_hors_elo_start=%s', count(*) filter (where p.elo <> es.elo_depart::int or p.total_matches <> 0 or p.wins <> 0)) as detail
  from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id join demo_stg.elo_start es on es.member_ref = mm.member_ref;
-- @@ B10 box_elo
select count(*) = 150 and count(*) filter (where matches <> 0) = 0 as ok, 'B10 classement de box : 150 entrées à elo_start, 0 match' as controle,
       format('entrées=%s', count(*)) as detail
  from public.box_elo where box_id = '{{BOX_ID}}';
-- @@ B11 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'B11 NBS2 : relevé identique au lot 0' as controle, demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
