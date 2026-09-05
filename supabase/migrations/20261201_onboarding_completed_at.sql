-- « Présentation vue » côté compte, plus côté appareil.
--
-- La clé locale @athlex:onboardingDone est purgée au signOut (3.8, appareils
-- partagés) : le même utilisateur revoyait la présentation à chaque
-- reconnexion. La source devient profiles.onboarding_completed_at :
--   - NULL      → le compte n'a jamais terminé la présentation, elle s'affiche ;
--   - non NULL  → terminée, sur aucun appareil elle ne revient.
-- get_my_profile() est SETOF profiles : la colonne remonte sans la reprendre.
-- L'écriture passe par une RPC idempotente (premier horodatage conservé), en
-- SECURITY DEFINER sur auth.uid() : le client n'a pas à toucher la table.
-- Le tutoriel guidé de l'interface (@athlex:tourDone) reste lié à l'appareil.
-- Aucune ligne existante n'est modifiée : les comptes déjà créés (dont le
-- compte reviewer Apple) gardent NULL et verront la présentation une fois.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'Horodatage de fin de la présentation (carrousel d''accueil). NULL = jamais vue. Source d''autorité, la clé locale n''est qu''un cache.';

CREATE OR REPLACE FUNCTION public.mark_onboarding_completed()
RETURNS timestamptz
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.profiles
     SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
   WHERE id = auth.uid()
  RETURNING onboarding_completed_at;
$$;

REVOKE ALL ON FUNCTION public.mark_onboarding_completed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_onboarding_completed() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_onboarding_completed() TO authenticated;

COMMIT;
