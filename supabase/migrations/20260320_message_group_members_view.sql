-- message_group_members already exists as a table but has no data sync
-- with message_groups.members uuid[] array. Drop it and recreate as a view
-- so it always reflects the current members array.

DROP TABLE IF EXISTS message_group_members CASCADE;

CREATE OR REPLACE VIEW message_group_members AS
SELECT
  mg.id    AS group_id,
  m        AS user_id,
  mg.box_id
FROM message_groups mg,
     unnest(mg.members) AS m;

-- Grant access so RLS sub-queries can use this view
GRANT SELECT ON message_group_members TO authenticated;
GRANT SELECT ON message_group_members TO anon;
