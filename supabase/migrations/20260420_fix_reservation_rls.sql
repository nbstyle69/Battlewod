-- Fix overly permissive RLS policy on class_reservations.
-- The previous "member_update_reservation_status" policy allowed ANY authenticated user
-- to update ANY reservation (WITH CHECK (true)), which is a security vulnerability.
--
-- The promote_waiting_reservation() trigger uses SECURITY DEFINER, so it already bypasses
-- RLS. The overly permissive UPDATE policy was therefore unnecessary.
--
-- We replace it with a strict policy: users can only update their OWN reservations.

DROP POLICY IF EXISTS "member_update_reservation_status" ON class_reservations;

CREATE POLICY "member_update_own_reservation" ON class_reservations
  FOR UPDATE
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

NOTIFY pgrst, 'reload schema';
