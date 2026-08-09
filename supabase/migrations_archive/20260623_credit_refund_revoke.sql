-- ============================================================
-- Révocation des crédits (Drop-in / Carnet) en cas de remboursement
-- Un achat unique de crédits remboursé (charge.refunded) doit retirer
-- l'accès : on trace le payment_intent Stripe sur la ligne de crédits
-- et on ajoute un statut 'refunded' que la couche d'enforcement ignore.
-- ============================================================

-- 1. Tracer le PaymentIntent Stripe (permet la correspondance au refund)
ALTER TABLE public.member_class_credits
  ADD COLUMN IF NOT EXISTS stripe_payment_intent text;

CREATE INDEX IF NOT EXISTS idx_member_class_credits_payment_intent
  ON public.member_class_credits (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

-- 2. Autoriser le statut 'refunded'
ALTER TABLE public.member_class_credits
  DROP CONSTRAINT IF EXISTS member_class_credits_status_check;
ALTER TABLE public.member_class_credits
  ADD CONSTRAINT member_class_credits_status_check
  CHECK (status IN ('active', 'expired', 'exhausted', 'refunded'));
