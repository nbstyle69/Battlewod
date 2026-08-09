-- ═══════════════════════════════════════════════════════════════
-- AthleX B2B — box_subscriptions + colonnes annuaire boxes
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Table box_subscriptions ──────────────────────────────
CREATE TABLE IF NOT EXISTS box_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id                 uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_tier              text NOT NULL DEFAULT 'trial'
                         CHECK (plan_tier IN ('trial', 'complete')),
  status                 text NOT NULL DEFAULT 'trialing'
                         CHECK (status IN ('trialing','active','past_due','canceled','expired')),
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  is_early_adopter       boolean DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_box_subscriptions_box_id ON box_subscriptions(box_id);
CREATE INDEX IF NOT EXISTS idx_box_subscriptions_status ON box_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_box_subscriptions_stripe_customer ON box_subscriptions(stripe_customer_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_box_subscription_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_box_subscriptions_updated_at ON box_subscriptions;
CREATE TRIGGER trg_box_subscriptions_updated_at
  BEFORE UPDATE ON box_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_box_subscription_updated_at();

-- ── 2. RLS on box_subscriptions ─────────────────────────────
ALTER TABLE box_subscriptions ENABLE ROW LEVEL SECURITY;

-- Box owner can read their own subscription
CREATE POLICY "box_owner_read_subscription"
  ON box_subscriptions FOR SELECT
  USING (
    box_id IN (
      SELECT id FROM boxes WHERE owner_id = auth.uid()
    )
  );

-- Box owner can insert (for trial creation at box creation)
CREATE POLICY "box_owner_insert_subscription"
  ON box_subscriptions FOR INSERT
  WITH CHECK (
    box_id IN (
      SELECT id FROM boxes WHERE owner_id = auth.uid()
    )
  );

-- Only service_role (Edge Functions) can update (webhook writes)
CREATE POLICY "service_role_update_subscription"
  ON box_subscriptions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ── 3. Nouvelles colonnes boxes (annuaire web) ─────────────
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS sport_type text[] DEFAULT '{}';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS is_listed boolean DEFAULT true;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS member_count int DEFAULT 0;

-- Index pour l'annuaire (recherche par ville, sport, localisation)
CREATE INDEX IF NOT EXISTS idx_boxes_city ON boxes(city);
CREATE INDEX IF NOT EXISTS idx_boxes_is_listed ON boxes(is_listed) WHERE is_listed = true;
CREATE INDEX IF NOT EXISTS idx_boxes_sport_type ON boxes USING gin(sport_type);

-- ── 4. Trigger member_count auto-update ─────────────────────
CREATE OR REPLACE FUNCTION update_box_member_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = NEW.box_id AND status = 'active'
    ) WHERE id = NEW.box_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = OLD.box_id AND status = 'active'
    ) WHERE id = OLD.box_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE boxes SET member_count = (
      SELECT count(*) FROM box_members WHERE box_id = NEW.box_id AND status = 'active'
    ) WHERE id = NEW.box_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_box_member_count ON box_members;
CREATE TRIGGER trg_box_member_count
  AFTER INSERT OR UPDATE OR DELETE ON box_members
  FOR EACH ROW
  EXECUTE FUNCTION update_box_member_count();

-- ── 5. Helper RPC: count total boxes (for early adopter logic) ──
CREATE OR REPLACE FUNCTION get_total_box_count()
RETURNS int AS $$
  SELECT count(*)::int FROM boxes;
$$ LANGUAGE sql SECURITY DEFINER;
