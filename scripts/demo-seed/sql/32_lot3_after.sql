-- LOT 3 (fin) : journal des matchs et de leur historique, compteurs de profil dérivés.
do $$
declare
  v_box uuid := '{{BOX_ID}}';
begin
  perform public._demo_log('tournament_bracket_matches', bm.id::text)
     from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = v_box;
  perform public._demo_log('tournament_match_elo_history', h.id::text)
     from public.tournament_match_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = v_box;

  update public.profiles p
     set total_scores_submitted = c.n
    from (select ws.member_id, count(*) n from public.wod_scores ws where ws.box_id = v_box group by 1) c
   where p.id = c.member_id
     and exists (select 1 from demo_stg.member_map mm where mm.user_id = p.id);

  update public.profiles p
     set total_tournaments = c.n,
         total_tournament_wins = coalesce(w.n, 0)
    from (select tp.athlete_id, count(*) n from public.tournament_participants tp
            join public.tournaments t on t.id = tp.tournament_id where t.box_id = v_box group by 1) c
    left join (select bm.winner_id athlete_id, count(*) n from public.tournament_bracket_matches bm
                 join public.tournaments t on t.id = bm.tournament_id
                where t.box_id = v_box and bm.status = 'completed' and bm.side = 'grand_final'
                group by 1) w on w.athlete_id = c.athlete_id
   where p.id = c.athlete_id;
end $$;

select
  (select count(*) from public.wod_scores where box_id = '{{BOX_ID}}') as scores,
  (select count(distinct wod_id) from public.elo_history where box_id = '{{BOX_ID}}') as wods_computed,
  (select count(*) from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = '{{BOX_ID}}') as matches,
  (select count(*) from public.tournament_match_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}') as match_elo_rows,
  (select elo from public.profiles where email = 'nbstylz+appledemo@gmail.com') as demo_elo;
