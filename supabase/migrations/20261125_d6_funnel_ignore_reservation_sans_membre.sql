-- 20261125 — D6 : une réservation sans membre coupait TOUTES les relances.
--
-- `detect_trial_followups()` insère la 1re séance honorée de chaque non-abonné
-- dans `session_followups`. Elle ne filtre pas `cr.member_id`, or
-- `class_reservations.member_id` est NULLABLE et `session_followups.member_id`
-- est `NOT NULL` avec FK vers `profiles`. Mesuré le 2026-06-09 sur une ligne de
-- sonde créée puis supprimée (retour à zéro ligne `member_id IS NULL` vérifié) :
--
--   INSERT class_reservations (member_id NULL, attended true) ;
--   SELECT detect_trial_followups()
--     → ERROR  null value in column "member_id" of relation
--              "session_followups" violates not-null constraint
--
-- Et le consommateur (`supabase/functions/session-followup-cron`) faisait
-- `return json(…, 500)` sur cette erreur AVANT tout envoi : une seule ligne
-- fautive coupait les relances de tous les prospects, de toutes les box, tant
-- que la ligne existait. La résilience par ligne du cron part avec le même lot.
--
-- Le funnel `session_followups` reste le pipeline des prospects QUI ONT un
-- compte : il suppose un `profiles.id`, et son unicité est `(box_id, member_id)`.
-- L'exclusion est donc explicite ici, et non un contournement : une réservation
-- sans membre n'appartient pas à ce pipeline, elle appartiendra à
-- `box_prospects` (chantier « offre Essai », décidé le 2026-06-09).
--
-- Aujourd'hui la production ne porte AUCUNE ligne `member_id IS NULL` : le
-- défaut n'est pas atteignable en l'état, et le contrôle qui le prouve
-- (`scripts/test-funnel-sans-membre.mjs`) doit donc FABRIQUER la ligne — sur la
-- pile jetable, jamais en production.

CREATE OR REPLACE FUNCTION public.detect_trial_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inserted int;
BEGIN
  WITH first_attended AS (
    SELECT DISTINCT ON (cr.box_id, cr.member_id)
      cr.box_id, cr.member_id, cr.id AS reservation_id, cr.schedule_id, cs.scheduled_date
    FROM public.class_reservations cr
    JOIN public.class_schedules cs ON cs.id = cr.schedule_id
    WHERE cr.attended = true
      -- Une réservation sans membre (essai d'un visiteur sans compte) n'a pas
      -- de place dans ce funnel : sa colonne cible est NOT NULL.
      AND cr.member_id IS NOT NULL
    ORDER BY cr.box_id, cr.member_id, cs.scheduled_date ASC
  ),
  eligible AS (
    SELECT fa.*
    FROM first_attended fa
    WHERE NOT EXISTS (
      -- Pas d'abonnement de salle actif.
      SELECT 1 FROM public.box_members bm
      JOIN public.membership_plans mp ON mp.id = bm.plan_id
      WHERE bm.box_id = fa.box_id AND bm.member_id = fa.member_id
        AND bm.status = 'active' AND mp.plan_type = 'subscription'
        AND COALESCE(bm.subscription_status, '') IN ('active','trialing','past_due')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.session_followups sf
      WHERE sf.box_id = fa.box_id AND sf.member_id = fa.member_id
    )
  ),
  ins AS (
    INSERT INTO public.session_followups (box_id, member_id, schedule_id, reservation_id, first_seen_at, status)
    SELECT box_id, member_id, schedule_id, reservation_id,
           COALESCE(scheduled_date::timestamptz, now()), 'pending'
    FROM eligible
    ON CONFLICT (box_id, member_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$;
