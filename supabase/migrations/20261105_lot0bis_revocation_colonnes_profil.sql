-- Lot 0-bis (partie 2) — les trois dernières colonnes de profil se ferment.
--
-- Séparée de la partie 1 pour une raison de séquence, pas de style : la
-- révocation d'un droit de colonne fait échouer TOUTE requête qui mentionne la
-- colonne, y compris sur sa propre ligne. Les clients installés listaient
-- `full_name`, `gender` et `personal_records` dans la lecture de leur propre
-- profil : appliquée avant l'OTA, cette migration empêcherait un athlète de
-- charger SON profil.
--
-- Elle s'applique donc une fois l'OTA constatée sur les appareils. Les lecteurs
-- légitimes existent déjà (partie 1) :
--   soi          → get_my_profile()
--   staff (1 athlète) → get_athlete_private_profile(uuid)
--   staff (la box)    → get_box_members_private_profiles(uuid)
--
-- Ce qui reste public entre athlètes : pseudo, avatar, niveau, ELO, badges —
-- c'est-à-dire tout ce dont vivent les classements et les tableaux de tournoi.
-- Les LIGNES ne sont pas restreintes : aucun athlète ne disparaît d'un
-- classement, seules ces trois colonnes deviennent illisibles.

REVOKE SELECT (full_name)        ON public.profiles FROM authenticated;
REVOKE SELECT (gender)           ON public.profiles FROM authenticated;
REVOKE SELECT (personal_records) ON public.profiles FROM authenticated;
