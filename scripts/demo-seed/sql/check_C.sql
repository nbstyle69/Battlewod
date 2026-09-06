-- Contrôles C (après lot 3) : tournois, brackets, ELO des matchs, tolérance démo.
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
select rk between 5 and 20 as ok, 'C8 rang démo dans la box entre 5 et 20' as controle, format('rang=#%s/150', rk) as detail
  from r where id = (select id from public.profiles where email = 'nbstylz+appledemo@gmail.com');
-- @@ C9 cohérence victoires
select p.wins = (select count(*) from public.elo_history eh where eh.member_id = p.id and eh.rank = 1)
                + (select count(*) from public.tournament_match_elo_history h where h.athlete_id = p.id and h.result = 'win') as ok,
       'C9 wins profil = WODs gagnés + matchs gagnés' as controle,
       format('wins=%s wod_wins=%s match_wins=%s', p.wins,
              (select count(*) from public.elo_history eh where eh.member_id = p.id and eh.rank = 1),
              (select count(*) from public.tournament_match_elo_history h where h.athlete_id = p.id and h.result = 'win')) as detail
  from public.profiles p where p.email = 'nbstylz+appledemo@gmail.com';
-- @@ C10 finalize non appelée
select count(*) = 0 as ok, 'C10 tournament_elo_history vide pour la box (finalize_tournament_elo non appelée)' as controle,
       format('lignes=%s', count(*)) as detail
  from public.tournament_elo_history h join public.tournaments t on t.id = h.tournament_id where t.box_id = '{{BOX_ID}}';
-- @@ C11 NBS2 intacte
select demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}') = (select value::jsonb from demo_stg.params where key = 'nbs2_snapshot') as ok,
       'C11 NBS2 : relevé identique au lot 0' as controle, demo_stg.nbs2_snapshot('{{NBS2_BOX_ID}}')::text as detail;
