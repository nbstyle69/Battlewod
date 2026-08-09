-- Fix : compute_daily_tournament_elo échouait avec
--   "column reference \"user_id\" is ambiguous"
-- car la colonne `user_id` du CTE `ranked` n'était pas qualifiée et entrait en conflit avec
-- le paramètre de sortie de RETURNS TABLE(user_id uuid, ...). L'erreur était levée pour TOUT
-- daily -> l'ELO daily n'a jamais été distribué (daily_tournament_elo_history vide).
--
-- Le conflit venait de `ON CONFLICT (tournament_id, user_id)` : plpgsql résout `user_id` contre la
-- variable OUT `user_id` de RETURNS TABLE. Correctif : `#variable_conflict use_column` (les noms
-- ambigus résolvent vers la colonne). On ne renomme PAS les colonnes de sortie (le client lit
-- .user_id / .elo_delta). Les variables locales (v_*, k_*) ne collisionnent avec aucune colonne.
-- La fonction reste SECURITY DEFINER, idempotente (ON CONFLICT DO NOTHING + garde d'historique).

CREATE OR REPLACE FUNCTION public.compute_daily_tournament_elo(p_tournament_id uuid)
 RETURNS TABLE(user_id uuid, elo_before integer, elo_after integer, elo_delta integer, final_rank integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_is_time   boolean;
  v_n         int;
  k_pairwise  constant numeric := 64;
  scaled_mult constant numeric := 0.4;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT (dt.score_mode = 'time') INTO v_is_time
    FROM daily_tournaments dt WHERE dt.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournoi introuvable';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dt:' || p_tournament_id::text));

  IF EXISTS (SELECT 1 FROM daily_tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _dt_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT s.user_id,
           COALESCE(p.elo, 1000)::int AS elo,
           s.score_value,
           COALESCE(s.rx, false)      AS rx
      FROM daily_tournament_scores s
      JOIN profiles p ON p.id = s.user_id
     WHERE s.tournament_id = p_tournament_id
       -- Unresolved contested scores don't count toward ranking/ELO.
       AND COALESCE(s.status, 'pending') <> 'contested'
  ),
  ordered AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      CASE WHEN v_is_time THEN s.score_value END ASC,
                      CASE WHEN NOT v_is_time THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk
      FROM ordered o
  )
  SELECT r.user_id, r.elo, r.rx, r.rnk::int AS rank FROM ranked r;

  SELECT COUNT(*) INTO v_n FROM _dt_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _dt_deltas ON COMMIT DROP AS
  SELECT a.user_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _dt_field b WHERE b.user_id <> a.user_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _dt_field a;

  INSERT INTO daily_tournament_elo_history (tournament_id, user_id, elo_before, elo_after, elo_delta, final_rank)
  SELECT p_tournament_id, d.user_id, d.elo_before, d.elo_before + d.elo_delta, d.elo_delta, d.rank
    FROM _dt_deltas d
  ON CONFLICT (tournament_id, user_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = d.elo_before + d.elo_delta,
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _dt_deltas d
   WHERE p.id = d.user_id;

  RETURN QUERY
    SELECT d.user_id, d.elo_before, (d.elo_before + d.elo_delta) AS elo_after, d.elo_delta, d.rank
      FROM _dt_deltas d;
END;
$function$;
