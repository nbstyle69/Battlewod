-- Une compétition physique dont la date est passée n'est plus servie comme
-- « ouverte », quel que soit le `status` stocké (les imports arrivent `open`
-- et personne ne les clôture : 5 compétitions passées encore `open` en prod
-- le 5 septembre 2026, clôturées à la main le même jour).
--
-- Choix : une vue `security_invoker` qui recalcule le statut par date, plutôt
-- qu'un job planifié (une clôture différée reste fausse entre deux passes) ou
-- une colonne générée (`current_date` n'est pas immuable). La table reste la
-- source éditée par le back-office ; l'app lit la vue.
BEGIN;

CREATE OR REPLACE VIEW public.physical_competitions_served
WITH (security_invoker = true) AS
SELECT
  c.id, c.name, c.description, c.date, c.location,
  CASE
    WHEN c.status <> 'closed' AND c.date::date < current_date THEN 'closed'
    ELSE c.status
  END AS status,
  c.mode, c.logo_url, c.registration_url, c.format, c.price, c.created_by,
  c.created_at, c.start_date, c.end_date, c.start_time, c.end_time, c.team_size,
  c.has_individual, c.has_team, c.individual_genders, c.team_genders, c.team_sizes
FROM public.physical_competitions c;

COMMENT ON VIEW public.physical_competitions_served IS
  'Lecture app de physical_competitions : status vaut closed dès que date < aujourd''hui, sinon le status stocké.';

-- Lecture seule : les privilèges par défaut du schéma donneraient l'écriture à
-- authenticated ; les écritures passent par la table (RLS admin).
REVOKE ALL ON public.physical_competitions_served FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.physical_competitions_served TO anon, authenticated;

COMMIT;
