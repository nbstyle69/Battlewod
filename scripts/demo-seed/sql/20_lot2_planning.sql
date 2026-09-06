-- LOT 2 (1/3) : WODs, créneaux, réservations. Les scores suivent WOD par WOD (21_…).
-- Triggers actifs : trg_enforce_capacity (passe en waiting), trg_enforce_weekly_limit (rejette).

do $$
declare
  v_owner uuid := (select user_id from demo_stg.member_map where member_ref = 'owner');
  v_box   uuid := '{{BOX_ID}}';
begin
  -- ── WODs ────────────────────────────────────────────────────────────────
  insert into demo_stg.wod_map (wod_ref, wod_id)
  select wod_ref, gen_random_uuid() from demo_stg.wod_blocks on conflict do nothing;

  insert into public.box_wods (id, box_id, created_by, title, description, wod_type, scheduled_date,
                               time_cap_seconds, is_published, leaderboard_enabled, sort_order, created_at, publish_at)
  select wm.wod_id, v_box, v_owner, w.nom, w.detail,
         case w.format when 'for_time' then 'for-time' when 'team' then 'custom' else w.format end,
         demo_stg.d(w.jour),
         case
           when w.format = 'amrap' and w.detail ~ '^\d+ min' then (substring(w.detail from '^(\d+) min'))::int * 60
           when w.format = 'emom' and w.detail ~ '^EMOM \d+' then (substring(w.detail from '^EMOM (\d+)'))::int * 60
           when w.format = 'for_time' and w.detail ~* 'cap \d+' then (substring(w.detail from '(?i)cap (\d+)'))::int * 60
           else null end,
         true, w.format <> 'team', 0,
         (demo_stg.d(w.jour) - 1)::timestamptz + interval '18 hours',
         (demo_stg.d(w.jour) - 1)::timestamptz + interval '18 hours'
    from demo_stg.wod_blocks w join demo_stg.wod_map wm on wm.wod_ref = w.wod_ref;
  perform public._demo_log('box_wods', id::text) from public.box_wods where box_id = v_box;

  -- ── Créneaux ────────────────────────────────────────────────────────────
  insert into demo_stg.slot_map (slot_ref, schedule_id)
  select slot_ref, gen_random_uuid() from demo_stg.class_slots on conflict do nothing;

  insert into public.class_schedules (id, box_id, title, description, coach, scheduled_date, start_time, end_time, max_capacity, created_at)
  select sm.schedule_id, v_box, s.type, null,
         coaches.names[1 + (abs(hashtext(s.slot_ref)) % array_length(coaches.names, 1))],
         demo_stg.d(s.jour), s.heure, to_char((s.heure::time + interval '1 hour'), 'HH24:MI'), s.capacite::int,
         (demo_stg.d('2026-07-27'))::timestamptz
    from demo_stg.class_slots s join demo_stg.slot_map sm on sm.slot_ref = s.slot_ref
    cross join (select array_agg(pseudo order by member_ref) as names from demo_stg.members where role = 'coach') coaches;
  perform public._demo_log('class_schedules', id::text) from public.class_schedules where box_id = v_box;

  -- ── Réservations (attended -> confirmé + présent, no_show -> confirmé + absent, booked -> confirmé) ──
  insert into public.class_reservations (schedule_id, member_id, box_id, status, attended, is_trial, created_at)
  select sm.schedule_id, mm.user_id, v_box, 'confirmed',
         case r.statut when 'attended' then true when 'no_show' then false else null end,
         false,
         (demo_stg.d(s.jour) - 1 - (abs(hashtext(r.slot_ref || r.member_ref)) % 3))::timestamptz + interval '20 hours'
    from demo_stg.reservations r
    join demo_stg.class_slots s on s.slot_ref = r.slot_ref
    join demo_stg.slot_map sm on sm.slot_ref = r.slot_ref
    join demo_stg.member_map mm on mm.member_ref = r.member_ref
   order by demo_stg.d(s.jour), s.heure;
  perform public._demo_log('class_reservations', id::text) from public.class_reservations where box_id = v_box;
end $$;

select count(*) as reservations from public.class_reservations where box_id = '{{BOX_ID}}';
