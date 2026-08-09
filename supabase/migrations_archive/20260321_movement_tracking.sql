-- ============================================
-- MOVEMENT TRACKING: movement_logs + user_movement_stats + badges
-- ============================================

-- 1. Logs individuels par WOD ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movement_logs (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement    text NOT NULL,
  total_reps  int NOT NULL DEFAULT 0,
  weight_kg   numeric,
  source_type text NOT NULL DEFAULT 'wod' CHECK (source_type IN ('wod', 'tournament', 'daily', 'whiteboard')),
  source_id   text,
  logged_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.movement_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movement_logs_own_read"
  ON public.movement_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "movement_logs_own_insert"
  ON public.movement_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_movement_logs_user ON public.movement_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_movement_logs_movement ON public.movement_logs (user_id, movement);

-- 2. Cumuls persistants ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_movement_stats (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement    text NOT NULL,
  total_reps  bigint NOT NULL DEFAULT 0,
  best_weight numeric,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movement)
);

ALTER TABLE public.user_movement_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movement_stats_own_read"
  ON public.user_movement_stats FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "movement_stats_own_write"
  ON public.user_movement_stats FOR ALL
  USING (user_id = auth.uid());

-- 3. RPC pour incrémenter atomiquement ───────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_movement_stats(
  p_user_id uuid,
  p_movement text,
  p_reps int,
  p_weight numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_movement_stats (user_id, movement, total_reps, best_weight, updated_at)
  VALUES (p_user_id, p_movement, p_reps, p_weight, now())
  ON CONFLICT (user_id, movement)
  DO UPDATE SET
    total_reps = public.user_movement_stats.total_reps + p_reps,
    best_weight = GREATEST(public.user_movement_stats.best_weight, p_weight),
    updated_at = now();
END;
$$;

-- 4. Badges mouvements dans badges_catalog ───────────────────────────
-- Paliers: 100, 500, 1000, 5000 reps
-- Barbell
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_thrusters_100',    'Thruster Rookie',      '100 Thrusters cumulés',      '🏋️', 'movement', 100),
  ('mv_thrusters_500',    'Thruster Addict',      '500 Thrusters cumulés',      '🏋️', 'movement', 101),
  ('mv_thrusters_1000',   'Thruster Machine',     '1000 Thrusters cumulés',     '🏋️', 'movement', 102),
  ('mv_thrusters_5000',   'Thruster Legend',       '5000 Thrusters cumulés',     '🏋️', 'movement', 103),
  ('mv_deadlifts_100',    'Deadlift Rookie',      '100 Deadlifts cumulés',      '⚡', 'movement', 104),
  ('mv_deadlifts_500',    'Deadlift Addict',      '500 Deadlifts cumulés',      '⚡', 'movement', 105),
  ('mv_deadlifts_1000',   'Deadlift Machine',     '1000 Deadlifts cumulés',     '⚡', 'movement', 106),
  ('mv_deadlifts_5000',   'Deadlift Legend',       '5000 Deadlifts cumulés',     '⚡', 'movement', 107),
  ('mv_clean_100',        'Clean Rookie',         '100 Cleans cumulés (toutes variantes)', '💪', 'movement', 108),
  ('mv_clean_500',        'Clean Addict',         '500 Cleans cumulés',         '💪', 'movement', 109),
  ('mv_clean_1000',       'Clean Machine',        '1000 Cleans cumulés',        '💪', 'movement', 110),
  ('mv_clean_5000',       'Clean Legend',           '5000 Cleans cumulés',        '💪', 'movement', 111),
  ('mv_snatch_100',       'Snatch Rookie',        '100 Snatches cumulés (toutes variantes)', '🎯', 'movement', 112),
  ('mv_snatch_500',       'Snatch Addict',        '500 Snatches cumulés',       '🎯', 'movement', 113),
  ('mv_snatch_1000',      'Snatch Machine',       '1000 Snatches cumulés',      '🎯', 'movement', 114),
  ('mv_snatch_5000',      'Snatch Legend',          '5000 Snatches cumulés',      '🎯', 'movement', 115),
  ('mv_squat_100',        'Squat Rookie',         '100 Squats cumulés (toutes variantes)', '🦵', 'movement', 116),
  ('mv_squat_500',        'Squat Addict',         '500 Squats cumulés',         '🦵', 'movement', 117),
  ('mv_squat_1000',       'Squat Machine',        '1000 Squats cumulés',        '🦵', 'movement', 118),
  ('mv_squat_5000',       'Squat Legend',           '5000 Squats cumulés',        '🦵', 'movement', 119),
  ('mv_press_100',        'Press Rookie',         '100 Press cumulés (strict/push/jerk)', '🔱', 'movement', 120),
  ('mv_press_500',        'Press Addict',         '500 Press cumulés',          '🔱', 'movement', 121),
  ('mv_press_1000',       'Press Machine',        '1000 Press cumulés',         '🔱', 'movement', 122),
  ('mv_press_5000',       'Press Legend',           '5000 Press cumulés',         '🔱', 'movement', 123),
  ('mv_cj_100',           'C&J Rookie',           '100 Clean & Jerks cumulés',  '🔥', 'movement', 124),
  ('mv_cj_500',           'C&J Addict',           '500 Clean & Jerks cumulés',  '🔥', 'movement', 125),
  ('mv_cj_1000',          'C&J Machine',          '1000 Clean & Jerks cumulés', '🔥', 'movement', 126),
  ('mv_cj_5000',          'C&J Legend',             '5000 Clean & Jerks cumulés', '🔥', 'movement', 127),
  ('mv_ohs_100',          'OHS Rookie',           '100 Overhead Squats cumulés','🏛️', 'movement', 128),
  ('mv_ohs_500',          'OHS Addict',           '500 Overhead Squats cumulés','🏛️', 'movement', 129),
  ('mv_ohs_1000',         'OHS Machine',          '1000 Overhead Squats cumulés','🏛️', 'movement', 130),
  ('mv_sdlhp_100',        'SDLHP Rookie',         '100 Sumo Deadlift HP',       '⚡', 'movement', 131)
ON CONFLICT (badge_key) DO NOTHING;

-- Dumbbells
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_db_snatch_100',    'DB Snatch Rookie',     '100 DB Snatches cumulés',    '🔔', 'movement', 140),
  ('mv_db_snatch_500',    'DB Snatch Addict',     '500 DB Snatches cumulés',    '🔔', 'movement', 141),
  ('mv_db_snatch_1000',   'DB Snatch Machine',    '1000 DB Snatches cumulés',   '🔔', 'movement', 142),
  ('mv_db_thruster_100',  'DB Thruster Rookie',   '100 DB Thrusters cumulés',   '🏋️', 'movement', 143),
  ('mv_db_thruster_500',  'DB Thruster Addict',   '500 DB Thrusters cumulés',   '🏋️', 'movement', 144),
  ('mv_db_thruster_1000', 'DB Thruster Machine',  '1000 DB Thrusters cumulés',  '🏋️', 'movement', 145),
  ('mv_devil_press_100',  'Devil Press Rookie',   '100 Devil Press cumulés',    '😈', 'movement', 146),
  ('mv_devil_press_500',  'Devil Press Addict',   '500 Devil Press cumulés',    '😈', 'movement', 147),
  ('mv_devil_press_1000', 'Devil Press Machine',  '1000 Devil Press cumulés',   '😈', 'movement', 148),
  ('mv_db_lunge_100',     'DB Lunge Rookie',      '100 DB Lunges cumulés',      '🦵', 'movement', 149),
  ('mv_db_lunge_500',     'DB Lunge Addict',      '500 DB Lunges cumulés',      '🦵', 'movement', 150),
  ('mv_db_lunge_1000',    'DB Lunge Machine',     '1000 DB Lunges cumulés',     '🦵', 'movement', 151),
  ('mv_db_cj_100',        'DB C&J Rookie',        '100 DB Clean & Jerks',       '🔥', 'movement', 152),
  ('mv_db_cj_500',        'DB C&J Addict',        '500 DB Clean & Jerks',       '🔥', 'movement', 153),
  ('mv_db_cj_1000',       'DB C&J Machine',       '1000 DB Clean & Jerks',      '🔥', 'movement', 154),
  ('mv_db_push_press_100','DB Push Press Rookie',  '100 DB Push Press',          '🔱', 'movement', 155),
  ('mv_db_push_press_500','DB Push Press Addict',  '500 DB Push Press',          '🔱', 'movement', 156)
ON CONFLICT (badge_key) DO NOTHING;

-- Kettlebells
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_kb_swing_100',     'KB Swing Rookie',      '100 KB Swings cumulés',      '🔔', 'movement', 160),
  ('mv_kb_swing_500',     'KB Swing Addict',      '500 KB Swings cumulés',      '🔔', 'movement', 161),
  ('mv_kb_swing_1000',    'KB Swing Machine',     '1000 KB Swings cumulés',     '🔔', 'movement', 162),
  ('mv_kb_swing_5000',    'KB Swing Legend',        '5000 KB Swings cumulés',     '🔔', 'movement', 163),
  ('mv_goblet_squat_100', 'Goblet Squat Rookie',  '100 Goblet Squats cumulés',  '🦵', 'movement', 164),
  ('mv_goblet_squat_500', 'Goblet Squat Addict',  '500 Goblet Squats cumulés',  '🦵', 'movement', 165),
  ('mv_kb_snatch_100',    'KB Snatch Rookie',     '100 KB Snatches cumulés',    '🎯', 'movement', 166),
  ('mv_kb_snatch_500',    'KB Snatch Addict',     '500 KB Snatches cumulés',    '🎯', 'movement', 167),
  ('mv_kb_cj_100',        'KB C&J Rookie',        '100 KB Clean & Jerks',       '🔥', 'movement', 168),
  ('mv_kb_cj_500',        'KB C&J Addict',        '500 KB Clean & Jerks',       '🔥', 'movement', 169),
  ('mv_turkish_gu_100',   'Turkish Get-up Rookie', '100 Turkish Get-ups',        '🎯', 'movement', 170),
  ('mv_turkish_gu_500',   'Turkish Get-up Addict', '500 Turkish Get-ups',        '🎯', 'movement', 171),
  ('mv_kb_thruster_100',  'KB Thruster Rookie',   '100 KB Thrusters cumulés',   '🏋️', 'movement', 172),
  ('mv_kb_thruster_500',  'KB Thruster Addict',   '500 KB Thrusters cumulés',   '🏋️', 'movement', 173)
ON CONFLICT (badge_key) DO NOTHING;

-- Box
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_box_jump_100',     'Box Jump Rookie',      '100 Box Jumps cumulés',      '📦', 'movement', 180),
  ('mv_box_jump_500',     'Box Jump Addict',      '500 Box Jumps cumulés',      '📦', 'movement', 181),
  ('mv_box_jump_1000',    'Box Jump Machine',     '1000 Box Jumps cumulés',     '📦', 'movement', 182),
  ('mv_burpee_bj_100',    'Burpee Box Jump Rookie','100 Burpee Box Jumps',      '📦', 'movement', 183),
  ('mv_burpee_bj_500',    'Burpee Box Jump Addict','500 Burpee Box Jumps',      '📦', 'movement', 184)
ON CONFLICT (badge_key) DO NOTHING;

-- Jump Rope
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_du_500',           'DU Rookie',            '500 Double Unders cumulés',  '🪢', 'movement', 190),
  ('mv_du_2000',          'DU Addict',            '2000 Double Unders cumulés', '🪢', 'movement', 191),
  ('mv_du_5000',          'DU Machine',           '5000 Double Unders cumulés', '🪢', 'movement', 192),
  ('mv_du_10000',         'DU Legend',              '10000 Double Unders cumulés','🪢', 'movement', 193),
  ('mv_su_1000',          'Single Under Rookie',  '1000 Single Unders',         '🪢', 'movement', 194),
  ('mv_su_5000',          'Single Under Machine', '5000 Single Unders',         '🪢', 'movement', 195)
ON CONFLICT (badge_key) DO NOTHING;

-- Pull-up bar
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_pullup_100',       'Pull-up Rookie',       '100 Pull-ups cumulés',       '💪', 'movement', 200),
  ('mv_pullup_500',       'Pull-up Addict',       '500 Pull-ups cumulés',       '💪', 'movement', 201),
  ('mv_pullup_1000',      'Pull-up Machine',      '1000 Pull-ups cumulés',      '💪', 'movement', 202),
  ('mv_pullup_5000',      'Pull-up Legend',         '5000 Pull-ups cumulés',      '💪', 'movement', 203),
  ('mv_c2b_100',          'C2B Rookie',           '100 Chest-to-bar cumulés',   '💪', 'movement', 204),
  ('mv_c2b_500',          'C2B Addict',           '500 Chest-to-bar cumulés',   '💪', 'movement', 205),
  ('mv_c2b_1000',         'C2B Machine',          '1000 Chest-to-bar cumulés',  '💪', 'movement', 206),
  ('mv_t2b_100',          'T2B Rookie',           '100 Toes-to-bar cumulés',    '🦵', 'movement', 207),
  ('mv_t2b_500',          'T2B Addict',           '500 Toes-to-bar cumulés',    '🦵', 'movement', 208),
  ('mv_t2b_1000',         'T2B Machine',          '1000 Toes-to-bar cumulés',   '🦵', 'movement', 209),
  ('mv_bmu_100',          'Bar MU Rookie',        '100 Bar Muscle-ups cumulés', '🏆', 'movement', 210),
  ('mv_bmu_500',          'Bar MU Addict',        '500 Bar Muscle-ups cumulés', '🏆', 'movement', 211),
  ('mv_k2e_100',          'K2E Rookie',           '100 Knees-to-elbows',        '🦵', 'movement', 212),
  ('mv_k2e_500',          'K2E Addict',           '500 Knees-to-elbows',        '🦵', 'movement', 213),
  ('mv_pullover_100',     'Pull-Over Rookie',     '100 Pull-Overs cumulés',     '💪', 'movement', 214),
  ('mv_pullover_500',     'Pull-Over Addict',     '500 Pull-Overs cumulés',     '💪', 'movement', 215)
ON CONFLICT (badge_key) DO NOTHING;

-- Rings
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_ring_mu_50',       'Ring MU Rookie',       '50 Ring Muscle-ups cumulés', '🏆', 'movement', 220),
  ('mv_ring_mu_200',      'Ring MU Addict',       '200 Ring Muscle-ups cumulés','🏆', 'movement', 221),
  ('mv_ring_mu_500',      'Ring MU Machine',      '500 Ring Muscle-ups cumulés','🏆', 'movement', 222),
  ('mv_ring_dip_100',     'Ring Dip Rookie',      '100 Ring Dips cumulés',      '💪', 'movement', 223),
  ('mv_ring_dip_500',     'Ring Dip Addict',      '500 Ring Dips cumulés',      '💪', 'movement', 224),
  ('mv_ring_row_100',     'Ring Row Rookie',      '100 Ring Rows cumulés',      '💪', 'movement', 225),
  ('mv_ring_row_500',     'Ring Row Addict',      '500 Ring Rows cumulés',      '💪', 'movement', 226)
ON CONFLICT (badge_key) DO NOTHING;

-- Bodyweight
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_burpee_100',       'Burpee Rookie',        '100 Burpees cumulés',        '🤮', 'movement', 230),
  ('mv_burpee_500',       'Burpee Addict',        '500 Burpees cumulés',        '🤮', 'movement', 231),
  ('mv_burpee_1000',      'Burpee Machine',       '1000 Burpees cumulés',       '🤮', 'movement', 232),
  ('mv_burpee_5000',      'Burpee Legend',          '5000 Burpees cumulés',       '🤮', 'movement', 233),
  ('mv_air_squat_100',    'Air Squat Rookie',     '100 Air Squats cumulés',     '🦵', 'movement', 234),
  ('mv_air_squat_500',    'Air Squat Addict',     '500 Air Squats cumulés',     '🦵', 'movement', 235),
  ('mv_air_squat_1000',   'Air Squat Machine',    '1000 Air Squats cumulés',    '🦵', 'movement', 236),
  ('mv_air_squat_5000',   'Air Squat Legend',      '5000 Air Squats cumulés',    '🦵', 'movement', 237),
  ('mv_pushup_100',       'Push-up Rookie',       '100 Push-ups cumulés',       '💪', 'movement', 238),
  ('mv_pushup_500',       'Push-up Addict',       '500 Push-ups cumulés',       '💪', 'movement', 239),
  ('mv_pushup_1000',      'Push-up Machine',      '1000 Push-ups cumulés',      '💪', 'movement', 240),
  ('mv_pushup_5000',      'Push-up Legend',        '5000 Push-ups cumulés',      '💪', 'movement', 241),
  ('mv_situp_100',        'Sit-up Rookie',        '100 Sit-ups cumulés',        '🦵', 'movement', 242),
  ('mv_situp_500',        'Sit-up Addict',        '500 Sit-ups cumulés',        '🦵', 'movement', 243),
  ('mv_situp_1000',       'Sit-up Machine',       '1000 Sit-ups cumulés',       '🦵', 'movement', 244),
  ('mv_lunge_100',        'Lunge Rookie',         '100 Lunges cumulés',         '🦵', 'movement', 245),
  ('mv_lunge_500',        'Lunge Addict',         '500 Lunges cumulés',         '🦵', 'movement', 246),
  ('mv_lunge_1000',       'Lunge Machine',        '1000 Lunges cumulés',        '🦵', 'movement', 247),
  ('mv_pistol_100',       'Pistol Squat Rookie',  '100 Pistol Squats cumulés',  '🎯', 'movement', 248),
  ('mv_pistol_500',       'Pistol Squat Addict',  '500 Pistol Squats cumulés',  '🎯', 'movement', 249),
  ('mv_hspu_100',         'HSPU Rookie',          '100 HSPU cumulés',           '🤸', 'movement', 250),
  ('mv_hspu_500',         'HSPU Addict',          '500 HSPU cumulés',           '🤸', 'movement', 251),
  ('mv_hspu_1000',        'HSPU Machine',         '1000 HSPU cumulés',          '🤸', 'movement', 252),
  ('mv_wallwalk_100',     'Wall Walk Rookie',     '100 Wall Walks cumulés',     '🤸', 'movement', 253),
  ('mv_wallwalk_500',     'Wall Walk Addict',     '500 Wall Walks cumulés',     '🤸', 'movement', 254),
  ('mv_vup_100',          'V-up Rookie',          '100 V-ups cumulés',          '🦵', 'movement', 255),
  ('mv_vup_500',          'V-up Addict',          '500 V-ups cumulés',          '🦵', 'movement', 256),
  ('mv_hollow_100',       'Hollow Rock Rookie',   '100 Hollow Rocks cumulés',   '🦵', 'movement', 257),
  ('mv_hollow_500',       'Hollow Rock Addict',   '500 Hollow Rocks cumulés',   '🦵', 'movement', 258),
  ('mv_mtclimber_100',    'Mt. Climber Rookie',   '100 Mountain Climbers',      '🏔️', 'movement', 259),
  ('mv_mtclimber_500',    'Mt. Climber Addict',   '500 Mountain Climbers',      '🏔️', 'movement', 260)
ON CONFLICT (badge_key) DO NOTHING;

-- Wall Balls / Med Ball
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_wallball_100',     'Wall Ball Rookie',     '100 Wall Balls cumulés',     '🏐', 'movement', 270),
  ('mv_wallball_500',     'Wall Ball Addict',     '500 Wall Balls cumulés',     '🏐', 'movement', 271),
  ('mv_wallball_1000',    'Wall Ball Machine',    '1000 Wall Balls cumulés',    '🏐', 'movement', 272),
  ('mv_wallball_5000',    'Wall Ball Legend',      '5000 Wall Balls cumulés',    '🏐', 'movement', 273),
  ('mv_mb_slam_100',      'MB Slam Rookie',       '100 Med Ball Slams cumulés', '🏐', 'movement', 274),
  ('mv_mb_slam_500',      'MB Slam Addict',       '500 Med Ball Slams cumulés', '🏐', 'movement', 275)
ON CONFLICT (badge_key) DO NOTHING;

-- Erg
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_row_500',          'Rameur Rookie',        '500 cal Rameur cumulées',    '🚣', 'movement', 280),
  ('mv_row_2000',         'Rameur Addict',        '2000 cal Rameur cumulées',   '🚣', 'movement', 281),
  ('mv_row_5000',         'Rameur Machine',       '5000 cal Rameur cumulées',   '🚣', 'movement', 282),
  ('mv_bike_500',         'Assault Bike Rookie',  '500 cal Bike cumulées',      '🚴', 'movement', 283),
  ('mv_bike_2000',        'Assault Bike Addict',  '2000 cal Bike cumulées',     '🚴', 'movement', 284),
  ('mv_ski_500',          'Ski Erg Rookie',       '500 cal Ski cumulées',       '⛷️', 'movement', 285),
  ('mv_ski_2000',         'Ski Erg Addict',       '2000 cal Ski cumulées',      '⛷️', 'movement', 286)
ON CONFLICT (badge_key) DO NOTHING;

-- Méta-badges
INSERT INTO public.badges_catalog (badge_key, title, description, icon, category, sort_order) VALUES
  ('mv_polyvalent_5',     'Polyvalent',           '5 mouvements avec 100+ reps', '🎯', 'movement', 290),
  ('mv_polyvalent_10',    'Touche-à-tout',        '10 mouvements avec 100+ reps','🎯', 'movement', 291),
  ('mv_polyvalent_20',    'Maître des mouvements','20 mouvements avec 100+ reps','🎯', 'movement', 292),
  ('mv_total_10k',        '10K Club',             '10 000 reps totales cumulées','🏛️', 'movement', 293),
  ('mv_total_50k',        '50K Club',             '50 000 reps totales cumulées','🏛️', 'movement', 294),
  ('mv_total_100k',       '100K Club',            '100 000 reps totales cumulées','🏛️', 'movement', 295)
ON CONFLICT (badge_key) DO NOTHING;
