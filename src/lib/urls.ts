// URL du site web AthleX (back office / onboarding gérant).
// Domaine public : athlexapp.eu (OVH → Vercel, www redirigé en 308).
export const WEB_URL = 'https://athlexapp.eu';

// Page d'inscription/abonnement des gérants de box (Stripe).
export const OWNER_ONBOARDING_URL = `${WEB_URL}/pricing/onboarding`;

// Grille tarifaire gérant (paywall + écran d'abonnement du back-office mobile).
export const PRICING_URL = `${WEB_URL}/pricing`;
