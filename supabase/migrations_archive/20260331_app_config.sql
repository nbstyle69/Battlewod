-- ── app_config: key-value store for app-wide settings ──────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Allow anyone to read (no auth required — checked before login)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_read" ON app_config FOR SELECT USING (true);

-- Seed minimum version (bump this whenever you ship a breaking update)
INSERT INTO app_config (key, value) VALUES ('min_version', '1.0.22')
ON CONFLICT (key) DO NOTHING;
