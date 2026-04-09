-- ============================================
-- ATTENDANCE: système de présence aux cours
-- ============================================

-- Ajouter colonne attended à class_reservations
ALTER TABLE class_reservations
  ADD COLUMN IF NOT EXISTS attended boolean DEFAULT null;

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_reservations_schedule_attended
  ON class_reservations(schedule_id, attended);

-- ── RLS: coach peut insérer une réservation pour un membre de sa box ──
DROP POLICY IF EXISTS "coach_insert_reservation" ON class_reservations;
CREATE POLICY "coach_insert_reservation" ON class_reservations
  FOR INSERT WITH CHECK (
    is_box_coach(box_id)
  );

-- ── RLS: coach peut mettre à jour attended pour les réservations de sa box ──
DROP POLICY IF EXISTS "coach_update_attendance" ON class_reservations;
CREATE POLICY "coach_update_attendance" ON class_reservations
  FOR UPDATE USING (
    is_box_coach(box_id)
  );

-- ── RLS: coach peut aussi gérer les horaires de sa box ──
DROP POLICY IF EXISTS "coach_manage_schedules" ON class_schedules;
CREATE POLICY "coach_manage_schedules" ON class_schedules
  FOR ALL USING (
    is_box_coach(box_id)
  );

NOTIFY pgrst, 'reload schema';
