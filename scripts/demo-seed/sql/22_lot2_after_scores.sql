-- LOT 2 (3/3) : compteurs de profil dérivés des scores insérés.
update public.profiles p
   set total_scores_submitted = c.n
  from (select ws.member_id, count(*) n from public.wod_scores ws where ws.box_id = '{{BOX_ID}}' group by 1) c
 where p.id = c.member_id
   and exists (select 1 from demo_stg.member_map mm where mm.user_id = p.id);

select
  (select count(*) from public.wod_scores where box_id = '{{BOX_ID}}')       as scores,
  (select count(*) from public.elo_history where box_id = '{{BOX_ID}}')      as elo_rows,
  (select count(distinct wod_id) from public.elo_history where box_id = '{{BOX_ID}}') as wods_computed,
  (select elo from public.profiles where email = 'nbstylz+appledemo@gmail.com') as demo_elo;
