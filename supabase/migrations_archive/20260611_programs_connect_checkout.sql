-- ═══════════════════════════════════════════════════════════════
-- AthleX — Vente de programmes via Stripe Connect (Phase 1)
-- Colonnes complémentaires pour le checkout Connect + enrollment auto.
-- ═══════════════════════════════════════════════════════════════

-- ── programs : produit Stripe (créé sur le compte connecté) ──────
ALTER TABLE programs ADD COLUMN IF NOT EXISTS stripe_product_id text;

-- ── program_members : traçabilité paiement + abonnement (ongoing) ─
ALTER TABLE program_members ADD COLUMN IF NOT EXISTS stripe_subscription_id     text;
ALTER TABLE program_members ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- Statut 'pending' (session de paiement créée, non encore confirmée par webhook)
ALTER TABLE program_members DROP CONSTRAINT IF EXISTS program_members_status_check;
ALTER TABLE program_members
  ADD CONSTRAINT program_members_status_check
  CHECK (status IN ('pending','active','expired','cancelled','refunded'));

CREATE INDEX IF NOT EXISTS idx_pm_session ON program_members(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
