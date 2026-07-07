-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY / INTEGRITY (audit U1): enforce class capacity server-side.
--
-- Capacity was decided on the client (available_spots > 0 ? confirmed : waiting),
-- so two concurrent bookings could both read a free slot and both confirm →
-- overbooking. This trigger makes the decision authoritative and atomic: a row
-- can only be 'confirmed' if there is room, otherwise it is forced to 'waiting',
-- regardless of what the client sent.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_reservation_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap       int;
  v_confirmed int;
BEGIN
  -- Only relevant when the row would become confirmed.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent bookings for the same class.
  PERFORM pg_advisory_xact_lock(hashtext('resa:' || NEW.schedule_id::text));

  SELECT max_capacity INTO v_cap FROM class_schedules WHERE id = NEW.schedule_id;
  IF v_cap IS NULL THEN
    RETURN NEW; -- unknown schedule → let the FK constraint reject it
  END IF;

  SELECT COUNT(*) INTO v_confirmed
    FROM class_reservations
   WHERE schedule_id = NEW.schedule_id
     AND status = 'confirmed'
     AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_confirmed >= v_cap THEN
    NEW.status := 'waiting';
  END IF;

  RETURN NEW;
END;
$$;

-- Fires on new bookings AND on any status change (e.g. the waitlist-promotion
-- trigger), so capacity can never be exceeded through either path.
DROP TRIGGER IF EXISTS trg_enforce_capacity ON class_reservations;
CREATE TRIGGER trg_enforce_capacity
  BEFORE INSERT OR UPDATE OF status ON class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_capacity();

NOTIFY pgrst, 'reload schema';
