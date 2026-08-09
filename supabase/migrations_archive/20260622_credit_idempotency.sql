-- ============================================================
-- Idempotence du webhook crédit (Drop-in / Carnet)
-- Stripe peut ré-émettre le même événement checkout.session.completed
-- (retry sur timeout / 5xx). Sans garde, chaque rejeu créait une ligne
-- de crédits en double. On garantit qu'une session de paiement Stripe
-- ne peut créer qu'une seule ligne de crédits.
-- ============================================================

-- Nettoyage défensif : si des doublons existent déjà, on ne garde que
-- la première ligne de chaque session (celle créée en premier).
DELETE FROM public.member_class_credits a
USING public.member_class_credits b
WHERE a.stripe_checkout_session_id IS NOT NULL
  AND a.stripe_checkout_session_id = b.stripe_checkout_session_id
  AND a.created_at > b.created_at;

-- Index unique partiel : une session Stripe = au plus une ligne de crédits.
-- (partiel car les crédits attribués manuellement n'ont pas de session id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_class_credits_session
  ON public.member_class_credits (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
