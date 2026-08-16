-- Statistiques — bloc Assiduité : agrégats de fréquentation servis côté serveur.
--
-- Même architecture que le bloc Argent (20261025) : SECURITY DEFINER gardé par
-- `is_box_admin`, exception explicite hors de sa box plutôt qu'un zéro ligne
-- qui se lirait comme « aucune absence », et `search_path` figé.
--
-- Deux partis pris qui viennent des données réelles, pas d'une intuition :
--
--  1. « À risque » ne concerne QUE les membres ayant déjà réservé au moins une
--     fois. Sur la box de production, 25 des 39 adhérents n'ont jamais réservé
--     via l'app : les compter comme décrochés produirait un mur rouge sans
--     action associée. Ils sont rendus séparément, sous `never_booked` — le
--     gérant les embarque, il ne les relance pas.
--
--     Ces deux populations ne retiennent que `role = 'member'` : un coach est
--     inscrit dans `box_members` (2 sur les 39 adhésions de la box de prod) et
--     ne réserve pas les cours qu'il anime. Le lister à embarquer serait du
--     bruit dans la seule liste censée ne contenir que des actions à mener.
--
--  2. Le taux de présence réelle est rapporté aux réservations POINTÉES, pas
--     aux réservations tout court, et le nombre de pointages est rendu à côté.
--     Un ratio présents/réservés sur une box qui pointe 1 cours sur 91 dirait
--     « 1 % d'assiduité » là où la réalité est « on ne pointe pas encore ».

BEGIN;

-- ── 1. Synthèse d'assiduité ───────────────────────────────────────────────
--
-- La fenêtre porte sur la DATE DU COURS (`scheduled_date`), pas sur la date de
-- réservation : une réservation prise il y a trois semaines pour demain n'est
-- pas de la fréquentation passée. Les cours à venir sont donc exclus.

CREATE OR REPLACE FUNCTION public.get_box_attendance_summary(
  p_box_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE (
  classes_count        integer,
  capacity_total       integer,
  reservations_count   integer,
  waiting_count        integer,
  marked_count         integer,
  attended_count       integer,
  members_active       integer,
  members_ever_booked  integer,
  members_at_risk      integer,
  members_never_booked integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cours AS (
    SELECT cs.id, cs.max_capacity
    FROM public.class_schedules cs
    WHERE cs.box_id = p_box_id
      AND cs.scheduled_date >= p_from
      AND cs.scheduled_date <  p_to
      AND cs.scheduled_date <  current_date
  ),
  resas AS (
    SELECT cr.status, cr.attended
    FROM public.class_reservations cr
    JOIN cours c ON c.id = cr.schedule_id
  ),
  membres AS (
    SELECT bm.member_id,
           (SELECT max(cs.scheduled_date)
              FROM public.class_reservations cr
              JOIN public.class_schedules cs ON cs.id = cr.schedule_id
             WHERE cr.member_id = bm.member_id
               AND cr.box_id = p_box_id
               AND cs.scheduled_date < current_date) AS derniere_venue
    FROM public.box_members bm
    WHERE bm.box_id = p_box_id
      AND bm.status = 'active'
      AND bm.role = 'member'
  )
  SELECT
    (SELECT count(*)::integer FROM cours),
    (SELECT coalesce(sum(max_capacity), 0)::integer FROM cours),
    (SELECT count(*)::integer FROM resas WHERE status = 'confirmed'),
    (SELECT count(*)::integer FROM resas WHERE status = 'waiting'),
    (SELECT count(*)::integer FROM resas WHERE attended IS NOT NULL),
    (SELECT count(*)::integer FROM resas WHERE attended),
    (SELECT count(*)::integer FROM membres),
    (SELECT count(*)::integer FROM membres WHERE derniere_venue IS NOT NULL),
    -- À risque : a déjà réservé, mais plus rien depuis 14 jours.
    (SELECT count(*)::integer FROM membres
      WHERE derniere_venue IS NOT NULL
        AND derniere_venue < current_date - 14),
    (SELECT count(*)::integer FROM membres WHERE derniere_venue IS NULL);
END;
$$;

-- ── 2. Les personnes derrière les agrégats ────────────────────────────────
--
-- Deux populations, deux actions distinctes, un seul appel :
--   'at_risk'      a déjà réservé, silencieux depuis `p_risk_days` → relancer ;
--   'never_booked' n'a jamais réservé via l'app                    → embarquer.
--
-- L'e-mail n'est pas rendu : l'écran dispose déjà de la RPC d'e-mails réservée
-- aux admins de la box, inutile d'ouvrir une seconde voie vers `profiles.email`.

CREATE OR REPLACE FUNCTION public.get_box_attendance_people(
  p_box_id    uuid,
  p_risk_days integer DEFAULT 14
)
RETURNS TABLE (
  kind               text,
  member_id          uuid,
  username           text,
  last_class         date,
  reservations_total integer,
  joined_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH membres AS (
    SELECT bm.member_id,
           bm.joined_at,
           coalesce(pr.username, '—') AS nom,
           (SELECT count(*)
              FROM public.class_reservations cr
             WHERE cr.member_id = bm.member_id
               AND cr.box_id = p_box_id)::integer AS resas,
           (SELECT max(cs.scheduled_date)
              FROM public.class_reservations cr
              JOIN public.class_schedules cs ON cs.id = cr.schedule_id
             WHERE cr.member_id = bm.member_id
               AND cr.box_id = p_box_id
               AND cs.scheduled_date < current_date) AS derniere_venue
    FROM public.box_members bm
    LEFT JOIN public.profiles pr ON pr.id = bm.member_id
    WHERE bm.box_id = p_box_id
      AND bm.status = 'active'
      AND bm.role = 'member'
  )
  SELECT CASE WHEN m.derniere_venue IS NULL THEN 'never_booked' ELSE 'at_risk' END,
         m.member_id,
         m.nom,
         m.derniere_venue,
         m.resas,
         m.joined_at
  FROM membres m
  WHERE m.derniere_venue IS NULL
     OR m.derniere_venue < current_date - p_risk_days
  ORDER BY m.derniere_venue ASC NULLS LAST, m.joined_at ASC;
END;
$$;

-- ── 3. Heatmap jour × heure ───────────────────────────────────────────────
--
-- `class_schedules.start_time` est du texte ('09:00') : l'heure est extraite du
-- préfixe. `dow` suit la convention ISO (1 = lundi … 7 = dimanche) pour que
-- l'écran affiche une semaine qui commence le lundi sans retraiter la valeur.
--
-- Même exclusion des cours à venir que la synthèse : les deux chiffres sont lus
-- côte à côte sur le même écran, un cours du jour compté ici et pas là ferait
-- deux totaux différents pour la même période.

CREATE OR REPLACE FUNCTION public.get_box_reservation_heatmap(
  p_box_id uuid,
  p_from   date,
  p_to     date
)
RETURNS TABLE (
  dow           integer,
  hour          integer,
  reservations  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: vous n''administrez pas cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT extract(isodow FROM cs.scheduled_date)::integer,
         coalesce(nullif(split_part(cs.start_time, ':', 1), ''), '0')::integer,
         count(*)::integer
  FROM public.class_reservations cr
  JOIN public.class_schedules cs ON cs.id = cr.schedule_id
  WHERE cs.box_id = p_box_id
    AND cr.status = 'confirmed'
    AND cs.scheduled_date >= p_from
    AND cs.scheduled_date <  p_to
    AND cs.scheduled_date <  current_date
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

-- ── 4. Grants ─────────────────────────────────────────────────────────────
--
-- `authenticated` seulement : `is_box_admin` a besoin d'un `auth.uid()`, et ces
-- listes sont nominatives.

REVOKE ALL ON FUNCTION public.get_box_attendance_summary(uuid, date, date)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_box_attendance_people(uuid, integer)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_box_reservation_heatmap(uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_box_attendance_summary(uuid, date, date)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_box_attendance_people(uuid, integer)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_box_reservation_heatmap(uuid, date, date) TO authenticated, service_role;

COMMIT;
