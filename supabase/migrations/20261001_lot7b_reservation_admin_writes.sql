-- Lot 7B — « Ajouter un membre à un créneau » était mort pour tous les owners.
--
-- Les policies d'écriture de class_reservations n'acceptaient que is_box_coach(),
-- qui exige une ligne box_members avec role = 'coach' : en prod, 0 owner sur 20
-- en possède une. Le back-office renvoyait donc « new row violates row-level
-- security policy » à chaque inscription faite par l'owner, et la présence
-- n'était pas modifiable non plus. La suppression, elle, n'acceptait que
-- boxes.owner_id, donc pas les co-owners.
--
-- is_box_admin() (owner_id, co-owner ou coach actif, admin plateforme) est le
-- même périmètre que celui posé au Lot 6A. Le plafond de place reste arbitré
-- par le trigger trg_enforce_capacity, inchangé.

DROP POLICY IF EXISTS coach_insert_reservation ON public.class_reservations;
CREATE POLICY box_admin_insert_reservation ON public.class_reservations
  FOR INSERT
  WITH CHECK (public.is_box_admin(box_id));

DROP POLICY IF EXISTS coach_update_attendance ON public.class_reservations;
CREATE POLICY box_admin_update_reservation ON public.class_reservations
  FOR UPDATE
  USING (public.is_box_admin(box_id))
  WITH CHECK (public.is_box_admin(box_id));

DROP POLICY IF EXISTS owner_delete_reservation ON public.class_reservations;
CREATE POLICY box_admin_delete_reservation ON public.class_reservations
  FOR DELETE
  USING (public.is_box_admin(box_id));
