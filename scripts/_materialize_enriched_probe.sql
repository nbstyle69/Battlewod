-- Protocole : la matérialisation recopie-t-elle les champs enrichis ?
-- Tout se joue dans une transaction annulée : aucune écriture ne survit.
BEGIN;

\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Souscription active existante + sa programmation.
CREATE TEMP TABLE probe_ctx AS
SELECT s.id AS sub_id, s.programming_id, s.subscriber_box_id, s.week_anchor,
       p.weeks_count
FROM public.box_programming_subscriptions s
JOIN public.box_programming p ON p.id = s.programming_id
WHERE s.status = 'active'
LIMIT 1;

-- Lundi cible dont la rotation retombe sur la semaine 1.
CREATE TEMP TABLE probe_monday AS
SELECT week_anchor AS monday FROM probe_ctx;

-- WOD enrichi source, semaine 1 / mardi.
INSERT INTO public.box_programming_wods (
  programming_id, week_number, day_of_week, title, description, wod_type,
  time_cap_seconds, rounds, sort_order,
  notes, block_name, video_url, leaderboard_enabled,
  emom_interval_minutes, tabata_work_seconds, tabata_rest_seconds
)
SELECT programming_id, 1, 2, 'zz_probe_enrichi', E'21 Thruster (43/30 kg)\n21 Pull-up',
       'emom', 900, 5, 99,
       'zz notes coach', 'skill-haltero', 'https://youtu.be/zzprobe', false,
       3, 25, 15
FROM probe_ctx;

SELECT public.materialize_box_programming((SELECT monday FROM probe_monday)) AS wods_inseres;

-- Assertion : chaque champ enrichi doit être arrivé tel quel dans box_wods.
SELECT
  CASE WHEN count(*) = 1 THEN 'OK  ligne matérialisée' ELSE 'ECHEC  ' || count(*) || ' ligne(s)' END
FROM public.box_wods w
WHERE w.title = 'zz_probe_enrichi';

SELECT
  format('%s notes=%s block=%s video=%s classement=%s emom=%s tabata=%s/%s type=%s cap=%s rounds=%s date=%s',
    CASE WHEN w.notes = 'zz notes coach'
          AND w.block_name = 'skill-haltero'
          AND w.video_url = 'https://youtu.be/zzprobe'
          AND w.leaderboard_enabled = false
          AND w.emom_interval_minutes = 3
          AND w.tabata_work_seconds = 25
          AND w.tabata_rest_seconds = 15
          AND w.wod_type = 'emom'
          AND w.time_cap_seconds = 900
          AND w.rounds = 5
          AND w.scheduled_date = (SELECT monday FROM probe_monday) + 1
         THEN 'OK ' ELSE 'ECHEC ' END,
    w.notes, w.block_name, w.video_url, w.leaderboard_enabled,
    w.emom_interval_minutes, w.tabata_work_seconds, w.tabata_rest_seconds,
    w.wod_type, w.time_cap_seconds, w.rounds, w.scheduled_date)
FROM public.box_wods w
WHERE w.title = 'zz_probe_enrichi';

ROLLBACK;
