-- Add status column to class_reservations (confirmed | waiting)
ALTER TABLE class_reservations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('confirmed', 'waiting'));

-- Function: when a confirmed reservation is deleted, promote the earliest waiting person
CREATE OR REPLACE FUNCTION promote_waiting_reservation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = 'confirmed' THEN
    UPDATE class_reservations
    SET status = 'confirmed'
    WHERE id = (
      SELECT id FROM class_reservations
      WHERE schedule_id = OLD.schedule_id
        AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_waiting ON class_reservations;
CREATE TRIGGER trg_promote_waiting
  AFTER DELETE ON class_reservations
  FOR EACH ROW EXECUTE FUNCTION promote_waiting_reservation();

-- Update RLS: allow members to update their own reservation status (for promotion)
DROP POLICY IF EXISTS "member_update_reservation_status" ON class_reservations;
CREATE POLICY "member_update_reservation_status" ON class_reservations
  FOR UPDATE USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
