-- Lot 3 « Croissance » de la refonte Statistiques : funnel de la box, réglage
-- d'opt-out du gérant, et matière du récapitulatif hebdomadaire.
--
-- Trois décisions structurantes :
--
--  1. Le funnel est une COHORTE, pas quatre compteurs indépendants. « Membres »
--     compte les adhésions de la période, et « Abonnés » compte celles de la
--     MÊME période qui portent un abonnement actif. Quatre chiffres pris dans
--     quatre fenêtres différentes produiraient des taux de passage supérieurs à
--     100 % dès qu'un mois est meilleur que le précédent.
--
--  2. Aucun pourcentage n'est calculé ici. Sur la box de production, 30 jours
--     donnent 1 prospect, 0 invitation et 3 membres : un « taux de conversion
--     de 300 % » serait arithmétiquement exact et parfaitement mensonger.
--     L'écran reçoit des effectifs bruts et décide de leur mise en forme.
--
--  3. L'opt-out est stocké par (box, gérant) et non par utilisateur : un gérant
--     multi-box veut le récapitulatif de l'une et pas de l'autre. Le défaut est
--     l'envoi — une préférence absente vaut « abonné », sinon poser la table
--     couperait l'e-mail pour tout le monde.

BEGIN;

-- ── 1. Préférence d'e-mail hebdomadaire du gérant ─────────────────────────

CREATE TABLE IF NOT EXISTS public.box_owner_email_prefs (
  box_id        uuid NOT NULL REFERENCES public.boxes(id)    ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekly_digest boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (box_id, user_id)
);

ALTER TABLE public.box_owner_email_prefs ENABLE ROW LEVEL SECURITY;

-- Un gérant ne règle que SA propre préférence, et seulement sur une box qu'il
-- administre : sans la seconde condition, n'importe qui écrirait des lignes au
-- nom d'une box étrangère.
DROP POLICY IF EXISTS box_owner_email_prefs_self ON public.box_owner_email_prefs;
CREATE POLICY box_owner_email_prefs_self
  ON public.box_owner_email_prefs
  FOR ALL
  TO authenticated
  USING      (user_id = auth.uid() AND public.is_box_admin(box_id))
  WITH CHECK (user_id = auth.uid() AND public.is_box_admin(box_id));

REVOKE ALL ON public.box_owner_email_prefs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.box_owner_email_prefs TO authenticated;
GRANT ALL    ON public.box_owner_email_prefs TO service_role;

COMMENT ON TABLE public.box_owner_email_prefs IS
  'Préférences d''e-mail du gérant, par box. Ligne absente = abonné (le défaut est l''envoi).';

-- ── 2. Funnel de la box ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_box_funnel_summary(
  p_box_id uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
RETURNS TABLE (
  prospects             integer,
  prospects_converted   integer,
  invitations_sent      integer,
  invitations_accepted   integer,
  members_joined        integer,
  members_subscribed    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cohorte AS (
    -- Les adhésions de la période, avec leur état d'abonnement actuel : c'est
    -- la même population qu'on suit d'un étage à l'autre.
    SELECT bm.subscription_status
    FROM public.box_members bm
    WHERE bm.box_id = p_box_id
      AND bm.role = 'member'
      AND bm.joined_at >= p_from
      AND bm.joined_at <  p_to
  )
  SELECT
    (SELECT count(*)::integer FROM public.session_followups sf
      WHERE sf.box_id = p_box_id
        AND sf.first_seen_at >= p_from AND sf.first_seen_at < p_to),
    (SELECT count(*)::integer FROM public.session_followups sf
      WHERE sf.box_id = p_box_id
        AND sf.first_seen_at >= p_from AND sf.first_seen_at < p_to
        AND sf.status = 'converted'),
    (SELECT count(*)::integer FROM public.box_invitations bi
      WHERE bi.box_id = p_box_id
        AND bi.created_at >= p_from AND bi.created_at < p_to),
    -- Une invitation acceptée est datée par `accepted_at` : la compter sur
    -- `created_at` daterait la conversion du jour de l'envoi.
    (SELECT count(*)::integer FROM public.box_invitations bi
      WHERE bi.box_id = p_box_id
        AND bi.accepted_at >= p_from AND bi.accepted_at < p_to),
    (SELECT count(*)::integer FROM cohorte),
    (SELECT count(*)::integer FROM cohorte WHERE subscription_status = 'active');
END;
$$;

REVOKE ALL     ON FUNCTION public.get_box_funnel_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_box_funnel_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_box_funnel_summary(uuid, timestamptz, timestamptz) IS
  'Funnel d''une box (admin de la box uniquement). Effectifs bruts : aucun taux n''est calculé côté serveur.';

-- ── 3. Matière du récapitulatif hebdomadaire ──────────────────────────────
--
-- Rendue en un seul appel pour TOUTES les box abonnées : le cron n'a alors ni
-- liste de box à parcourir, ni droit de lecture à emprunter box par box. La
-- fonction est réservée à `service_role` — elle expose l'e-mail du gérant, ce
-- qu'aucun client authentifié ne doit pouvoir demander en masse.

CREATE OR REPLACE FUNCTION public.get_weekly_digest_batch(p_days integer DEFAULT 7)
RETURNS TABLE (
  box_id            uuid,
  box_name          text,
  owner_id          uuid,
  owner_email       text,
  new_members       integer,
  attendances       integer,
  members_at_risk   integer,
  past_due_count    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from timestamptz := now() - make_interval(days => p_days);
BEGIN
  -- Le GRANT suffit tant que personne ne l'élargit ; la garde ci-dessous rend
  -- l'erreur explicite si c'est fait un jour. `session_user` couvre le cron,
  -- qui n'a pas de JWT et tourne en superuser.
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
    (SELECT count(*)::integer
       FROM public.class_reservations cr
       JOIN public.class_schedules cs ON cs.id = cr.schedule_id
      WHERE cs.box_id = b.id
        AND cr.attended
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
      WHERE bm.box_id = b.id AND bm.subscription_status = 'past_due')
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
  'Matière du récapitulatif hebdomadaire, une ligne par box abonnée. Réservé à service_role : expose l''e-mail du gérant.';

COMMIT;
