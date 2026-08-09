-- ═══════════════════════════════════════════════════════════════════════
-- push_tokens: stocke les tokens Expo Push pour chaque device/utilisateur
-- notification_preferences: préférences de notifications par utilisateur
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_tokens (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text NOT NULL DEFAULT 'unknown',  -- 'ios' | 'android'
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  UNIQUE(user_id, token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_reminder      boolean DEFAULT true,
  reminder_hour       int DEFAULT 9,              -- heure locale (0-23)
  friend_requests     boolean DEFAULT true,
  tournament_updates  boolean DEFAULT true,
  score_updates       boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own notification prefs"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
