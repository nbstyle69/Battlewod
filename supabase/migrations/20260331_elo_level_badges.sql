-- =====================================================================
-- Issue #100 — Niveaux automatiques par paliers ELO + badges
-- =====================================================================

-- 1. Rename 'gx' → 'elite' in profiles.level
UPDATE profiles SET level = 'elite' WHERE level = 'gx';

-- 2. Insert 6 level badges into badges_catalog
INSERT INTO badges_catalog (badge_key, title, description, icon, category, sort_order)
VALUES
  ('level_scaled',  'Bienvenue Athlète',  'Badge de bienvenue — tu fais partie de la communauté AthleX !',      '🏋️', 'Classement', 1),
  ('level_inter',   'Inter Athlete',      'Tu as dépassé 1000 ELO — premier gain de classement !',              '🟦', 'Classement', 2),
  ('level_rx',      'RX Unlocked',        'Tu as atteint 1200 ELO — niveau RX débloqué !',                     '🟩', 'Classement', 3),
  ('level_rx_plus', 'RX+ Competitor',     'Tu as atteint 1400 ELO — tu es un vrai compétiteur !',              '🟧', 'Classement', 4),
  ('level_elite',   'Elite Warrior',      'Tu as atteint 1600 ELO — bienvenue parmi l''élite !',               '🟪', 'Classement', 5),
  ('level_pro',     'Pro Legend',          'Tu as atteint 1800 ELO — athlète d''exception !',                   '🟥', 'Classement', 6)
ON CONFLICT (badge_key) DO NOTHING;

-- 3. Recalculate level for ALL existing users based on their current ELO
UPDATE profiles
SET level = CASE
  WHEN elo >= 1800 THEN 'pro'
  WHEN elo >= 1600 THEN 'elite'
  WHEN elo >= 1400 THEN 'rx+'
  WHEN elo >= 1200 THEN 'rx'
  WHEN elo >= 800  THEN 'inter'
  ELSE 'scaled'
END;

-- 4. Retroactively award level badges for existing users
--    level_scaled for everyone
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_scaled' FROM profiles
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

--    level_inter for ELO > 1000
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_inter' FROM profiles WHERE elo > 1000
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

--    level_rx for ELO >= 1200
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_rx' FROM profiles WHERE elo >= 1200
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

--    level_rx_plus for ELO >= 1400
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_rx_plus' FROM profiles WHERE elo >= 1400
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

--    level_elite for ELO >= 1600
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_elite' FROM profiles WHERE elo >= 1600
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

--    level_pro for ELO >= 1800
INSERT INTO athlete_badges (athlete_id, badge_key)
SELECT id, 'level_pro' FROM profiles WHERE elo >= 1800
ON CONFLICT (athlete_id, badge_key) DO NOTHING;

-- 5. Remove old ELO badges from catalog (replaced by level badges)
DELETE FROM badges_catalog WHERE badge_key IN ('elo_1200', 'elo_1500', 'elo_2000');
DELETE FROM athlete_badges WHERE badge_key IN ('elo_1200', 'elo_1500', 'elo_2000');
