-- ═══════════════════════════════════════════════════════════════════════════
-- Essai — le récapitulatif hebdomadaire cesse de compter les essais
--          comme des présences d'adhérents, et il les compte à part.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deux défauts corrigés dans la même fonction :
--
-- 1. `attendances` comptait toute réservation pointée, essais compris. Un
--    prospect qui vient une fois n'est pas une présence d'adhérent : le
--    chiffre gonflait sans que rien ne le signale.
-- 2. Le gérant n'avait aucune vue sur l'acquisition. « X essais » est
--    l'information qu'il veut vraiment, et elle est bon marché : les essais
--    sont déjà datés dans `box_prospects`.
--
-- Le type de retour change, donc DROP puis CREATE : `CREATE OR REPLACE` ne
-- sait pas modifier une signature de retour.

DROP FUNCTION IF EXISTS public.get_weekly_digest_batch(integer);

CREATE FUNCTION public.get_weekly_digest_batch(p_days integer DEFAULT 7)
RETURNS TABLE (
  box_id            uuid,
  box_name          text,
  owner_id          uuid,
  owner_email       text,
  new_members       integer,
  attendances       integer,
  members_at_risk   integer,
  past_due_count    integer,
  trials            integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from timestamptz := now() - make_interval(days => p_days);
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR session_user IN ('service_role', 'supabase_admin', 'postgres')) THEN
    RAISE EXCEPTION 'FORBIDDEN: récapitulatif réservé au service'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.owner_id,
    pr.email,
    (SELECT count(*)::integer FROM public.box_members bm
      WHERE bm.box_id = b.id AND bm.role = 'member' AND bm.joined_at >= v_from),
    -- Les essais sortent du compte des présences : ils ont leur propre ligne.
    (SELECT count(*)::integer
       FROM public.class_reservations cr
       JOIN public.class_schedules cs ON cs.id = cr.schedule_id
      WHERE cs.box_id = b.id
        AND cr.attended
        AND NOT coalesce(cr.is_trial, false)
        AND cs.scheduled_date >= (v_from AT TIME ZONE 'UTC')::date
        AND cs.scheduled_date <  current_date),
    (SELECT count(*)::integer FROM public.box_members bm
      WHERE bm.box_id = b.id AND bm.status = 'active' AND bm.role = 'member'
        AND EXISTS (SELECT 1 FROM public.class_reservations cr
                      JOIN public.class_schedules cs ON cs.id = cr.schedule_id
                     WHERE cr.member_id = bm.member_id AND cr.box_id = b.id
                       AND cs.scheduled_date < current_date)
        AND NOT EXISTS (SELECT 1 FROM public.class_reservations cr
                          JOIN public.class_schedules cs ON cs.id = cr.schedule_id
                         WHERE cr.member_id = bm.member_id AND cr.box_id = b.id
                           AND cs.scheduled_date >= current_date - 14
                           AND cs.scheduled_date <  current_date)),
    (SELECT count(*)::integer FROM public.box_members bm
      WHERE bm.box_id = b.id AND bm.subscription_status = 'past_due'),
    (SELECT count(*)::integer FROM public.box_prospects bp
      WHERE bp.box_id = b.id AND bp.created_at >= v_from)
  FROM public.boxes b
  JOIN public.profiles pr ON pr.id = b.owner_id
  LEFT JOIN public.box_owner_email_prefs pref
         ON pref.box_id = b.id AND pref.user_id = b.owner_id
  WHERE b.is_active
    AND coalesce(pref.weekly_digest, true)
    AND pr.email <> ''
  ORDER BY b.name;
END;
$$;

REVOKE ALL     ON FUNCTION public.get_weekly_digest_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_weekly_digest_batch(integer) TO service_role;

COMMENT ON FUNCTION public.get_weekly_digest_batch(integer) IS
  'Matière du récapitulatif hebdomadaire, une ligne par box abonnée. Réservé à service_role : expose l''e-mail du gérant. Les essais sont comptés à part, jamais dans les présences d''adhérents.';

-- ── detect_trial_followups : l'exclusion des essais est déjà en place (D6),
--    mais elle se déduisait d'une colonne nulle (`member_id IS NOT NULL`).
--    Un essai porte désormais un marqueur explicite : le filtre le nomme.
--    Les deux gardes coexistent — la nulle protège la colonne NOT NULL cible,
--    la nommée protège du jour où un essai porterait un compte.
CREATE OR REPLACE FUNCTION public.detect_trial_followups()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
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
      -- Et un essai reste un essai même s'il portait un compte : il vit dans
      -- box_prospects, pas dans le pipeline d'adhérents.
      AND NOT coalesce(cr.is_trial, false)
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
$$;

REVOKE ALL     ON FUNCTION public.detect_trial_followups() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.detect_trial_followups() TO service_role;
