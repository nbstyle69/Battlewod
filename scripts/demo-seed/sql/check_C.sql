-- Contrôles C (après lot 3) : scores, brackets, ELO rejoué en ordre chronologique, tolérance démo.
-- @@ C1 tournois
select count(*) = 7 and count(*) filter (where status = 'completed') = 4 and count(*) filter (where status = 'active') = 1
       and count(*) filter (where status = 'open') = 2 as ok,
       'C1 7 tournois (4 terminés, 1 en cours, 2 ouverts)' as controle,
       string_agg(name || ':' || format || '/' || status || '/' || level, ', ' order by start_date) as detail
  from public.tournaments where box_id = '{{BOX_ID}}';
-- @@ C2 inscriptions
select sum(n) = 173 as ok, 'C2 173 inscriptions' as controle,
       string_agg(t.name || '=' || n || '/' || t.max_participants, ', ' order by t.start_date) as detail
  from (select tournament_id, count(*) n from public.tournament_participants group by 1) x
  join public.tournaments t on t.id = x.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ C3 inter-box 47/64
select count(*) = 47 and t.max_participants = 64 and t.status = 'open' and t.format = 'simple' as ok,
       'C3 Inter-box Rhône : 47/64, ouvert, simple' as controle,
       format('inscrits=%s places=%s statut=%s', count(*), t.max_participants, t.status) as detail
  from public.tournaments t join public.tournament_participants tp on tp.tournament_id = t.id
 where t.box_id = '{{BOX_ID}}' and t.name = 'Inter-box Rhone' group by t.id;
-- @@ C4 matchs
select count(*) = 135 and count(*) filter (where bm.status = 'completed') = (select count(*) from demo_stg.tournament_matches where statut = 'termine')
       and count(*) filter (where bm.status = 'completed' and (bm.winner_id is null or bm.completed_at is null)) = 0 as ok,
       'C4 135 matchs, terminés = CSV, vainqueur + date sur chaque terminé' as controle,
       format('matchs=%s terminés=%s en_attente=%s grand_final=%s', count(*), count(*) filter (where bm.status='completed'),
              count(*) filter (where bm.status='pending'), count(*) filter (where bm.side='grand_final')) as detail
  from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ C5 démo en demi-finale WB du #3
select count(*) = 1 and bool_and(bm.status = 'pending' and bm.round = 4 and bm.side = 'winner') as ok,
       'C5 démo en demi-finale (winner bracket, tour 4, en attente) de Battle AthleX #3' as controle,
       string_agg(format('tour=%s side=%s statut=%s', bm.round, bm.side, bm.status), ', ') as detail
  from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id
 where t.box_id = '{{BOX_ID}}' and t.name = 'Battle AthleX #3' and bm.status = 'pending'
   and (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com') in (bm.participant1_id, bm.participant2_id);
-- @@ C6 historique ELO des matchs
select count(*) = 2 * (select count(*) from public.tournament_bracket_matches bm join public.tournaments t on t.id = bm.tournament_id
                        where t.box_id = '{{BOX_ID}}' and bm.status = 'completed') as ok,
       'C6 tournament_match_elo_history : 2 lignes par match terminé (trigger actif)' as controle,
       format('lignes=%s wins=%s losses=%s', count(*), count(*) filter (where result='win'), count(*) filter (where result='loss')) as detail
  from public.tournament_match_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ C7 ELO démo
select p.elo between 1200 and 1320 as ok, 'C7 ELO démo dans [1200, 1320] après brackets' as controle,
       format('elo=%s matches=%s wins=%s', p.elo, p.total_matches, p.wins) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ C8 rang démo
with r as (select p.id, rank() over (order by p.elo desc) rk from public.profiles p
             join public.box_members bm on bm.member_id = p.id and bm.box_id = '{{BOX_ID}}' and bm.role <> 'owner')
select rk between 8 and 15 as ok, 'C8 rang démo dans la box entre 8 et 15' as controle, format('rang=#%s/150', rk) as detail
  from r where id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com');
-- @@ C9 chaîne ELO chronologique
with h as (
  select member_id, created_at, elo_before, elo_after, elo_delta, 'wod' src from public.elo_history where box_id = '{{BOX_ID}}'
  union all
  select h.athlete_id, h.created_at, h.elo_before, h.elo_after, h.elo_delta, 'match' from public.tournament_match_elo_history h
    join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}'
), c as (
  select *, lag(elo_after) over (partition by member_id order by created_at) prev_after,
         lag(created_at) over (partition by member_id order by created_at) prev_at,
         first_value(elo_before) over (partition by member_id order by created_at) first_before
    from h
), d as (
  select member_id,
         count(*) filter (where elo_after <> elo_before + elo_delta) bad_delta,
         count(*) filter (where prev_after is not null and elo_before <> prev_after) bad_chain,
         count(*) filter (where prev_at = created_at) ties,
         min(first_before) first_before, (array_agg(elo_after order by created_at desc))[1] last_after, count(*) n
    from c group by member_id
), demo as (
  select d.*, p.elo, es.elo_depart::int elo_start from d join public.profiles p on p.id = d.member_id
    join demo_stg.member_map mm on mm.user_id = p.id join demo_stg.elo_start es on es.member_ref = mm.member_ref
   where p.email = 'nbstylz+appledemo@gmail.com'
)
select (select sum(bad_delta + bad_chain + ties) from d) = 0
       and (select count(*) from d join public.profiles p on p.id = d.member_id where p.elo <> d.last_after) = 0
       and demo.first_before = demo.elo_start and demo.last_after = demo.elo as ok,
       'C9 triée par date, chaque ligne (WOD ou match) enchaîne le point précédent (elo_before = elo_after précédent, after = before + delta), pour les 150 membres ; démo : départ = elo_start, arrivée = ELO profil' as controle,
       format('membres=%s ruptures_chaine=%s deltas_faux=%s doublons_date=%s | démo : points=%s départ=%s arrivée=%s profil=%s',
              (select count(*) from d), (select sum(bad_chain) from d), (select sum(bad_delta) from d), (select sum(ties) from d),
              demo.n, demo.first_before, demo.last_after, demo.elo) as detail
  from demo;
-- @@ C10 cohérence victoires
select p.wins = (select count(*) from public.elo_history eh where eh.member_id = p.id and eh.rank = 1)
                + (select count(*) from public.tournament_match_elo_history h where h.athlete_id = p.id and h.result = 'win') as ok,
       'C10 wins profil = WODs gagnés + matchs gagnés' as controle,
       format('wins=%s wod_wins=%s match_wins=%s', p.wins,
              (select count(*) from public.elo_history eh where eh.member_id = p.id and eh.rank = 1),
              (select count(*) from public.tournament_match_elo_history h where h.athlete_id = p.id and h.result = 'win')) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ C11 finalize non appelée
select count(*) = 0 as ok, 'C11 tournament_elo_history vide pour la box (finalize_tournament_elo non appelée)' as controle,
       format('lignes=%s', count(*)) as detail
  from public.tournament_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ C12 scores
select count(*) = (select count(*) from demo_stg.wod_scores s join demo_stg.wod_map wm on wm.wod_ref = s.wod_ref
                    join public.box_wods w on w.id = wm.wod_id where w.scheduled_date <= current_date)
       and count(*) filter (where submitted_at > now()) = 0 as ok,
       'C12 scores = CSV filtré à la date d''exécution, aucun dans le futur' as controle,
       format('scores=%s futurs=%s wods_scorés=%s', count(*), count(*) filter (where submitted_at > now()), count(distinct wod_id)) as detail
  from public.wod_scores where box_id = '{{BOX_ID}}';
-- @@ C13 courbe démo monte et descend
with h as (
  select created_at, elo_before, elo_after, elo_delta, 'wod' src from public.elo_history where member_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com')
  union all
  select created_at, elo_before, elo_after, elo_delta, 'match' from public.tournament_match_elo_history where athlete_id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com')
)
select count(*) >= 10 and count(*) filter (where elo_delta > 0) >= 3 and count(*) filter (where elo_delta < 0) >= 2
       and count(*) filter (where src = 'wod') >= 5 and count(*) filter (where src = 'match') >= 5
       and (select bool_or(m.src = 'match' and w.src = 'wod' and m.created_at < w.created_at) from h m, h w) as ok,
       'C13 courbe démo : WODs et matchs mêlés, ≥ 3 hausses et ≥ 2 baisses, au moins un match calculé avant un WOD postérieur' as controle,
       string_agg(elo_before || '>' || elo_after || '(' || src || ' ' || to_char(created_at, 'MM-DD') || ')', ' ' order by created_at) as detail
  from h;
-- @@ C14 plage ELO / box_elo
select min(p.elo) >= 900 and max(p.elo) <= 1500 and (select count(*) filter (where matches > 0) from public.box_elo where box_id = '{{BOX_ID}}') >= 140 as ok,
       'C14 ELO membres dans [900, 1500], ≥ 140 entrées box_elo actives' as controle,
       format('min=%s max=%s moy=%s box_elo_actives=%s', min(p.elo), max(p.elo), round(avg(p.elo)),
              (select count(*) filter (where matches > 0) from public.box_elo where box_id = '{{BOX_ID}}')) as detail
  from public.profiles p join public.box_members bm on bm.member_id = p.id and bm.box_id = '{{BOX_ID}}' and bm.role <> 'owner';
-- @@ C15 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'C15 NBS2 : relevé identique au lot 0' as controle, demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
