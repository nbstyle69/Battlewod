-- Feuille de présence — le membre n'écrit plus sur sa réservation.
--
-- `member_update_own_reservation` autorisait l'UPDATE de TOUTES les colonnes de
-- sa propre ligne. Deux conséquences, prouvées au vrai JWT sur pile locale :
--
--   1. le membre pointait sa propre présence (`attended = true`), ce qui vide
--      de sens la feuille que le coach est censé tenir ;
--   2. le membre se promouvait de la liste d'attente (`status` 'waiting' →
--      'confirmed') dès qu'une place se libérait, en doublant la file :
--      enforce_reservation_capacity ne vérifie que le plafond, jamais le tour.
--
-- Aucun client ne s'appuyait sur cette policy : app mobile comme web, le membre
-- ne fait qu'INSERT (réserver) et DELETE (annuler). La promotion reste rendue
-- par promote_waiting_reservation, SECURITY DEFINER, qui suit l'ordre
-- d'inscription et n'est pas soumis à la RLS.
--
-- Les écritures du gérant et du coach passent par box_admin_update_reservation
-- (Lot 7B), inchangée.

DROP POLICY IF EXISTS member_update_own_reservation ON public.class_reservations;
