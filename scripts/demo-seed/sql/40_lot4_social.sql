-- LOT 4 : badges (catalogue prod), compteurs de reps, amis, actualités, streaks.
do $$
declare
  v_owner uuid := (select user_id from demo_stg.member_map where member_ref = 'owner');
  v_box   uuid := '{{BOX_ID}}';
  v_anchor date := (select value::date from demo_stg.params where key = 'anchor');
begin
  if exists (select 1 from public.box_articles where box_id = v_box) then
    raise exception 'la box démo a déjà des actualités (lot 4 déjà joué ?)';
  end if;

  -- ── Compteurs de reps par mouvement ─────────────────────────────────────
  insert into public.movement_rep_counts (athlete_id, movement_key, movement_label, total_reps, last_updated)
  select mm.user_id,
         case r.mouvement when 'rope_climb' then 'chest_to_bar' else r.mouvement end,
         case r.mouvement
           when 'squat' then 'Squat' when 'deadlift' then 'Deadlift' when 'pull_up' then 'Pull-up'
           when 'double_under' then 'Double-under' when 'wall_ball' then 'Wall ball' when 'clean_and_jerk' then 'Clean & jerk'
           when 'toes_to_bar' then 'Toes-to-bar' when 'hspu' then 'HSPU' when 'ring_muscle_up' then 'Ring muscle-up'
           when 'snatch' then 'Snatch' when 'box_jump' then 'Box jump' when 'chest_to_bar' then 'Chest-to-bar'
           when 'rope_climb' then 'Chest-to-bar' else initcap(replace(r.mouvement, '_', ' ')) end,
         r.total_reps::int,
         (v_anchor - 3)::timestamptz + interval '20 hours'
    from demo_stg.movement_reps r join demo_stg.member_map mm on mm.member_ref = r.member_ref
  on conflict (athlete_id, movement_key) do update set total_reps = movement_rep_counts.total_reps + excluded.total_reps;
  perform public._demo_log('movement_rep_counts', c.id::text)
     from public.movement_rep_counts c join demo_stg.member_map mm on mm.user_id = c.athlete_id;

  -- ── Badges mouvements (débloqués uniquement ; les verrouillés restent absents = affichés grisés) ──
  insert into public.athlete_badges (athlete_id, badge_key, achieved_at)
  select mm.user_id, b.badge_key,
         (v_anchor - 40 + (abs(hashtext(b.member_ref || b.badge_key)) % 38))::timestamptz + interval '20 hours'
    from demo_stg.badges b join demo_stg.member_map mm on mm.member_ref = b.member_ref
   where b.debloque = 'true'
  on conflict (athlete_id, badge_key) do nothing;

  -- ── Badges génériques dérivés des données réellement insérées ───────────
  insert into public.athlete_badges (athlete_id, badge_key, achieved_at)
  select * from (
    -- premier score / premier pas
    select ws.member_id, 'first_score', min(ws.submitted_at) from public.wod_scores ws where ws.box_id = v_box group by 1
    union all
    select ws.member_id, 'first_step', min(ws.submitted_at) from public.wod_scores ws where ws.box_id = v_box group by 1
    union all
    -- palier de niveau
    select p.id, 'level_' || replace(p.level, 'rx+', 'rx_plus'), p.created_at + interval '1 day'
      from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id where mm.member_ref <> 'owner'
    union all
    -- première victoire (WOD gagné ou match de bracket gagné)
    select p.id, 'first_win', (v_anchor - 30)::timestamptz + interval '20 hours'
      from public.profiles p join demo_stg.member_map mm on mm.user_id = p.id where p.wins > 0
    union all
    -- podium : vainqueur d'une grande finale
    select bm.winner_id, 'podium', bm.completed_at
      from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id
     where t.box_id = v_box and bm.side = 'grand_final' and bm.status = 'completed'
    union all
    -- streaks
    select mm.user_id, 'streak_1w', (v_anchor - 7 * (m.streak::int - 1))::timestamptz + interval '20 hours'
      from demo_stg.members m join demo_stg.member_map mm on mm.member_ref = m.member_ref where m.streak::int >= 1
    union all
    select mm.user_id, 'streak_3w', (v_anchor - 7 * (m.streak::int - 3))::timestamptz + interval '20 hours'
      from demo_stg.members m join demo_stg.member_map mm on mm.member_ref = m.member_ref where m.streak::int >= 3
    union all
    -- polyvalence : >= 5 mouvements à 100 reps
    select c.athlete_id, 'mv_polyvalent_5', max(c.last_updated) from public.movement_rep_counts c
      join demo_stg.member_map mm on mm.user_id = c.athlete_id where c.total_reps >= 100 group by 1 having count(*) >= 5
    union all
    select c.athlete_id, 'mv_polyvalent_10', max(c.last_updated) from public.movement_rep_counts c
      join demo_stg.member_map mm on mm.user_id = c.athlete_id where c.total_reps >= 100 group by 1 having count(*) >= 10
    union all
    select c.athlete_id, 'mv_total_10k', max(c.last_updated) from public.movement_rep_counts c
      join demo_stg.member_map mm on mm.user_id = c.athlete_id group by 1 having sum(c.total_reps) >= 10000
  ) g(athlete_id, badge_key, achieved_at)
  on conflict (athlete_id, badge_key) do nothing;

  -- ── Amis (acceptés) ────────────────────────────────────────────────────
  insert into public.friendships (requester_id, addressee_id, status, created_at, updated_at)
  select case when (abs(hashtext(f.ami_ref)) % 2) = 0 then a.user_id else b.user_id end,
         case when (abs(hashtext(f.ami_ref)) % 2) = 0 then b.user_id else a.user_id end,
         'accepted',
         (v_anchor - 35 + (abs(hashtext(f.member_ref || f.ami_ref)) % 30))::timestamptz + interval '12 hours',
         (v_anchor - 35 + (abs(hashtext(f.member_ref || f.ami_ref)) % 30))::timestamptz + interval '18 hours'
    from demo_stg.friends f
    join demo_stg.member_map a on a.member_ref = f.member_ref
    join demo_stg.member_map b on b.member_ref = f.ami_ref
   where f.statut = 'accepted'
  on conflict (requester_id, addressee_id) do nothing;
  perform public._demo_log('friendships', fr.id::text)
     from public.friendships fr join demo_stg.member_map mm on mm.user_id in (fr.requester_id, fr.addressee_id);

  insert into public.athlete_badges (athlete_id, badge_key, achieved_at)
  select x.uid, 'social_5', max(x.created_at) from (
    select requester_id uid, created_at from public.friendships where status = 'accepted'
    union all select addressee_id, created_at from public.friendships where status = 'accepted') x
    join demo_stg.member_map mm on mm.user_id = x.uid
   group by 1 having count(*) >= 5
  on conflict (athlete_id, badge_key) do nothing;

  perform public._demo_log('athlete_badges', ab.id::text)
     from public.athlete_badges ab join demo_stg.member_map mm on mm.user_id = ab.athlete_id;

  update public.profiles p
     set total_friends = (select count(*) from public.friendships f
                           where f.status = 'accepted' and p.id in (f.requester_id, f.addressee_id))
    from demo_stg.member_map mm where mm.user_id = p.id;

  -- ── Actualités ──────────────────────────────────────────────────────────
  insert into public.box_articles (box_id, author_id, title, body, created_at)
  select v_box, v_owner, n.titre, n.contenu, least(demo_stg.d(n.jour)::timestamptz + interval '9 hours', now() - interval '1 hour')
    from demo_stg.box_news n;
  perform public._demo_log('box_articles', id::text) from public.box_articles where box_id = v_box;

  -- ── Streaks (semaine en cours = semaine de l'ancre) ─────────────────────
  insert into public.athlete_streaks (athlete_id, current_streak, longest_streak, week_session_count, week_start, updated_at)
  select mm.user_id, m.streak::int, greatest(m.streak::int, (m.streak::int * 3) / 2),
         (select count(*) from public.class_reservations r join public.class_schedules s on s.id = r.schedule_id
           where r.member_id = mm.user_id and r.attended and s.scheduled_date >= v_anchor),
         v_anchor, now()
    from demo_stg.members m join demo_stg.member_map mm on mm.member_ref = m.member_ref
  on conflict (athlete_id) do update
    set current_streak = excluded.current_streak, longest_streak = excluded.longest_streak,
        week_session_count = excluded.week_session_count, week_start = excluded.week_start, updated_at = now();
  perform public._demo_log('athlete_streaks', s.athlete_id::text)
     from public.athlete_streaks s join demo_stg.member_map mm on mm.user_id = s.athlete_id;
end $$;

select
  (select count(*) from public.athlete_badges ab join public.profiles p on p.id = ab.athlete_id where p.email = 'nbstylz+appledemo@gmail.com') as demo_badges,
  (select total_friends from public.profiles where email = 'nbstylz+appledemo@gmail.com') as demo_friends,
  (select count(*) from public.box_articles where box_id = '{{BOX_ID}}') as articles;
