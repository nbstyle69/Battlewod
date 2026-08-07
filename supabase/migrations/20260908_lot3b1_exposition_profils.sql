-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 3B1 — EXPOSITION DES PROFILS : la part SANS dépendance à l'app
-- Basé sur le DUMP RÉEL (grants §3, policies §4 de la reco Lot 3).
--
-- ÉTAT MESURÉ :
--  • Policy `public_read_profiles` USING(true) → RLS ouverte à tous en lecture.
--  • anon a un grant SELECT colonne sur 22/25 colonnes de profiles : email,
--    referral_code, referred_by sont masqués, MAIS full_name, bio,
--    personal_records et gender sont lisibles SANS COMPTE. Nom complet +
--    données physiques (records perso) + genre = données personnelles
--    exposées publiquement. C'est le point RGPD.
--  • anon a INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES table-level sur
--    profiles ET boxes (défaut PostgREST, contenus par la seule RLS — même
--    configuration que box_members avant le Lot 2C).
--  • authenticated lit la TABLE ENTIÈRE de profiles, email compris : tout
--    compte connecté peut aspirer les 124 emails. → C'EST LE POINT CHAUD,
--    mais il est DÉPENDANT DE L'APP (AuthContext fait select('*') sur
--    profiles : révoquer une colonne casse le login de tous les téléphones).
--    Il part dans 3B2, coordonné avec le prochain build. Voir la spec jointe.
--
-- CE LOT NE TOUCHE DONC QUE ce que l'app installée ne peut pas remarquer :
--  1. anon perd la lecture de full_name, bio, personal_records, gender.
--     Il conserve le « profil public de compétition » : username, avatar,
--     niveau, elo, stats — ce que l'annuaire et les classements affichent.
--  2. anon perd TOUTE écriture sur profiles et boxes.
--  3. authenticated perd DELETE/TRUNCATE/TRIGGER/REFERENCES sur profiles
--     (aucune policy DELETE n'existe : la suppression passe par
--     delete_user_account, definer) et TRUNCATE/TRIGGER/REFERENCES sur boxes.
--     Son UPDATE/INSERT reste (édition de profil, création de box — RLS).
--  4. La policy USING(true) reste EN PLACE : l'app authentifiée en dépend
--     (recherche d'amis globale, classements inter-box). La resserrer, c'est
--     3B2 aussi.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. anon : plus de données personnelles en lecture publique.
REVOKE SELECT (full_name, bio, personal_records, gender)
  ON public.profiles FROM anon;

-- 2. anon : aucune écriture, sur aucune des deux tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.boxes FROM anon;

-- 3. authenticated : retirer ce qu'aucun flux client ne fait légitimement.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.boxes FROM authenticated;

NOTIFY pgrst, 'reload schema';
