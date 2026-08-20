-- Lot 4 — correctif de grant : la RPC de lecture staff restait exécutable par PUBLIC.
--
-- 20261110 révoquait sur `anon` et accordait à `authenticated`, mais `anon` hérite du
-- grant implicite de PUBLIC : la clé anonyme atteignait donc le corps de la fonction.
-- Le refus venait du fail-closed interne (« Authentification requise »), pas du grant —
-- une seule barrière au lieu de deux, contrairement à get_athlete_private_profile().

REVOKE ALL ON FUNCTION public.list_athlete_strength_sets(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_athlete_strength_sets(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_athlete_strength_sets(uuid, integer) TO authenticated;
