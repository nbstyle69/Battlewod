-- =============================================================================
-- Recurring class schedules from templates
-- - generate_class_schedules_from_templates(p_box_id, p_weeks_ahead): idempotent
--   inserts all missing schedules from active templates for N weeks ahead.
-- - extend_all_class_schedules(): runs the above for every box that has at
--   least one active template. Scheduled daily via pg_cron.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -----------------------------------------------------------------------------
-- 1) Per-box generation (called by BO "Générer 8 semaines" button + cron loop)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_class_schedules_from_templates(
  p_box_id UUID,
  p_weeks_ahead INT DEFAULT 8
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_start_date DATE := CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1));
  v_end_date DATE;
BEGIN
  IF p_weeks_ahead IS NULL OR p_weeks_ahead < 1 THEN
    p_weeks_ahead := 8;
  END IF;

  v_end_date := v_start_date + (p_weeks_ahead * 7) - 1;

  WITH ins AS (
    INSERT INTO class_schedules
      (box_id, title, description, coach, scheduled_date, start_time, end_time, max_capacity)
    SELECT
      t.box_id, t.title, t.description, t.coach,
      d::date, t.start_time, t.end_time, t.max_capacity
    FROM schedule_templates t
    CROSS JOIN generate_series(v_start_date, v_end_date, INTERVAL '1 day') AS d
    WHERE t.box_id = p_box_id
      AND t.is_active = TRUE
      AND EXTRACT(ISODOW FROM d)::INT = t.day_of_week
      AND NOT EXISTS (
        SELECT 1 FROM class_schedules cs
        WHERE cs.box_id = t.box_id
          AND cs.scheduled_date = d::date
          AND cs.start_time = t.start_time
          AND cs.title = t.title
      )
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_class_schedules_from_templates(UUID, INT)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) Cron entry-point: extends all boxes by maintaining 8-week buffer
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extend_all_class_schedules()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_box RECORD;
BEGIN
  FOR v_box IN
    SELECT DISTINCT box_id
    FROM schedule_templates
    WHERE is_active = TRUE
  LOOP
    v_total := v_total + public.generate_class_schedules_from_templates(v_box.box_id, 8);
  END LOOP;
  RETURN v_total;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Schedule daily at 02:00 UTC. Drop existing job first (idempotent).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('extend-class-schedules-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'extend-class-schedules-daily',
  '0 2 * * *',
  $$ SELECT public.extend_all_class_schedules(); $$
);
