-- LOT 2 (2/3) : scores d'UN WOD puis recalcul ELO par les RPC de prod (mode A).
-- Une transaction par WOD : compute_wod_elo / compute_box_elo créent des TEMP TABLE ON COMMIT DROP.
-- Les RPC exigent auth.uid() = gérant ou membre actif : on porte l'identité du gérant pour la
-- durée de la transaction (set_config local), comme le ferait l'app.
do $$
declare
  v_wod   uuid := '{{WOD_ID}}';
  v_owner uuid := '{{OWNER_ID}}';
  v_box   uuid := '{{BOX_ID}}';
  v_date  date;
  v_n     int;
begin
  select scheduled_date into v_date from public.box_wods where id = v_wod and box_id = v_box;
  if v_date is null then raise exception 'WOD % hors box démo', v_wod; end if;
  if v_date > current_date then raise exception 'WOD % postérieur au jour d''exécution', v_wod; end if;
  if exists (select 1 from public.wod_scores where wod_id = v_wod) then
    raise exception 'WOD % a déjà des scores', v_wod;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  insert into public.wod_scores (wod_id, member_id, box_id, score_type, score_value, rx, scaled, capped, submitted_at)
  select v_wod, mm.user_id, v_box,
         case s.unite when 'temps' then 'time' when 'reps' then 'reps' when 'charge' then 'weight' end,
         case s.unite
           when 'temps' then split_part(s.valeur, ':', 1)::int * 60 + split_part(s.valeur, ':', 2)::int
           else s.valeur::int end,
         s.categorie = 'RX', s.categorie <> 'RX', false,
         -- heure du créneau réservé ce jour-là (sinon 19:00), + quelques minutes
         v_date::timestamptz
           + coalesce((select min(cs.heure::time) from demo_stg.reservations r
                          join demo_stg.class_slots cs on cs.slot_ref = r.slot_ref
                         where r.member_ref = s.member_ref and cs.jour = s.jour and r.statut = 'attended'),
                      time '19:00')
           + make_interval(mins => 55 + (abs(hashtext(s.member_ref || s.wod_ref)) % 20))
    from demo_stg.wod_scores s
    join demo_stg.wod_map wm on wm.wod_ref = s.wod_ref
    join demo_stg.member_map mm on mm.member_ref = s.member_ref
   where wm.wod_id = v_wod;
  get diagnostics v_n = row_count;

  insert into public.wod_completions (wod_id, member_id, box_id, completed_at)
  select ws.wod_id, ws.member_id, ws.box_id, ws.submitted_at from public.wod_scores ws where ws.wod_id = v_wod;

  if v_n >= 2 then
    perform * from public.compute_wod_elo(v_wod);
    perform * from public.compute_box_elo(v_wod);
    -- Les RPC datent l'historique à now() : on le recale au jour du WOD (courbe sur six semaines).
    update public.elo_history     set created_at = v_date::timestamptz + interval '21 hours' where wod_id = v_wod;
    update public.box_elo_history set created_at = v_date::timestamptz + interval '21 hours' where wod_id = v_wod;
  end if;

  perform public._demo_log('wod_scores', id::text)      from public.wod_scores      where wod_id = v_wod;
  perform public._demo_log('wod_completions', id::text) from public.wod_completions where wod_id = v_wod;
  perform public._demo_log('elo_history', id::text)     from public.elo_history     where wod_id = v_wod;
  perform public._demo_log('box_elo_history', id::text) from public.box_elo_history where wod_id = v_wod;
end $$;
