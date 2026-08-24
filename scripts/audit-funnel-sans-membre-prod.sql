-- audit-funnel-sans-membre-prod.sql — le funnel de relances face à une
-- réservation sans membre (l'essai d'un visiteur sans compte).
--
-- Pourquoi ce contrôle fabrique sa panne : aucune ligne `member_id IS NULL`
-- n'existe en production aujourd'hui, donc le défaut n'est pas atteignable —
-- sans fixture, on livrerait une réparation dont on n'a vu que le code.
-- La fixture est écrite puis annulée : le script se termine par ROLLBACK.
--
-- Deux sens, sinon rien n'est prouvé :
--   1. le POSITIF : `detect_trial_followups()` (avec le filtre de 20261125)
--      traverse la ligne sans membre et ne crée aucun suivi pour elle ;
--   2. le NÉGATIF : la même écriture SANS le filtre échoue bien sur la
--      contrainte NOT NULL — c'est la panne qui coupait les relances de
--      toutes les box tant que la ligne existait.
--
-- Usage : psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
--           -f scripts/audit-funnel-sans-membre-prod.sql

BEGIN;

CREATE TEMP TABLE sonde(reservation_id uuid, schedule_id uuid, box_id uuid) ON COMMIT DROP;

INSERT INTO sonde(schedule_id, box_id)
SELECT cs.id, cs.box_id
FROM public.class_schedules cs
ORDER BY cs.scheduled_date DESC
LIMIT 1;

INSERT INTO public.class_reservations (schedule_id, member_id, status, attended)
SELECT s.schedule_id, NULL, 'confirmed', true FROM sonde s
RETURNING id \gset reservation_

UPDATE sonde SET reservation_id = :'reservation_id';

-- 1. POSITIF — la fonction de production traverse la ligne sans membre.
DO $$
DECLARE
  v_res uuid := (SELECT reservation_id FROM sonde);
  v_avant int := (SELECT count(*) FROM public.session_followups);
  v_apres int;
BEGIN
  PERFORM public.detect_trial_followups();

  IF EXISTS (SELECT 1 FROM public.session_followups WHERE reservation_id = v_res) THEN
    RAISE EXCEPTION 'ROUGE — la réservation sans membre a produit un suivi';
  END IF;

  SELECT count(*) INTO v_apres FROM public.session_followups;
  RAISE NOTICE 'VERT — detect_trial_followups() a traversé la ligne sans membre (suivis : % → %)', v_avant, v_apres;
END $$;

-- 2. NÉGATIF — la même écriture sans le filtre échoue, et on le prouve.
DO $$
DECLARE
  v_res uuid := (SELECT reservation_id FROM sonde);
BEGIN
  BEGIN
    INSERT INTO public.session_followups (box_id, member_id, schedule_id, reservation_id, first_seen_at, status)
    SELECT cs.box_id, cr.member_id, cr.schedule_id, cr.id, now(), 'pending'
    FROM public.class_reservations cr
    JOIN public.class_schedules cs ON cs.id = cr.schedule_id
    WHERE cr.id = v_res AND cr.attended = true;

    RAISE EXCEPTION 'ROUGE — l''écriture sans filtre a été acceptée : la contrainte ne protège plus rien';
  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE 'VERT — sans le filtre, l''insertion échoue bien (%). C''est la panne de 20261125.', SQLERRM;
  END;
END $$;

ROLLBACK;
