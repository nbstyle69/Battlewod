-- ═══════════════════════════════════════════════════════════════════════
-- Fix inter_standings VIEW: respect scoring_type for sort order
-- Fix inter_scores: add UNIQUE constraint to prevent duplicate submissions
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Replace inter_standings view to handle "time" scoring correctly
--    For "time" scoring, lower is better (ASC). For all others, higher is better (DESC).
DROP VIEW IF EXISTS inter_standings;

CREATE OR REPLACE VIEW inter_standings AS
SELECT
  s.competition_id,
  s.wod_id,
  s.athlete_id,
  s.team_id,
  p.username,
  p.level,
  b.name AS box_name,
  s.score_value,
  s.score_display,
  s.status,
  s.submitted_at,
  w.scoring_type,
  RANK() OVER (
    PARTITION BY s.competition_id, s.wod_id
    ORDER BY
      CASE
        WHEN w.scoring_type = 'time' THEN s.score_value
        ELSE -s.score_value
      END ASC NULLS LAST
  ) AS rank
FROM inter_scores s
LEFT JOIN profiles p ON p.id = s.athlete_id
LEFT JOIN inter_competition_wods w ON w.id = s.wod_id
LEFT JOIN boxes b ON b.id = (
  SELECT box_id FROM inter_registrations
  WHERE competition_id = s.competition_id AND athlete_id = s.athlete_id
  LIMIT 1
)
WHERE s.status = 'validated';

-- 2. Add UNIQUE constraint to prevent duplicate score submissions
--    An athlete can only submit one score per WOD per competition.
ALTER TABLE inter_scores
  DROP CONSTRAINT IF EXISTS inter_scores_unique_athlete_wod;

ALTER TABLE inter_scores
  ADD CONSTRAINT inter_scores_unique_athlete_wod
  UNIQUE (competition_id, wod_id, athlete_id);

NOTIFY pgrst, 'reload schema';
