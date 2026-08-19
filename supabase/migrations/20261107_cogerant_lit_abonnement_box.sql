-- Le co-gérant lit l'abonnement de sa box ; seul le gérant le modifie.
--
-- `is_box_owner_admin` (gérant + co-gérant actif, coach exclu) gouverne déjà les
-- RPC d'argent, mais la policy SELECT de `box_subscriptions` n'acceptait que
-- `boxes.owner_id` : un co-gérant légitime lisait donc `null` et le back-office
-- lui affichait « Ton essai gratuit est terminé » sur une box active. Divergence
-- d'autorisation, pas choix produit.
--
-- Lecture seule : les mutations (checkout, résiliation, portail Stripe) passent
-- par les routes serveur en service_role, gardées sur le gérant réel. Les
-- privilèges INSERT/UPDATE de `authenticated` ne servaient donc rien — aucune
-- policy ne les accompagnait — et sont retirés pour que la fermeture tienne même
-- si une policy permissive réapparaît un jour.

DROP POLICY IF EXISTS box_owner_read_subscription ON public.box_subscriptions;

CREATE POLICY box_owner_read_subscription
  ON public.box_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_box_owner_admin(box_id));

REVOKE INSERT, UPDATE ON public.box_subscriptions FROM authenticated;

-- `anon` gardait un SELECT de colonnes, dont `stripe_customer_id` et
-- `stripe_subscription_id`. Aucune policy ne le laissait passer, mais un grant
-- sans usage est une porte qui attend sa policy. L'annuaire public lit cette
-- table en service_role.
REVOKE SELECT ON public.box_subscriptions FROM anon;
