-- Lot 1 muscu — normalisation des clés de mouvement.
--
-- Trois normaliseurs coexistaient et écrivaient dans les mêmes tables :
--   * mobile tournois/back-office : `pull_up`, `wall_ball`, `double_under`
--   * mobile gamification (slug snake_case brut) : `pull-ups`, `push-ups`
--   * site (alias accolés) : `pullup`, `wallball`
-- Résultat : un athlète cumulait ses reps dans plusieurs compteurs, et les
-- badges lisaient une clé qu'aucune écriture ne produisait.
--
-- La clé canonique est désormais celle de `normalizeMovement`
-- (src/utils/tournamentUtils.ts) — seul normaliseur restant. Cette migration
-- ramène les données existantes dessus.
--
-- Ce qui n'est PAS fusionné : les clés qui ne sont pas des mouvements
-- (« rounds », « work_hsw », « wod_du_jour_ou_hyrox », « snatch_renfo »,
-- « 10+10_cuban_press_+_… »). Elles viennent de lignes de format ou de texte
-- libre comptées comme des mouvements. On ne les devine pas et on ne les
-- supprime pas — l'application ne les compte simplement plus (aucun badge n'y
-- était attaché), et plus aucune écriture n'en crée.

BEGIN;

CREATE TEMP TABLE lot1_alias(legacy text PRIMARY KEY, canonical text NOT NULL) ON COMMIT DROP;

INSERT INTO lot1_alias(legacy, canonical) VALUES
  -- pluriels et tirets du slug brut
  ('pull-ups', 'pull_up'),               ('pull_ups', 'pull_up'),
  ('kipping_pull_ups', 'pull_up'),       ('push-ups', 'push_up'),
  ('push_ups', 'push_up'),               ('sit-ups', 'sit_up'),
  ('sit_ups', 'sit_up'),                 ('air_squats', 'air_squat'),
  ('double-unders', 'double_under'),     ('double_unders', 'double_under'),
  ('single-unders', 'single_under'),     ('single_unders', 'single_under'),
  ('handstand_push-ups', 'hspu'),        ('handstand_push_ups', 'hspu'),
  ('hspu_stricts', 'hspu'),              ('wall_facing_hspu', 'hspu'),
  ('thrusters', 'thruster'),             ('deadlifts', 'deadlift'),
  ('burpees', 'burpee'),                 ('burpees_for_time', 'burpee'),
  ('lunges', 'lunge'),                   ('alternating_lunges', 'lunge'),
  ('db_lunges', 'lunge'),                ('walking_lunge', 'lunge'),
  ('box_jumps', 'box_jump'),             ('wall_balls', 'wall_ball'),
  ('wall_walks', 'wall_walk'),           ('v_ups', 'v_up'),
  ('hollow_rocks', 'hollow_rock'),       ('mountain_climbers', 'mountain_climber'),
  ('pistol_squats', 'pistol_squat'),     ('goblet_squats', 'goblet_squat'),
  ('kb_swings', 'kb_swing'),             ('mb_slams', 'mb_slam'),
  ('toes_to_bars', 'toes_to_bar'),       ('ring_dips', 'ring_dip'),
  ('ring_rows', 'ring_row'),
  -- variantes ramenées sur le mouvement de base
  ('power_clean', 'clean'),              ('squat_clean', 'clean'),
  ('hang_clean', 'clean'),               ('hang_power_clean', 'clean'),
  ('hang_squat_clean', 'clean'),         ('tall_clean', 'clean'),
  ('power_snatch', 'snatch'),            ('squat_snatch', 'snatch'),
  ('hang_snatch', 'snatch'),             ('tall_snatch', 'snatch'),
  ('hang_clean_and_jerk', 'clean_and_jerk'),
  ('clean_jerk', 'clean_and_jerk'),
  ('strict_press', 'press'),             ('push_press', 'press'),
  ('push_jerk', 'press'),                ('shoulder_to_overhead', 'press'),
  ('front_squats', 'squat'),             ('back_squats', 'squat'),
  ('front_squat', 'squat'),              ('back_squat', 'squat'),
  ('cal_row', 'row'),                    ('cal_rameur', 'row'),
  ('rameur', 'row'),                     ('assault_bike', 'bike'),
  ('echo_bike', 'bike'),                 ('cal_assault_bike', 'bike'),
  ('cal_bike', 'bike'),                  ('cal_ski_erg', 'ski_erg'),
  -- formes accolées de l'ancien normaliseur du site
  ('pullup', 'pull_up'),                 ('pullups', 'pull_up'),
  ('pushup', 'push_up'),                 ('pushups', 'push_up'),
  ('situp', 'sit_up'),                   ('boxjump', 'box_jump'),
  ('wallball', 'wall_ball'),             ('wallwalk', 'wall_walk'),
  ('doubleunder', 'double_under'),       ('kbswing', 'kb_swing'),
  ('toes2bar', 'toes_to_bar');

-- 1. movement_logs : historique, pas de contrainte d'unicité → simple renommage.
UPDATE public.movement_logs l
   SET movement = a.canonical
  FROM lot1_alias a
 WHERE l.movement = a.legacy;

-- 2. user_movement_stats : clé primaire (user_id, movement) → fusionner les
--    doublons avant de renommer, sinon le UPDATE viole la PK.
WITH fusion AS (
  SELECT s.user_id,
         a.canonical,
         SUM(s.total_reps)  AS total_reps,
         MAX(s.best_weight) AS best_weight
    FROM public.user_movement_stats s
    JOIN lot1_alias a ON a.legacy = s.movement
   GROUP BY s.user_id, a.canonical
)
INSERT INTO public.user_movement_stats(user_id, movement, total_reps, best_weight, updated_at)
SELECT user_id, canonical, total_reps, best_weight, now()
  FROM fusion
    ON CONFLICT (user_id, movement) DO UPDATE
   SET total_reps  = public.user_movement_stats.total_reps + EXCLUDED.total_reps,
       best_weight = GREATEST(
         COALESCE(public.user_movement_stats.best_weight, EXCLUDED.best_weight),
         COALESCE(EXCLUDED.best_weight, public.user_movement_stats.best_weight)
       ),
       updated_at  = now();

DELETE FROM public.user_movement_stats s
 USING lot1_alias a
 WHERE s.movement = a.legacy;

-- 3. movement_rep_counts (crédit du back-office) : même fusion, clé unique
--    (athlete_id, movement_key).
WITH fusion AS (
  SELECT c.athlete_id,
         a.canonical,
         SUM(c.total_reps) AS total_reps,
         MIN(c.movement_label) AS movement_label
    FROM public.movement_rep_counts c
    JOIN lot1_alias a ON a.legacy = c.movement_key
   GROUP BY c.athlete_id, a.canonical
)
INSERT INTO public.movement_rep_counts(athlete_id, movement_key, movement_label, total_reps)
SELECT athlete_id, canonical, movement_label, total_reps
  FROM fusion
    ON CONFLICT (athlete_id, movement_key) DO UPDATE
   SET total_reps = public.movement_rep_counts.total_reps + EXCLUDED.total_reps;

DELETE FROM public.movement_rep_counts c
 USING lot1_alias a
 WHERE c.movement_key = a.legacy;

-- 4. Garde-fou : plus aucune clé héritée ne doit subsister dans les trois
--    tables. Un backfill qui laisse des restes est un backfill qui ment.
DO $$
DECLARE restants integer;
BEGIN
  SELECT count(*) INTO restants FROM (
    SELECT 1 FROM public.movement_logs l JOIN lot1_alias a ON a.legacy = l.movement
    UNION ALL
    SELECT 1 FROM public.user_movement_stats s JOIN lot1_alias a ON a.legacy = s.movement
    UNION ALL
    SELECT 1 FROM public.movement_rep_counts c JOIN lot1_alias a ON a.legacy = c.movement_key
  ) t;

  IF restants > 0 THEN
    RAISE EXCEPTION 'lot 1 : % ligne(s) portent encore une clé héritée', restants;
  END IF;
END $$;

COMMIT;
