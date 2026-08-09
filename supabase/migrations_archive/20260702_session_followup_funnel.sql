-- ============================================================
-- Funnel d'acquisition « essai / Drop-in » (C3)
-- Base partagée : Battlewod (app) + TheHub (web back-office).
--
-- Pipeline prospect :
--   pending → responded → meeting_booked → offer_sent → converted | lost
--
-- Un prospect = un non-abonné qui a réalisé sa 1re séance (réservation
-- « présent » sans abonnement actif). On lui demande un feedback (push),
-- il réserve un RDV dans un vrai calendrier de créneaux, l'owner lui
-- propose une offre (abo / Drop-in / Carnet), puis conversion Stripe.
-- ============================================================

-- ── Helper strict : owner direct ou owner/coach actif de la box ──
-- (Volontairement plus strict que is_box_admin, qui laisse passer tout
--  profil box_owner sur n'importe quelle box.)
CREATE OR REPLACE FUNCTION public.manages_box_funnel(p_box_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.box_members
      WHERE box_id = p_box_id AND member_id = auth.uid()
        AND role IN ('owner', 'coach') AND COALESCE(status, 'active') = 'active'
    );
$$;
GRANT EXECUTE ON FUNCTION public.manages_box_funnel(uuid) TO authenticated, service_role;

-- ============================================================
-- 1. session_followups — un funnel par prospect × box
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_followups (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  member_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_id        uuid REFERENCES public.class_schedules(id) ON DELETE SET NULL,
  reservation_id     uuid REFERENCES public.class_reservations(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','responded','meeting_booked','offer_sent','converted','lost')),
  rating             smallint CHECK (rating BETWEEN 1 AND 5),
  feedback_comment   text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  converted_plan_id  uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  reminder_h_sent    boolean NOT NULL DEFAULT false,
  reminder_d1_sent   boolean NOT NULL DEFAULT false,
  reminder_d3_sent   boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_session_followups_box_status
  ON public.session_followups(box_id, status);
CREATE INDEX IF NOT EXISTS idx_session_followups_member
  ON public.session_followups(member_id);

ALTER TABLE public.session_followups ENABLE ROW LEVEL SECURITY;

-- Le prospect lit et répond à son propre suivi ; l'owner/coach voit et gère
-- tous les suivis de sa box.
DROP POLICY IF EXISTS session_followups_select ON public.session_followups;
CREATE POLICY session_followups_select ON public.session_followups
  FOR SELECT USING (member_id = auth.uid() OR public.manages_box_funnel(box_id));

DROP POLICY IF EXISTS session_followups_prospect_update ON public.session_followups;
CREATE POLICY session_followups_prospect_update ON public.session_followups
  FOR UPDATE USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS session_followups_owner_update ON public.session_followups;
CREATE POLICY session_followups_owner_update ON public.session_followups
  FOR UPDATE USING (public.manages_box_funnel(box_id)) WITH CHECK (public.manages_box_funnel(box_id));

DROP POLICY IF EXISTS session_followups_owner_insert ON public.session_followups;
CREATE POLICY session_followups_owner_insert ON public.session_followups
  FOR INSERT WITH CHECK (public.manages_box_funnel(box_id));
-- L'insertion automatique (détection) passe par le service role (bypass RLS).

-- ============================================================
-- 2. box_appointment_slots — créneaux de RDV ouverts par l'owner
-- ============================================================
CREATE TABLE IF NOT EXISTS public.box_appointment_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  capacity    smallint NOT NULL DEFAULT 1 CHECK (capacity > 0),
  coach       text,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_appointment_slots_box_time
  ON public.box_appointment_slots(box_id, starts_at);

ALTER TABLE public.box_appointment_slots ENABLE ROW LEVEL SECURITY;

-- Un prospect (membre de la box, même sans abo) voit les créneaux futurs ;
-- l'owner/coach les gère.
DROP POLICY IF EXISTS appointment_slots_select ON public.box_appointment_slots;
CREATE POLICY appointment_slots_select ON public.box_appointment_slots
  FOR SELECT USING (
    public.manages_box_funnel(box_id)
    OR box_id IN (SELECT box_id FROM public.box_members WHERE member_id = auth.uid() AND status = 'active')
  );

DROP POLICY IF EXISTS appointment_slots_manage ON public.box_appointment_slots;
CREATE POLICY appointment_slots_manage ON public.box_appointment_slots
  FOR ALL USING (public.manages_box_funnel(box_id)) WITH CHECK (public.manages_box_funnel(box_id));

-- ============================================================
-- 3. appointment_bookings — réservation d'un créneau par un prospect
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      uuid NOT NULL REFERENCES public.box_appointment_slots(id) ON DELETE CASCADE,
  box_id       uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  followup_id  uuid REFERENCES public.session_followups(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked','cancelled','done','no_show')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_slot
  ON public.appointment_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_appointment_bookings_box
  ON public.appointment_bookings(box_id, status);

ALTER TABLE public.appointment_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_bookings_select ON public.appointment_bookings;
CREATE POLICY appointment_bookings_select ON public.appointment_bookings
  FOR SELECT USING (member_id = auth.uid() OR public.manages_box_funnel(box_id));

DROP POLICY IF EXISTS appointment_bookings_cancel ON public.appointment_bookings;
CREATE POLICY appointment_bookings_cancel ON public.appointment_bookings
  FOR UPDATE USING (member_id = auth.uid() OR public.manages_box_funnel(box_id))
  WITH CHECK (member_id = auth.uid() OR public.manages_box_funnel(box_id));
-- L'insertion passe uniquement par l'RPC atomique book_appointment_slot().

-- ============================================================
-- 4. RPC : réservation atomique d'un créneau (respecte la capacité)
-- ============================================================
CREATE OR REPLACE FUNCTION public.book_appointment_slot(p_slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_slot       public.box_appointment_slots%ROWTYPE;
  v_taken      int;
  v_followup   uuid;
  v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Verrouille le créneau pour sérialiser les réservations concurrentes.
  SELECT * INTO v_slot FROM public.box_appointment_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;
  IF v_slot.starts_at <= now() THEN
    RAISE EXCEPTION 'SLOT_IN_PAST';
  END IF;

  -- Le prospect doit être membre de la box.
  IF NOT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = v_slot.box_id AND member_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  SELECT count(*) INTO v_taken
  FROM public.appointment_bookings
  WHERE slot_id = p_slot_id AND status = 'booked';

  IF v_taken >= v_slot.capacity THEN
    RAISE EXCEPTION 'SLOT_FULL';
  END IF;

  SELECT id INTO v_followup
  FROM public.session_followups
  WHERE box_id = v_slot.box_id AND member_id = v_uid;

  INSERT INTO public.appointment_bookings (slot_id, box_id, member_id, followup_id, status)
  VALUES (p_slot_id, v_slot.box_id, v_uid, v_followup, 'booked')
  ON CONFLICT (slot_id, member_id) DO UPDATE SET status = 'booked'
  RETURNING id INTO v_booking_id;

  -- Avance le funnel.
  IF v_followup IS NOT NULL THEN
    UPDATE public.session_followups
    SET status = CASE WHEN status IN ('converted','lost') THEN status ELSE 'meeting_booked' END,
        updated_at = now()
    WHERE id = v_followup;
  END IF;

  RETURN v_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.book_appointment_slot(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.book_appointment_slot(uuid) TO authenticated;

-- ============================================================
-- 5. RPC : soumission du feedback par le prospect (status → responded)
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_followup_feedback(
  p_followup_id uuid,
  p_rating      smallint,
  p_comment     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.session_followups
  SET rating = p_rating,
      feedback_comment = p_comment,
      responded_at = now(),
      status = CASE WHEN status = 'pending' THEN 'responded' ELSE status END,
      updated_at = now()
  WHERE id = p_followup_id AND member_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_followup_feedback(uuid, smallint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_followup_feedback(uuid, smallint, text) TO authenticated;

-- ============================================================
-- 6. RPC : détection des 1res séances de non-abonnés (service role / cron)
--    Crée un funnel « pending » pour tout membre qui a été marqué présent
--    à un cours, n'a pas d'abonnement actif et n'a pas encore de funnel.
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_trial_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
REVOKE ALL ON FUNCTION public.detect_trial_followups() FROM public, anon, authenticated;

-- ============================================================
-- 7. pg_cron : détection horaire des nouveaux prospects.
--    (Les relances push passent par l'Edge Function
--     `session-followup-cron`, à planifier via le scheduler Supabase.)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-trial-followups-hourly') THEN
      PERFORM cron.unschedule('detect-trial-followups-hourly');
    END IF;
    PERFORM cron.schedule(
      'detect-trial-followups-hourly',
      '10 * * * *',
      $cron$ SELECT public.detect_trial_followups(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponible — planifier detect_trial_followups() + Edge Function session-followup-cron manuellement.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
