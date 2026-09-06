-- LOT 3 : UN match de bracket, rejoué à sa place dans le flux d'événements chronologique.
-- Le trigger trg_bracket_match_elo (actif) écrit tournament_match_elo_history et met à jour
-- profiles.elo/total_matches/wins ; l'historique est ensuite daté à la fin réelle du match.
do $$
declare
  p demo_stg.match_plan%rowtype;
begin
  select * into p from demo_stg.match_plan where match_ref = '{{MATCH_REF}}';
  if p.match_ref is null then raise exception 'match % absent du plan', '{{MATCH_REF}}'; end if;
  if exists (select 1 from public.tournament_bracket_matches where id = p.match_id) then
    raise exception 'match % déjà inséré', p.match_ref;
  end if;
  if p.status = 'completed' and p.completed_at > now() then
    raise exception 'match % terminé dans le futur', p.match_ref;
  end if;

  insert into public.tournament_bracket_matches
    (id, tournament_id, round, match_number, side, participant1_id, participant2_id, winner_id, loser_id,
     status, scheduled_at, completed_at, notes, created_at)
  values (p.match_id, p.tournament_id, p.round, p.match_number, p.side, p.participant1_id, p.participant2_id,
          p.winner_id, p.loser_id, p.status, p.scheduled_at, p.completed_at, p.notes, p.created_at);

  update public.tournament_match_elo_history set created_at = p.completed_at where match_id = p.match_id;
end $$;
