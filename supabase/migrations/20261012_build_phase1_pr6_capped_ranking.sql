-- Build Phase 1 — PR6 : tri des scores « capped » (temps limite atteint).
--
-- Convention CrossFit sur un for-time avec time cap :
--   finisher → score_value = TEMPS en secondes, classé par temps croissant ;
--   capped   → score_value = REPS complétées,  classé APRÈS tous les finishers,
--              entre capped par reps décroissantes.
--
-- La colonne `capped` existe depuis 20261008 (additive, DEFAULT false). Tant
-- qu'aucune ligne n'a capped=true, l'ordre produit ici est IDENTIQUE à l'ancien :
-- le prédicat capped est constant à false, les CASE dégénèrent vers les branches
-- actuelles et la partition élargie ne sépare rien.
--
-- Encodage HÉRITÉ : avant la colonne `capped`, l'app encodait un cap en
-- score_value = 999999 + reps (DNF_BASE). Ces lignes existent en base (2 en prod
-- à ce jour). Les fonctions les normalisent ici (capped = true, valeur = reps)
-- pour que l'ordre soit correct SANS réécrire de données historiques — une
-- réécriture casserait l'affichage des binaires déjà installés.
--
-- Écart assumé vs spec : le drapeau est neutralisé hors for-time
-- (`v_is_time AND capped`, `v_type = 'For Time' AND capped`). Un capped=true
-- écrit par erreur sur un AMRAP ne peut donc pas reléguer l'athlète en fin de
-- classement — la non-régression AMRAP est structurelle, pas conventionnelle.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. compute_wod_elo (box, score_value numérique)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_wod_elo(p_wod_id uuid)
 RETURNS TABLE(member_id uuid, elo_before integer, elo_after integer, elo_delta integer, rank integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    SELECT ws.member_id, COALESCE(p.elo, 1000)::int AS elo,
           CASE WHEN v_is_time AND ws.score_value >= 999999
                THEN ws.score_value - 999999 ELSE ws.score_value END AS score_value,
           COALESCE(ws.rx, false) AS rx,
           (v_is_time AND (COALESCE(ws.capped, false) OR ws.score_value >= 999999)) AS capped
      FROM wod_scores ws JOIN profiles p ON p.id = ws.member_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      (CASE WHEN s.capped THEN 1 ELSE 0 END) ASC,
                      CASE WHEN v_is_time AND NOT s.capped THEN s.score_value END ASC,
                      CASE WHEN v_is_time AND     s.capped THEN s.score_value END DESC,
                      CASE WHEN NOT v_is_time              THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    -- Partition élargie à capped : un capped à 100 reps ne doit pas égaliser un
    -- finisher à 100 s (même score_value, sens opposé).
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.capped, o.score_value) AS rnk FROM ordered o
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. compute_box_elo (ELO propre à la box, même champ de scores)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_box_elo(p_wod_id uuid)
 RETURNS TABLE(member_id uuid, elo_before integer, elo_after integer, elo_delta integer, rank integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    SELECT ws.member_id, COALESCE(be.elo, 1000)::int AS elo,
           CASE WHEN v_is_time AND ws.score_value >= 999999
                THEN ws.score_value - 999999 ELSE ws.score_value END AS score_value,
           COALESCE(ws.rx, false) AS rx,
           (v_is_time AND (COALESCE(ws.capped, false) OR ws.score_value >= 999999)) AS capped
      FROM wod_scores ws
      LEFT JOIN box_elo be ON be.member_id = ws.member_id AND be.box_id = v_box_id
     WHERE ws.wod_id = p_wod_id
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      (CASE WHEN s.capped THEN 1 ELSE 0 END) ASC,
                      CASE WHEN v_is_time AND NOT s.capped THEN s.score_value END ASC,
                      CASE WHEN v_is_time AND     s.capped THEN s.score_value END DESC,
                      CASE WHEN NOT v_is_time              THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.capped, o.score_value) AS rnk FROM ordered o
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. compute_daily_tournament_elo (score_mode = 'time')
-- ─────────────────────────────────────────────────────────────────────────────
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
    SELECT s.user_id, COALESCE(p.elo, 1000)::int AS elo,
           CASE WHEN v_is_time AND s.score_value >= 999999
                THEN s.score_value - 999999 ELSE s.score_value END AS score_value,
           COALESCE(s.rx, false) AS rx,
           (v_is_time AND (COALESCE(s.capped, false) OR s.score_value >= 999999)) AS capped
      FROM daily_tournament_scores s JOIN profiles p ON p.id = s.user_id
     WHERE s.tournament_id = p_tournament_id
       AND COALESCE(s.status, 'pending') <> 'contested'
  ),
  ordered AS (
    SELECT s.*, ROW_NUMBER() OVER (
             ORDER BY (CASE WHEN s.rx THEN 0 ELSE 1 END) ASC,
                      (CASE WHEN s.capped THEN 1 ELSE 0 END) ASC,
                      CASE WHEN v_is_time AND NOT s.capped THEN s.score_value END ASC,
                      CASE WHEN v_is_time AND     s.capped THEN s.score_value END DESC,
                      CASE WHEN NOT v_is_time              THEN s.score_value END DESC
           ) AS seq
      FROM scores s
  ),
  ranked AS (
    SELECT o.*, MIN(o.seq) OVER (PARTITION BY o.rx, o.capped, o.score_value) AS rnk FROM ordered o
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. compute_league_wod_elo (score_value TEXTE, partition par division)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_league_wod_elo(p_tournament_wod_id uuid)
 RETURNS TABLE(athlete_id uuid, division_id uuid, elo_before integer, elo_after integer, elo_delta integer, rank integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_tournament_id uuid;
  v_type          text;
  v_format        text;
  k_wod           constant numeric := 64;
BEGIN
  SELECT tw.tournament_id, tw.type INTO v_tournament_id, v_type
    FROM tournament_wods tw WHERE tw.id = p_tournament_wod_id;
  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  IF NOT is_tournament_manager(v_tournament_id) THEN
    RAISE EXCEPTION 'Not authorized: only the box owner/coach or an admin can manage this tournament';
  END IF;

  SELECT format INTO v_format FROM tournaments WHERE id = v_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RAISE EXCEPTION 'ELO par WOD réservé aux ligues (league_div)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lw:' || p_tournament_wod_id::text));

  IF EXISTS (SELECT 1 FROM tournament_wod_elo_history h WHERE h.tournament_wod_id = p_tournament_wod_id) THEN
    RETURN;
  END IF;

  -- Ranked field per division for this WOD (numeric, direction by WOD type).
  CREATE TEMP TABLE _lw_field ON COMMIT DROP AS
  WITH scored AS (
    SELECT ts.athlete_id,
           tdm.division_id,
           COALESCE(p.elo, 1000)::int AS elo,
           CASE WHEN v_type = 'For Time'
                 AND NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric >= 999999
                THEN NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric - 999999
                ELSE NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric END AS num,
           (v_type = 'For Time'
             AND (COALESCE(ts.capped, false)
                  OR NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric >= 999999)) AS capped
      FROM tournament_scores ts
      JOIN tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
      JOIN tournament_divisions d ON d.id = tdm.division_id AND d.tournament_id = v_tournament_id
      JOIN profiles p ON p.id = ts.athlete_id
     WHERE ts.tournament_wod_id = p_tournament_wod_id
       AND ts.status = 'validated'
  ),
  ranked AS (
    SELECT s.*,
           ROW_NUMBER() OVER (
             PARTITION BY s.division_id
             ORDER BY
               (CASE WHEN s.capped THEN 1 ELSE 0 END) ASC,
               CASE WHEN v_type = 'For Time' AND NOT s.capped
                    THEN COALESCE(s.num,  'Infinity'::numeric) END ASC  NULLS LAST,
               CASE WHEN v_type = 'For Time' AND     s.capped
                    THEN COALESCE(s.num, '-Infinity'::numeric) END DESC NULLS LAST,
               CASE WHEN v_type <> 'For Time'
                    THEN COALESCE(s.num, '-Infinity'::numeric) END DESC NULLS LAST
           )::int AS rank,
           COUNT(*) OVER (PARTITION BY s.division_id)::int AS div_n
      FROM scored s
  )
  SELECT athlete_id, division_id, elo, rank, div_n FROM ranked;

  -- Pairwise ELO within each division for this WOD.
  CREATE TEMP TABLE _lw_deltas ON COMMIT DROP AS
  SELECT a.athlete_id, a.division_id, a.elo AS elo_before, a.rank,
         ROUND(
           (k_wod / GREATEST(1, (a.div_n - 1))) * (
             (SELECT COALESCE(SUM(CASE WHEN a.rank < b.rank THEN 1
                                       WHEN a.rank = b.rank THEN 0.5
                                       ELSE 0 END), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
             - (SELECT COALESCE(SUM(1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _lw_field b
               WHERE b.division_id = a.division_id AND b.athlete_id <> a.athlete_id)
           )
         )::int AS elo_delta
    FROM _lw_field a
   WHERE a.div_n >= 2;

  INSERT INTO tournament_wod_elo_history
    (tournament_wod_id, tournament_id, division_id, athlete_id, elo_before, elo_after, elo_delta, rank)
  SELECT p_tournament_wod_id, v_tournament_id, d.division_id, d.athlete_id,
         d.elo_before, GREATEST(100, d.elo_before + d.elo_delta),
         GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before, d.rank
    FROM _lw_deltas d
  ON CONFLICT (tournament_wod_id, athlete_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = GREATEST(100, d.elo_before + d.elo_delta),
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _lw_deltas d
   WHERE p.id = d.athlete_id;

  RETURN QUERY
    SELECT d.athlete_id, d.division_id, d.elo_before,
           GREATEST(100, d.elo_before + d.elo_delta) AS elo_after,
           GREATEST(100, d.elo_before + d.elo_delta) - d.elo_before AS elo_delta,
           d.rank
      FROM _lw_deltas d;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. recalc_division_points (points de division, même convention de tri)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_division_points(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_format text;
BEGIN
  SELECT format INTO v_format FROM public.tournaments WHERE id = p_tournament_id;
  IF v_format IS DISTINCT FROM 'league_div' THEN
    RETURN;
  END IF;

  UPDATE public.tournament_division_members tdm
  SET points = 0
  FROM public.tournament_divisions d
  WHERE d.id = tdm.division_id
    AND d.tournament_id = p_tournament_id;

  WITH scored AS (
    SELECT
      tdm.id AS member_id,
      ts.tournament_wod_id,
      tdm.division_id,
      (tw.type = 'For Time') AS is_time,
      NULLIF(substring(ts.score_value from '^(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric AS raw_num,
      COALESCE(ts.capped, false) AS raw_capped
    FROM public.tournament_scores ts
    JOIN public.tournament_wods tw ON tw.id = ts.tournament_wod_id
    JOIN public.tournament_division_members tdm ON tdm.athlete_id = ts.athlete_id
    JOIN public.tournament_divisions d ON d.id = tdm.division_id
    WHERE d.tournament_id = p_tournament_id
      AND ts.tournament_id = p_tournament_id
      AND ts.status = 'validated'
  ),
  normalized AS (
    -- Normalisation de l'encodage hérité DNF_BASE (999999 + reps).
    SELECT s.member_id, s.tournament_wod_id, s.division_id, s.is_time,
           CASE WHEN s.is_time AND s.raw_num >= 999999 THEN s.raw_num - 999999 ELSE s.raw_num END AS num,
           (s.is_time AND (s.raw_capped OR s.raw_num >= 999999)) AS capped
      FROM scored s
  ),
  ranked AS (
    SELECT
      n.member_id,
      ROW_NUMBER() OVER (
        PARTITION BY n.tournament_wod_id, n.division_id
        ORDER BY
          (CASE WHEN n.capped THEN 1 ELSE 0 END) ASC,
          CASE WHEN n.is_time AND NOT n.capped
               THEN COALESCE(n.num,  'Infinity'::numeric) END ASC  NULLS LAST,
          CASE WHEN n.is_time AND     n.capped
               THEN COALESCE(n.num, '-Infinity'::numeric) END DESC NULLS LAST,
          CASE WHEN NOT n.is_time
               THEN COALESCE(n.num, '-Infinity'::numeric) END DESC NULLS LAST
      ) AS rk
    FROM normalized n
  ),
  totals AS (
    SELECT member_id, SUM(GREATEST(1, 100 - (rk::int - 1) * 3)) AS pts
    FROM ranked
    GROUP BY member_id
  )
  UPDATE public.tournament_division_members tdm
  SET points = totals.pts
  FROM totals
  WHERE tdm.id = totals.member_id;
END;
$function$;
