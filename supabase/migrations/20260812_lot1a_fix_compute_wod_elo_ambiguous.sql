-- Lot 1A — correctif #2 : compute_wod_elo « column reference "member_id" is ambiguous ».
--
-- Bug PRÉ-EXISTANT (hors patch 1A, identique à celui corrigé pour l'ELO daily au 20260807) :
-- la fonction RETURNS TABLE(member_id ...) déclare une variable OUT `member_id`, qui entre
-- en conflit avec la colonne `user_movement_stats`/`elo_history`.member_id du
-- `ON CONFLICT (wod_id, member_id)` et des SELECT internes → chaque appel plante en 42P01/42702
-- et l'ELO des WOD de box n'a JAMAIS été distribué.
--
-- Fix : `#variable_conflict use_column` (les références ambiguës résolvent vers la COLONNE,
-- pas la variable OUT). Aucune autre ligne du corps n'est modifiée ; les colonnes de sortie
-- sont inchangées (le client lit toujours .member_id / .elo_delta / .rank).
--
-- Rétroactivité : distribution paresseuse acceptée (phase de test, RPC idempotent —
-- garde `IF EXISTS (... elo_history WHERE wod_id=p_wod_id) RETURN`). Les WOD de box déjà
-- notés distribueront leur ELO à leur prochain recalcul, une seule fois.

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
  -- Resolve the WOD + its box + scoring direction.
  SELECT bw.box_id,
         (bw.wod_type = 'for-time'),
         COALESCE(bw.leaderboard_enabled, true)
    INTO v_box_id, v_is_time, v_lb_enabled
    FROM box_wods bw
   WHERE bw.id = p_wod_id;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'WOD introuvable';
  END IF;

  -- Authorization: caller must be an active member (or the owner) of the box.
  IF NOT (
    is_box_owner(v_box_id) OR EXISTS (
      SELECT 1 FROM box_members bm
       WHERE bm.box_id = v_box_id
         AND bm.member_id = auth.uid()
         AND bm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT v_lb_enabled THEN
    RETURN;
  END IF;

  -- Serialize concurrent triggers for the same WOD so ELO is applied once.
  PERFORM pg_advisory_xact_lock(hashtext(p_wod_id::text));

  -- Idempotency: already computed.
  IF EXISTS (SELECT 1 FROM elo_history eh WHERE eh.wod_id = p_wod_id) THEN
    RETURN;
  END IF;

  -- Build the ranked field (RX before scaled, then by score direction),
  -- with tie handling identical to the client (same score AND same rx).
  CREATE TEMP TABLE _wod_field ON COMMIT DROP AS
  WITH scores AS (
    SELECT ws.member_id,
           COALESCE(p.elo, 1000)::int AS elo,
           ws.score_value,
           COALESCE(ws.rx, false)      AS rx
      FROM wod_scores ws
      JOIN profiles p ON p.id = ws.member_id
     WHERE ws.wod_id = p_wod_id
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
    -- Dense-ish rank: equal (rx, score_value) share the smallest seq.
    SELECT o.*,
           MIN(o.seq) OVER (PARTITION BY o.rx, o.score_value) AS rnk
      FROM ordered o
  )
  SELECT member_id, elo, rx, rnk::int AS rank FROM ranked;

  SELECT COUNT(*) INTO v_n FROM _wod_field;
  IF v_n < 2 THEN
    RETURN;
  END IF;

  -- Pairwise ELO deltas computed against every other player.
  CREATE TEMP TABLE _wod_deltas ON COMMIT DROP AS
  SELECT a.member_id,
         a.elo AS elo_before,
         a.rank,
         ROUND(
           ROUND( (k_pairwise / (v_n - 1)) * (
             -- actual score
             (SELECT COALESCE(SUM(
                CASE WHEN a.rank < b.rank THEN 1
                     WHEN a.rank = b.rank THEN 0.5
                     ELSE 0 END), 0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
             -- expected score
             - (SELECT COALESCE(SUM(
                  1 / (1 + POWER(10, (b.elo - a.elo) / 400.0))), 0)
                FROM _wod_field b WHERE b.member_id <> a.member_id)
           ) )
           * (CASE WHEN a.rx THEN 1 ELSE scaled_mult END)
         )::int AS elo_delta
    FROM _wod_field a;

  -- Persist history (unique on wod_id, member_id) + update profiles atomically.
  INSERT INTO elo_history (box_id, wod_id, member_id, elo_before, elo_after, elo_delta, rank)
  SELECT v_box_id, p_wod_id, d.member_id, d.elo_before, d.elo_before + d.elo_delta, d.elo_delta, d.rank
    FROM _wod_deltas d
  ON CONFLICT (wod_id, member_id) DO NOTHING;

  UPDATE profiles p
     SET elo           = d.elo_before + d.elo_delta,
         total_matches = p.total_matches + 1,
         wins          = p.wins + (CASE WHEN d.rank = 1 THEN 1 ELSE 0 END)
    FROM _wod_deltas d
   WHERE p.id = d.member_id;

  RETURN QUERY
    SELECT d.member_id, d.elo_before, (d.elo_before + d.elo_delta) AS elo_after, d.elo_delta, d.rank
      FROM _wod_deltas d;
END;
$function$

;

NOTIFY pgrst, 'reload schema';
