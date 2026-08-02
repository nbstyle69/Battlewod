-- ═══════════════════════════════════════════════════════════════════════
-- Générateur de WOD personnalisé (ranker) — tables de personnalisation
-- Spec : SPEC_GENERATEUR_PERSONNALISE.md
-- ═══════════════════════════════════════════════════════════════════════

-- ── Réglages de génération (1 ligne / utilisateur) ─────────────────────
CREATE TABLE IF NOT EXISTS user_generation_settings (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  goal         text NOT NULL DEFAULT 'balanced'
               CHECK (goal IN ('balanced', 'progress', 'race')),
  level_adjust numeric NOT NULL DEFAULT 0
               CHECK (level_adjust >= -0.10 AND level_adjust <= 0.10),
  -- [{"zone":"shoulder","until":"2026-08-08"}] ; until null = permanent
  avoid_zones  jsonb NOT NULL DEFAULT '[]',
  -- Déclaration Gymnastique (palier max par famille) → alimente gymLevel().
  -- { "pullup":"kipping", "hspu":"strict", "doubleUnder":"unbroken", ... }
  -- Les 1RM (charges) NE sont PAS ici : ils vivent dans profiles.personal_records (page Records).
  gym_declaration jsonb NOT NULL DEFAULT '{}',
  -- derniers paramètres utilisés (pré-remplissage de l'écran générateur)
  last_params  jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Préférences de mouvements apprises (bandit léger) ──────────────────
CREATE TABLE IF NOT EXISTS user_movement_prefs (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movement   text NOT NULL,               -- nom normalisé (lowercase), ex. 'thruster'
  score      numeric NOT NULL DEFAULT 0 CHECK (score >= -1 AND score <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movement)
);

-- ── Journal de feedback génération (chaque carte montrée / choisie…) ───
CREATE TABLE IF NOT EXISTS user_wod_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport      text NOT NULL CHECK (sport IN ('functional', 'hybrid')),
  seed       bigint NOT NULL,
  signature  text NOT NULL,               -- cfSignature / hyroxSignature
  movements  text[] NOT NULL DEFAULT '{}',-- noms normalisés
  params     jsonb NOT NULL DEFAULT '{}', -- CFParams / HyroxParams du tirage
  action     text NOT NULL CHECK (action IN ('shown', 'chosen', 'skipped', 'completed')),
  reason     text,                        -- chips regénération : too_long|disliked|equipment|too_hard|other
  rpe        text CHECK (rpe IN ('easy', 'perfect', 'hard')),
  rank       int,                         -- position de la carte (1..3) si shown/chosen
  is_challenge boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uwf_user_action_idx  ON user_wod_feedback(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS uwf_user_sig_idx     ON user_wod_feedback(user_id, signature);

-- ── Courses déclarées (mode Hybrid : périodisation) ────────────────────
CREATE TABLE IF NOT EXISTS user_races (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  race_date  date NOT NULL,
  format     text NOT NULL DEFAULT 'Solo'
             CHECK (format IN ('Solo', 'Doubles', 'Relais', 'Mixed Relais')),
  category   text NOT NULL DEFAULT 'Men'
             CHECK (category IN ('Women', 'Women Pro', 'Men', 'Men Pro')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_races_user_idx ON user_races(user_id, race_date);

-- ═══════════════ RLS : chaque utilisateur ne voit que ses lignes ═══════
ALTER TABLE user_generation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_movement_prefs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wod_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_races               ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_generation_settings','user_movement_prefs','user_wod_feedback','user_races'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_own" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_select_own" ON %I FOR SELECT USING (user_id = auth.uid())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_own" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_insert_own" ON %I FOR INSERT WITH CHECK (user_id = auth.uid())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update_own" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_update_own" ON %I FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_own" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_delete_own" ON %I FOR DELETE USING (user_id = auth.uid())', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
