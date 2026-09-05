-- ═══════════════════════════════════════════════════════════════════════════
-- ELO de tournoi — une seule fonction serveur, plus aucune écriture client.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Constat (recon du 5 septembre 2026) : le back-office web distribuait l'ELO
-- côté client en deux requêtes PostgREST — `profiles.update` puis
-- `tournament_elo_history.upsert`. La première est refusée par la RLS de
-- `profiles` (seul l'athlète modifie sa ligne) : PostgREST répond 204 avec
-- zéro ligne, sans erreur ; la seconde passe. Résultat : historique à jour,
-- profil figé (JCVD 1039 vs 1064, « in the bar » 1057 vs 1032).
--
-- Ce lot pose `finalize_tournament_elo(p_tournament_id)` :
--   · tous les formats (simple, bracket, swiss, league_div) ;
--   · classement calculé ici, avec la règle de `lib/tournamentScoring` portée
--     en SQL une seule fois (`tournament_classique_standings`) et celle de
--     `lib/bracket` (`tournament_bracket_standings`) ;
--   · `tournament_elo_history` et `profiles` écrits dans la même transaction,
--     puis l'invariant « profil = dernier elo_after » est vérifié avant de
--     rendre la main — la fonction refuse plutôt que de laisser un écart ;
--   · gérant ou co-gérant de la box du tournoi uniquement (le coach reste
--     dehors), `TO authenticated` ;
--   · idempotente par refus prononcé : une seconde clôture lève
--     TOURNOI_DEJA_CLOTURE et ne redistribue rien.
--
-- Formats à matchs (bracket, swiss) et ligue : l'ELO y est déjà distribué au
-- fil de l'eau par `apply_bracket_match_elo` (trigger) et
-- `compute_league_wod_elo`, atomiquement. La clôture n'ajoute donc PAS une
-- seconde couche de points (c'est ce que faisait le web : « Bracket » +23 pour
-- JCVD par-dessus les matchs) : elle fige le classement final et écrit une
-- ligne récapitulative par athlète (elo_before = avant le premier match,
-- elo_after = profil, elo_change = somme des matchs).
--
-- `compute_tournament_elo` (appelée par les bundles mobiles déjà installés)
-- devient un alias de la nouvelle fonction : un seul corps, une seule règle.

-- ── 0. parseScoreVal en SQL (lib/tournamentScoring.ts, même sémantique) ─────
-- "8:30" → 510 s, "1:02:03" → 3723, "42,5" → 42.5, "80 kg" → 80, "abc"/"" → NULL.
-- Chaque partie suit parseFloat : plus long préfixe numérique, sinon NULL.
CREATE OR REPLACE FUNCTION public.parse_score_val(p_raw text)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_s     text := btrim(COALESCE(p_raw, ''));
  v_part  text;
  v_num   text;
  v_acc   numeric := 0;
BEGIN
  IF v_s = '' THEN RETURN NULL; END IF;
  IF position(':' IN v_s) > 0 THEN
    FOREACH v_part IN ARRAY string_to_array(v_s, ':') LOOP
      v_num := substring(replace(v_part, ',', '.') from '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)');
      IF v_num IS NULL THEN RETURN NULL; END IF;   -- parseFloat → NaN
      v_acc := v_acc * 60 + v_num::numeric;
    END LOOP;
    RETURN v_acc;
  END IF;
  v_num := substring(regexp_replace(replace(v_s, ',', '.'), '[^0-9.]', '', 'g') from '^([0-9]+\.?[0-9]*|\.[0-9]+)');
  RETURN v_num::numeric;
END;
$$;

-- ── 1. Classement « Classique » : règle de lib/tournamentScoring en SQL ─────
-- Par WOD : finishers avant cappés, temps croissant / reps décroissantes,
-- score non parsable en queue de son groupe, ROW_NUMBER (deux ex-aequo n'ont
-- pas les mêmes points), 100 − 3·(rang−1) plancher 1, cumul par athlète.
-- Encodage hérité DNF_BASE (999999 + reps) normalisé. Même ORDER BY que
-- `recalc_division_points`. Tout participant sans score validé vaut 0 point.
CREATE OR REPLACE FUNCTION public.tournament_classique_standings(p_tournament_id uuid)
RETURNS TABLE (athlete_id uuid, points integer, final_rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  WITH scored AS (
    SELECT ts.athlete_id, ts.tournament_wod_id,
           (tw.type = 'For Time') AS is_time,
           public.parse_score_val(ts.score_value) AS raw_num,
           COALESCE(ts.capped, false) AS raw_capped,
           ts.tiebreak_value
      FROM public.tournament_scores ts
      JOIN public.tournament_wods tw ON tw.id = ts.tournament_wod_id
     WHERE ts.tournament_id = p_tournament_id
       AND ts.status = 'validated'
  ),
  normalized AS (
    SELECT s.athlete_id, s.tournament_wod_id, s.is_time, s.tiebreak_value,
           CASE WHEN s.is_time AND s.raw_num >= 999999 THEN s.raw_num - 999999 ELSE s.raw_num END AS num,
           (s.is_time AND (s.raw_capped OR s.raw_num >= 999999)) AS capped
      FROM scored s
  ),
  ranked AS (
    SELECT n.athlete_id, n.num,
           ROW_NUMBER() OVER (
             PARTITION BY n.tournament_wod_id
             ORDER BY
               (CASE WHEN n.capped THEN 1 ELSE 0 END) ASC,
               CASE WHEN n.is_time AND NOT n.capped
                    THEN COALESCE(n.num,  'Infinity'::numeric) END ASC  NULLS LAST,
               CASE WHEN n.is_time AND     n.capped
                    THEN COALESCE(n.num, '-Infinity'::numeric) END DESC NULLS LAST,
               CASE WHEN NOT n.is_time
                    THEN COALESCE(n.num, '-Infinity'::numeric) END DESC NULLS LAST,
               COALESCE(n.tiebreak_value, 'Infinity'::numeric) ASC,
               n.athlete_id::text ASC
           ) AS rk
      FROM normalized n
  ),
  totals AS (
    SELECT tp.athlete_id,
           COALESCE(SUM(GREATEST(1, 100 - (r.rk::int - 1) * 3)) FILTER (WHERE r.num IS NOT NULL), 0)::int AS points
      FROM public.tournament_participants tp
      LEFT JOIN ranked r ON r.athlete_id = tp.athlete_id
     WHERE tp.tournament_id = p_tournament_id
     GROUP BY tp.athlete_id
  )
  SELECT t.athlete_id, t.points,
         RANK() OVER (ORDER BY t.points DESC)::int AS final_rank
    FROM totals t;
$$;

-- ── 2. Classement d'un tableau : règle de lib/bracket en SQL ────────────────
-- Simple élimination : champion (vainqueur de la finale jamais battu) puis
-- rang par tour d'élimination décroissant ; les éliminés du même tour
-- partagent le rang (1, 2, 3, 3, 5…). Double élimination (« swiss ») : le
-- vainqueur de la grande finale est champion, son perdant 2e, puis les
-- éliminés du loser bracket par tour décroissant ; sans LB ni grande finale,
-- comportement de la simple élimination sur le winner bracket.
-- `still_alive` = tableau non terminé pour cet athlète.
CREATE OR REPLACE FUNCTION public.tournament_bracket_standings(p_tournament_id uuid)
RETURNS TABLE (athlete_id uuid, final_rank integer, still_alive boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_format   text;
  v_double   boolean;
  v_has_lb   boolean;
  v_max_wb   int;
  v_max_lb   int;
  v_champion uuid;
  v_runner   uuid;
BEGIN
  SELECT t.format INTO v_format FROM public.tournaments t WHERE t.id = p_tournament_id;
  v_double := (v_format = 'swiss');

  DROP TABLE IF EXISTS _bs_m;
  CREATE TEMP TABLE _bs_m ON COMMIT DROP AS
    SELECT m.round, COALESCE(m.side, 'winner') AS side, m.participant1_id, m.participant2_id,
           m.winner_id,
           COALESCE(m.loser_id,
                    CASE WHEN m.winner_id = m.participant1_id THEN m.participant2_id
                         WHEN m.winner_id = m.participant2_id THEN m.participant1_id END) AS loser_id
      FROM public.tournament_bracket_matches m
     WHERE m.tournament_id = p_tournament_id;

  SELECT EXISTS (SELECT 1 FROM _bs_m WHERE side IN ('loser', 'grand_final')) INTO v_has_lb;
  IF NOT v_double OR NOT v_has_lb THEN
    -- Simple élimination sur le winner bracket.
    SELECT MAX(round) INTO v_max_wb FROM _bs_m WHERE side = 'winner';
    SELECT m.winner_id INTO v_champion
      FROM _bs_m m
     WHERE m.side = 'winner' AND m.round = v_max_wb AND m.winner_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM _bs_m l WHERE l.side = 'winner' AND l.loser_id = m.winner_id)
     LIMIT 1;

    RETURN QUERY
      WITH p AS (
        SELECT DISTINCT pid FROM (
          SELECT participant1_id pid FROM _bs_m WHERE side = 'winner'
          UNION ALL SELECT participant2_id FROM _bs_m WHERE side = 'winner'
        ) u WHERE pid IS NOT NULL
      ),
      k AS (
        SELECT p.pid,
               (SELECT MAX(round) FROM _bs_m l WHERE l.side = 'winner' AND l.loser_id = p.pid) AS er
          FROM p
      ),
      keyed AS (
        SELECT k.pid,
               CASE WHEN k.pid = v_champion THEN 'Infinity'::numeric
                    WHEN k.er IS NULL THEN v_max_wb + 0.5
                    ELSE k.er END AS key,
               (k.pid <> COALESCE(v_champion, '00000000-0000-0000-0000-000000000000'::uuid) AND k.er IS NULL) AS alive
          FROM k
      )
      SELECT keyed.pid, RANK() OVER (ORDER BY keyed.key DESC)::int, keyed.alive FROM keyed;
    RETURN;
  END IF;

  -- Double élimination : WB + LB + grande finale.
  SELECT COALESCE(MAX(round), 0) INTO v_max_lb FROM _bs_m WHERE side = 'loser';
  SELECT m.winner_id, m.loser_id INTO v_champion, v_runner
    FROM _bs_m m WHERE m.side = 'grand_final' AND m.winner_id IS NOT NULL LIMIT 1;

  RETURN QUERY
    WITH p AS (
      SELECT DISTINCT pid FROM (
        SELECT participant1_id pid FROM _bs_m UNION ALL SELECT participant2_id FROM _bs_m
      ) u WHERE pid IS NOT NULL
    ),
    k AS (
      SELECT p.pid,
             (SELECT MAX(round) FROM _bs_m l WHERE l.side = 'loser' AND l.loser_id = p.pid) AS lb_round
        FROM p
    ),
    keyed AS (
      SELECT k.pid,
             CASE WHEN k.pid = v_champion THEN 'Infinity'::numeric
                  WHEN k.pid = v_runner   THEN v_max_lb + 2
                  WHEN k.lb_round IS NOT NULL THEN k.lb_round
                  ELSE v_max_lb + 1 END AS key,
             (k.pid IS DISTINCT FROM v_champion AND k.pid IS DISTINCT FROM v_runner AND k.lb_round IS NULL) AS alive
        FROM k
    )
    SELECT keyed.pid, RANK() OVER (ORDER BY keyed.key DESC)::int, keyed.alive FROM keyed;
END;
$$;

-- ── 3. La clôture ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_tournament_elo(p_tournament_id uuid)
RETURNS TABLE (
  athlete_id  uuid,
  username    text,
  final_rank  integer,
  elo_before  integer,
  elo_after   integer,
  elo_change  integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_box_id  uuid;
  v_format  text;
  v_status  text;
  v_n       int;
  v_avg     int;
  v_pending int;
  v_alive   int;
  v_bad     int;
  k_tourn   constant numeric := 48;
BEGIN
  SELECT t.box_id, t.format, t.status INTO v_box_id, v_format, v_status
    FROM tournaments t WHERE t.id = p_tournament_id;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'TOURNOI_INCONNU' USING ERRCODE = 'no_data_found';
  END IF;

  -- Gérant ou co-gérant de la box du tournoi. Pas le coach.
  IF NOT public.is_box_owner_admin(v_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du tournoi requis'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('t:' || p_tournament_id::text));

  -- Idempotence par refus : une clôture ne se rejoue pas.
  IF v_status = 'completed'
     OR EXISTS (SELECT 1 FROM tournament_elo_history h WHERE h.tournament_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNOI_DEJA_CLOTURE : l''ELO de ce tournoi a déjà été distribué'
      USING ERRCODE = 'check_violation';
  END IF;

  CREATE TEMP TABLE _ft_rank (athlete_id uuid PRIMARY KEY, final_rank int NOT NULL) ON COMMIT DROP;

  IF v_format = 'simple' THEN
    SELECT COUNT(*) INTO v_pending FROM tournament_scores s
     WHERE s.tournament_id = p_tournament_id AND s.status = 'pending';
    IF v_pending > 0 THEN
      RAISE EXCEPTION 'SCORES_EN_ATTENTE : % score(s) à valider ou rejeter avant la clôture', v_pending
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO _ft_rank SELECT s.athlete_id, s.final_rank FROM public.tournament_classique_standings(p_tournament_id) s;

  ELSIF v_format IN ('bracket', 'swiss') THEN
    INSERT INTO _ft_rank
      SELECT s.athlete_id, s.final_rank FROM public.tournament_bracket_standings(p_tournament_id) s;
    SELECT COUNT(*) INTO v_alive FROM public.tournament_bracket_standings(p_tournament_id) s WHERE s.still_alive;
    IF v_alive > 0 OR NOT EXISTS (SELECT 1 FROM _ft_rank WHERE final_rank = 1) THEN
      RAISE EXCEPTION 'TABLEAU_NON_TERMINE : % athlète(s) encore en lice', v_alive
        USING ERRCODE = 'check_violation';
    END IF;
    -- Inscrits jamais entrés dans le tableau : derniers, ex-aequo.
    INSERT INTO _ft_rank
      SELECT tp.athlete_id, (SELECT COUNT(*) FROM _ft_rank) + 1
        FROM tournament_participants tp
       WHERE tp.tournament_id = p_tournament_id
         AND NOT EXISTS (SELECT 1 FROM _ft_rank r WHERE r.athlete_id = tp.athlete_id);

  ELSIF v_format = 'league_div' THEN
    INSERT INTO _ft_rank
      SELECT tdm.athlete_id,
             RANK() OVER (ORDER BY d.level ASC, tdm.points DESC, COALESCE(tdm.rank, 999999) ASC)::int
        FROM tournament_division_members tdm
        JOIN tournament_divisions d ON d.id = tdm.division_id
       WHERE d.tournament_id = p_tournament_id;
  ELSE
    RAISE EXCEPTION 'FORMAT_INCONNU : %', v_format;
  END IF;

  SELECT COUNT(*) INTO v_n FROM _ft_rank;

  IF v_format = 'simple' THEN
    -- Classique : l'ELO du tournoi se distribue ici (k = 48, même formule que
    -- `calcTournamentElo` côté web et que l'ancienne compute_tournament_elo).
    CREATE TEMP TABLE _ft_field ON COMMIT DROP AS
      SELECT r.athlete_id, r.final_rank, COALESCE(p.elo, 1000)::int AS elo
        FROM _ft_rank r JOIN profiles p ON p.id = r.athlete_id;
    SELECT ROUND(AVG(elo))::int INTO v_avg FROM _ft_field;

    CREATE TEMP TABLE _ft_deltas ON COMMIT DROP AS
      SELECT f.athlete_id, f.final_rank, f.elo AS elo_before,
             CASE WHEN v_n < 2 THEN 0 ELSE
               ROUND( k_tourn * (
                 ((v_n - f.final_rank)::numeric / (v_n - 1))
                 - (1 / (1 + POWER(10, (v_avg - f.elo) / 400.0)))
               ) )::int END AS elo_change
        FROM _ft_field f;

    INSERT INTO tournament_elo_history
      (tournament_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
    SELECT p_tournament_id, d.athlete_id, d.final_rank, v_n, v_avg,
           d.elo_before, GREATEST(100, d.elo_before + d.elo_change),
           GREATEST(100, d.elo_before + d.elo_change) - d.elo_before
      FROM _ft_deltas d;

    UPDATE profiles p
       SET elo           = GREATEST(100, d.elo_before + d.elo_change),
           total_matches = p.total_matches + 1,
           wins          = p.wins + (CASE WHEN d.final_rank = 1 THEN 1 ELSE 0 END)
      FROM _ft_deltas d
     WHERE p.id = d.athlete_id;

  ELSE
    -- Tableaux et ligue : ELO déjà distribué match par match / WOD par WOD.
    -- Ligne récapitulative, aucun point ajouté, profil inchangé.
    INSERT INTO tournament_elo_history
      (tournament_id, athlete_id, final_rank, participants_count, avg_opponent_elo, elo_before, elo_after, elo_change)
    SELECT p_tournament_id, r.athlete_id, r.final_rank, v_n,
           ROUND(AVG(COALESCE(p.elo, 1000)) OVER ())::int,
           COALESCE(
             (SELECT h.elo_before FROM tournament_match_elo_history h
               WHERE h.tournament_id = p_tournament_id AND h.athlete_id = r.athlete_id
               ORDER BY h.created_at ASC, h.id ASC LIMIT 1),
             (SELECT h.elo_before FROM tournament_wod_elo_history h
               WHERE h.tournament_id = p_tournament_id AND h.athlete_id = r.athlete_id
               ORDER BY h.created_at ASC, h.id ASC LIMIT 1),
             COALESCE(p.elo, 1000)),
           COALESCE(p.elo, 1000),
           COALESCE(p.elo, 1000) - COALESCE(
             (SELECT h.elo_before FROM tournament_match_elo_history h
               WHERE h.tournament_id = p_tournament_id AND h.athlete_id = r.athlete_id
               ORDER BY h.created_at ASC, h.id ASC LIMIT 1),
             (SELECT h.elo_before FROM tournament_wod_elo_history h
               WHERE h.tournament_id = p_tournament_id AND h.athlete_id = r.athlete_id
               ORDER BY h.created_at ASC, h.id ASC LIMIT 1),
             COALESCE(p.elo, 1000))
      FROM _ft_rank r JOIN profiles p ON p.id = r.athlete_id;
  END IF;

  UPDATE tournaments SET status = 'completed' WHERE id = p_tournament_id;

  -- Invariant : profil = dernier elo_after, pour chaque participant, avant de
  -- rendre la main. Un écart annule toute la transaction.
  SELECT COUNT(*) INTO v_bad
    FROM tournament_elo_history h JOIN profiles p ON p.id = h.athlete_id
   WHERE h.tournament_id = p_tournament_id AND p.elo <> h.elo_after;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ELO_INCOHERENT : % profil(s) ≠ elo_after après clôture', v_bad
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN QUERY
    SELECT h.athlete_id, p.username, h.final_rank, h.elo_before, h.elo_after, h.elo_change
      FROM tournament_elo_history h JOIN profiles p ON p.id = h.athlete_id
     WHERE h.tournament_id = p_tournament_id
     ORDER BY h.final_rank, p.username;
END;
$$;

-- ── 4. L'ancienne RPC devient un alias : un seul corps ─────────────────────
CREATE OR REPLACE FUNCTION public.compute_tournament_elo(p_tournament_id uuid)
RETURNS TABLE(athlete_id uuid, final_rank integer, elo_before integer, elo_after integer, elo_change integer)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT f.athlete_id, f.final_rank, f.elo_before, f.elo_after, f.elo_change
    FROM public.finalize_tournament_elo(p_tournament_id) f;
$$;

-- ── 5. Grants : authenticated seulement ─────────────────────────────────────
REVOKE ALL ON FUNCTION public.tournament_classique_standings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tournament_bracket_standings(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_tournament_elo(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_tournament_elo(uuid)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_classique_standings(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_bracket_standings(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_tournament_elo(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_tournament_elo(uuid)         TO authenticated, service_role;
