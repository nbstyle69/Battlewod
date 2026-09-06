-- Contrôles E : isolation RLS (démo ≠ NBS2, anon, staging). Chaque bloc endosse un rôle pour sa transaction.
-- @@ E1 démo ne voit pas NBS2
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com'), 'role', 'authenticated')::text, true); end $$;
set local role authenticated;
select (select count(*) from public.box_members where box_id = '{{NBS2_BOX_ID}}')
     + (select count(*) from public.box_wods where box_id = '{{NBS2_BOX_ID}}')
     + (select count(*) from public.class_schedules where box_id = '{{NBS2_BOX_ID}}')
     + (select count(*) from public.class_reservations where box_id = '{{NBS2_BOX_ID}}')
     + (select count(*) from public.wod_scores where box_id = '{{NBS2_BOX_ID}}') = 0 as ok,
       'E1 compte démo (authenticated) : 0 ligne NBS2 (membres, WODs, créneaux, résas, scores ; tournois publics par RLS prod)' as controle,
       format('nbs2_visible: members=%s wods=%s slots=%s resas=%s scores=%s tournois=%s ; demo_wods=%s',
              (select count(*) from public.box_members where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.box_wods where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.class_schedules where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.class_reservations where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.wod_scores where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.tournaments where box_id = '{{NBS2_BOX_ID}}'),
              (select count(*) from public.box_wods where box_id = '{{BOX_ID}}')) as detail;
-- @@ E2 membre NBS2 ne voit pas AthleX Fitness
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', (select member_id from public.box_members where box_id = '{{NBS2_BOX_ID}}' and role = 'member' order by joined_at limit 1), 'role', 'authenticated')::text, true); end $$;
set local role authenticated;
select (select count(*) from public.box_members where box_id = '{{BOX_ID}}')
     + (select count(*) from public.box_wods where box_id = '{{BOX_ID}}')
     + (select count(*) from public.class_schedules where box_id = '{{BOX_ID}}')
     + (select count(*) from public.class_reservations where box_id = '{{BOX_ID}}')
     + (select count(*) from public.wod_scores where box_id = '{{BOX_ID}}') = 0 as ok,
       'E2 membre NBS2 (authenticated) : 0 ligne AthleX Fitness (hors tournois, publics par RLS prod)' as controle,
       format('demo_visible: members=%s wods=%s slots=%s resas=%s scores=%s tournois=%s',
              (select count(*) from public.box_members where box_id = '{{BOX_ID}}'),
              (select count(*) from public.box_wods where box_id = '{{BOX_ID}}'),
              (select count(*) from public.class_schedules where box_id = '{{BOX_ID}}'),
              (select count(*) from public.class_reservations where box_id = '{{BOX_ID}}'),
              (select count(*) from public.wod_scores where box_id = '{{BOX_ID}}'),
              (select count(*) from public.tournaments where box_id = '{{BOX_ID}}')) as detail;
-- @@ E3 anon
-- Un refus peut être un 0 ligne (policy) ou une erreur (permission denied sur une fonction de policy) : les deux valent refus.
create temp table _e3 (t text, n text) on commit drop;
do $$
declare tbl text; n bigint;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach tbl in array array['class_reservations','wod_scores','box_members','elo_history','tournament_match_elo_history','friendships'] loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', tbl) into n;
      reset role;
      insert into _e3 values (tbl, n::text);
    exception when others then
      reset role;
      insert into _e3 values (tbl, 'refusé');
    end;
  end loop;
end $$;
select bool_and(n in ('0', 'refusé')) as ok, 'E3 anon : 0 ligne (ou refus) sur réservations, scores, adhésions, ELO, amis' as controle,
       string_agg(t || '=' || n, ' ') as detail from _e3;
-- @@ E4 staging inaccessible
do $$ begin
  set local role authenticated;
  perform count(*) from demo_stg.params;
  raise exception 'demo_stg.params lisible par authenticated';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  set local role anon;
  perform count(*) from public._demo_seed_log;
  raise exception '_demo_seed_log lisible par anon';
exception when insufficient_privilege then null;
end $$;
reset role;
select true as ok, 'E4 demo_stg et _demo_seed_log refusés à anon/authenticated (permission denied)' as controle, 'ok' as detail;
