-- ── Add sort_order to box_wods for drag & drop reordering ─────────────────
ALTER TABLE box_wods ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill existing WODs: assign sort_order by created_at within each (box_id, scheduled_date)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY box_id, scheduled_date
    ORDER BY created_at
  ) - 1 AS rn
  FROM box_wods
)
UPDATE box_wods SET sort_order = ranked.rn
FROM ranked WHERE box_wods.id = ranked.id;
