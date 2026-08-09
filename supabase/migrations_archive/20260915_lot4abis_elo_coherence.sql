-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 4A-bis — ELO : dernier chemin sans plancher + cohérence des historiques
-- Basé sur les DÉFINITIONS RÉELLES de prod (dump 4A-bis, intégral).
--
-- ÉTAT MESURÉ : sur les 8 chemins ELO, 7 plafonnent désormais à 100 (5 le
-- faisaient déjà, 2 corrigés au Lot 4A). Restent exactement deux défauts :
--
--  1. update_elo_after_match() (trigger sur `matches`, le 1v1 historique) :
--     AUCUN plancher — elle écrit brut le retour de calculate_elo(), donc
--     `elo = loser_elo - change` peut passer sous 100. C'est le dernier chemin
--     vivant qui le permet. Au passage : `select elo into ...` sans COALESCE →
--     un profil à elo NULL propagerait NULL dans calculate_elo puis dans
--     profiles.elo. On aligne sur les 7 autres (COALESCE 1000 + GREATEST 100).
--
--  2. Incohérence d'historique dans 3 fonctions qui plafonnent elo_after mais
--     stockent le delta BRUT : compute_box_elo, compute_tournament_elo,
--     compute_inter_competition_elo. Quand le plancher mord,
--     elo_before + elo_delta ≠ elo_after dans l'historique — exactement le
--     piège évité au 4A. Correctif : delta stocké = GREATEST(100, before+delta)
--     - before, comme le font déjà compute_league_wod_elo et
--     apply_bracket_match_elo. Corps repris VERBATIM, seules ces expressions
--     changent.
--
--  + 4.4 : policy box_members.member_see_boxmates = `box_id = get_user_box_id()`
--    — helper SINGULIER avec LIMIT 1 SANS ORDER BY : un membre multibox ne voit
--    les co-membres que d'UNE box, et laquelle dépend du plan d'exécution
--    (non déterministe). On passe au pluriel, forme déjà utilisée par les
--    policies d'articles et box_wods. get_user_box_id() (singulier) devient
--    orphelin → candidat 5.3 (code mort), on ne le supprime pas ici.
--
-- NOTE (constat Devin) : l'edge compute-elo-batch n'est PAS déployée — le RPC
-- est aujourd'hui l'unique source de vérité. L'edge du repo = code mort, à
-- trancher en 5.3.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. update_elo_after_match : plancher + COALESCE (corps sinon verbatim)
-- `matches.elo_change` garde le swing NOMINAL de calculate_elo (une seule
-- colonne pour les deux joueurs) ; les elo écrits, eux, sont plafonnés.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_elo_after_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
declare
  w_elo integer;
  l_elo integer;
  elo_result record;
  loser_id uuid;
begin
  if new.status = 'completed' and new.winner_id is not null and old.status != 'completed' then
    if new.winner_id = new.athlete1_id then
      loser_id := new.athlete2_id;
    else
      loser_id := new.athlete1_id;
    end if;

    select COALESCE(elo, 1000) into w_elo from profiles where id = new.winner_id;
    select COALESCE(elo, 1000) into l_elo from profiles where id = loser_id;

    select * into elo_result from calculate_elo(w_elo, l_elo);

    update profiles set
      elo = GREATEST(100, elo_result.new_winner_elo),
      wins = wins + 1,
      total_matches = total_matches + 1
    where id = new.winner_id;

    update profiles set
      elo = GREATEST(100, elo_result.new_loser_elo),
      losses = losses + 1,
      total_matches = total_matches + 1
    where id = loser_id;

    update matches set elo_change = elo_result.elo_change where id = new.id;
  end if;
  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 2. Cohérence delta stocké — compute_box_elo
-- Seuls changent : le delta dans box_elo_history et dans le RETURN.
-- (box_elo lui-même plafonnait déjà correctement.)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_box_elo(p_wod_id uuid)
RETURNS TABLE(member_id uuid, elo_before integer, elo_after integer, elo_delta integer, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_box_id     uuid;
  v_is_time    boolean;
  v_lb_enabled boolean;
  v_n          int;
  k_pairwise   constant numeric := 64;
  scaled_mult  constant numeric := 0.4;
BEGIN
  SELECT bw.box_id, (bw.wod_type = 'for-time'), COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN RAISE EXCEPTION 'WOD introuvable'; END IF;

  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id AND bm.member_id = auth.uid() AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('boxelo:' || p_wod_id::text));
  IF EXISTS (SELECT 1 FROM box_elo_history h WHERE h.wod_id = p_wod_id) THEN RETURN; END IF;

  CREATE TEMP TABLE _bx_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id, COALESCE(be.elo, 1000)::int AS elo, ws.score_value,
           COALESCE(ws.rx, false) AS rx
      FROM wod_scores ws
      LEFT JOIN box_elo be ON be.member_id = ws.member_id AND be.box_id = v_box_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _bx_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _bx_deltas ON COMMIT DROP AS
  SELECT a.member_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _bx_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _bx_field a;

  INSERT INTO box_elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,   -- ← cohérence
         d.rank
    FROM _bx_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  INSERT INTO box_elo (member_id, box_id, elo, matches, wins, updated_at)
  SELECT d.member_id, v_box_id,
         GREATEST(100, d.elo_before + d.elo_delta),
         1,
         (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END),
         now()
    FROM _bx_deltas d
  ON CONFLICT (member_id, box_id) DO UPDATE
     SET elo        = EXCLUDED.elo,
         matches    = box_elo.matches + 1,
         wins       = box_elo.wins + EXCLUDED.wins,
         updated_at = now();

  RETURN QUERY
    SELECT d.member_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _bx_deltas d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 3. Cohérence delta stocké — compute_tournament_elo
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_tournament_elo(p_tournament_id uuid)
RETURNS TABLE(athlete_id uuid, final_rank integer, elo_before integer, elo_after integer, elo_change integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_n      int;
  v_avg    int;
  v_format text;
  k_tourn  constant numeric := 48;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super_admin','box_owner')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = p_tournament_id;

  IF v_format IN ('bracket','swiss','league_div') THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('t:' || p_tournament_id::text));
  IF EXISTS (SELECT 1 FROM tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _t_field ON COMMIT DROP AS
  SELECT tp.athlete_id, COALESCE(p.elo, 1000)::int AS elo,
         ROW_NUMBER() OVER (ORDER BY tp.score DESC)::int AS rank
    FROM tournament_participants tp
    JOIN profiles p ON p.id = tp.athlete_id
   WHERE tp.tournament_id = p_tournament_id;

  SELECT COUNT(*) INTO v_n FROM _t_field;
  IF v_n < 2 THEN
    UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;
    RETURN;
  END IF;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _t_field;

  CREATE TEMP TABLE _t_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_tourn * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _t_field f;

  INSERT INTO tournament_elo_history
    (tournament_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_tournament_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change),
         GREATEST(100, d.elo_before + d.elo_change) - d.elo_before   -- ← cohérence
    FROM _t_deltas d
  ON CONFLICT (tournament_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _t_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_change) - d.elo_before AS elo_change
      FROM _t_deltas d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 4. Cohérence delta stocké — compute_inter_competition_elo
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_inter_competition_elo(p_competition_id uuid)
RETURNS TABLE(athlete_id uuid, final_rank integer, elo_before integer, elo_after integer, elo_change integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_n     int;
  v_wods  int;
  v_avg   int;
  k_inter constant numeric := 48;
BEGIN
  IF NOT public.is_inter_competition_manager(p_competition_id) THEN
    RAISE EXCEPTION 'Not authorized: only the competition creator or an admin can manage this competition';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ic:' || p_competition_id::text));
  IF EXISTS (SELECT 1 FROM inter_elo_history h WHERE h.competition_id = p_competition_id) THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT s.wod_id) INTO v_wods
    FROM inter_standings s WHERE s.competition_id = p_competition_id;

  CREATE TEMP TABLE _ic_base ON COMMIT DROP AS
  SELECT s.athlete_id, COALESCE(p.elo, 1000)::int AS elo,
         SUM(s.rank)::numeric AS rank_sum, COUNT(*)::int AS wods_done
    FROM inter_standings s JOIN profiles p ON p.id = s.athlete_id
   WHERE s.competition_id = p_competition_id AND s.athlete_id IS NOT NULL
   GROUP BY s.athlete_id, p.elo;

  SELECT COUNT(*) INTO v_n FROM _ic_base;
  IF v_n < 2 THEN
    UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;
    RETURN;
  END IF;

  CREATE TEMP TABLE _ic_field ON COMMIT DROP AS
  SELECT b.athlete_id, b.elo,
         (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) AS points,
         ROW_NUMBER() OVER (
           ORDER BY (b.rank_sum + (v_wods - b.wods_done) * (v_n + 1)) ASC, b.wods_done DESC, b.elo DESC
         )::int AS rank
    FROM _ic_base b;

  SELECT ROUND(AVG(elo))::int INTO v_avg FROM _ic_field;

  CREATE TEMP TABLE _ic_deltas ON COMMIT DROP AS
  SELECT f.athlete_id, f.elo AS elo_before, f.rank,
         ROUND( k_inter * (
           ((v_n - f.rank)::numeric / (v_n - 1))
           - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
         ) )::int AS elo_change
    FROM _ic_field f;

  INSERT INTO inter_elo_history
    (competition_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
  SELECT p_competition_id, d.athlete_id, d.rank, v_n, v_avg,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_change),
         GREATEST(100, d.elo_before + d.elo_change) - d.elo_before   -- ← cohérence
    FROM _ic_deltas d
  ON CONFLICT (competition_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_change),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _ic_deltas d
   WHERE p.id = d.athlete_id;

  UPDATE inter_competitions SET status = 'closed' WHERE id = p_competition_id;

  RETURN QUERY
    SELECT d.athlete_id, d.rank, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_change) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_change) - d.elo_before AS elo_change
      FROM _ic_deltas d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 5. (4.4) Visibilité des co-membres : multibox + déterminisme
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "member_see_boxmates" ON public.box_members;
CREATE POLICY "member_see_boxmates" ON public.box_members
  FOR SELECT
  USING (box_id IN (SELECT public.get_user_box_ids()));
-- get_user_box_id() (singulier, LIMIT 1 sans ORDER BY) est désormais orphelin
-- → à trancher en 5.3 (code mort). Non supprimé ici.

NOTIFY pgrst, 'reload schema';
