-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 4A — Plancher ELO à 100 dans les RPC de calcul (4.11)
-- Basé sur les DÉFINITIONS RÉELLES de prod (reco Lot 4A §1).
--
-- CE QUI CLOCHE : deux chemins calculent l'ELO d'un WOD — le RPC SQL
-- compute_wod_elo et l'edge function compute-elo-batch. Même algo (K=64,
-- scaled ×0.4, pairwise, idempotent via elo_history : le premier à tourner
-- fige l'autre, donc PAS de double application). UNE seule divergence :
-- l'edge plafonne à 100 (ELO_FLOOR), le RPC non → un delta négatif peut, côté
-- RPC, faire passer profiles.elo sous 100 voire négatif.
--
-- CE QU'ON FAIT : on aligne le RPC sur l'edge en plafonnant à 100. Les deux
-- deviennent alors équivalents — la question « quelle source de vérité »
-- disparaît d'elle-même. Corps repris VERBATIM du dump ; seul l'elo_after
-- change, et l'elo_delta stocké est recalculé depuis la valeur plancher pour
-- que l'historique reste cohérent (elo_after = elo_before + elo_delta).
--
-- DONNÉES : min ELO en prod = 919, 0 sous 100 → le plancher n'a jamais mordu.
-- Aucune reprise. C'est de la prévention, pas une correction rétroactive.
--
-- PÉRIMÈTRE : ce lot ne touche QUE compute_wod_elo et compute_daily_tournament_elo
-- (les deux chemins à fort trafic). Les autres fonctions ELO du schéma
-- (compute_box_elo, compute_tournament_elo, compute_league_wod_elo,
--  compute_inter_competition_elo, apply_bracket_match_elo, update_elo_after_match)
-- recevront le même plancher en 4A-bis, une fois leurs définitions réelles
-- dumpées — on ne les réécrit pas à l'aveugle.
-- Idempotente (CREATE OR REPLACE, corps inchangé hors plancher).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_wod_elo(p_wod_id uuid)
RETURNS TABLE(member_id uuid, elo_before integer, elo_after integer, elo_delta integer, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_box_id       uuid;
  v_is_time      boolean;
  v_lb_enabled   boolean;
  v_n            int;
  k_pairwise     constant numeric := 64;
  scaled_mult    constant numeric := 0.4;
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

  PERFORM pg_advisory_xact_lock(hashtext(p_wod_id::text));
  IF EXISTS (SELECT 1 FROM elo_history eh WHERE eh.wod_id = p_wod_id) THEN RETURN; END IF;

  CREATE TEMP TABLE _wod_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id, COALESCE(p.elo, 1000)::int AS elo, ws.score_value,
           COALESCE(ws.rx, false) AS rx
      FROM wod_scores ws JOIN profiles p ON p.id = ws.member_id
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

  SELECT COUNT(*) INTO v_n FROM _wod_field;
  IF v_n < 2 THEN RETURN; END IF;

  CREATE TEMP TABLE _wod_deltas ON COMMIT DROP AS
  SELECT a.member_id, a.elo AS elo_before, a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1 WHEN a.rank = b.rank THEN 0.5 ELSE 0 END),0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))),0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _wod_field a;

  -- ── PLANCHER 100 : elo_after plafonné, elo_delta recalculé pour cohérence ──
  INSERT INTO elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,
         d.rank
    FROM _wod_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _wod_deltas d
   WHERE p.id = d.member_id;

  RETURN QUERY
    SELECT d.member_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _wod_deltas d;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_daily_tournament_elo(p_tournament_id uuid)
RETURNS TABLE(user_id uuid, elo_before integer, elo_after integer, elo_delta integer, final_rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_is_time   boolean;
  v_n         int;
  k_pairwise  constant numeric := 64;
  scaled_mult constant numeric := 0.4;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT (dt.score_mode = 'time') INTO v_is_time
    FROM daily_tournaments dt WHERE dt.id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournoi introuvable'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dt:' || p_tournament_id::text));
  IF EXISTS (SELECT 1 FROM daily_tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _dt_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT s.user_id, COALESCE(p.elo, 1000)::int AS elo, s.score_value,
           COALESCE(s.rx, false) AS rx
      FROM daily_tournament_scores s JOIN profiles p ON p.id = s.user_id
     WHERE s.tournament_id = p_tournament_id
       AND COALESCE(s.status, 'pending') <> 'contested'
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

  -- ── PLANCHER 100 (idem compute_wod_elo) ──
  INSERT INTO daily_tournament_elo_history (tournament_id, user_id, elo_before, elo_after, elo_delta, final_rank)
  SELECT p_tournament_id, d.user_id, d.elo_before,
         GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before,
         d.rank
    FROM _dt_deltas d
  ON CONFLICT (tournament_id, user_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _dt_deltas d
   WHERE p.id = d.user_id;

  RETURN QUERY
    SELECT d.user_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _dt_deltas d;
END;
$function$;

NOTIFY pgrst, 'reload schema';
