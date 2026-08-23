-- 20261122 — Les heures de début sont du texte : la garde dit lequel.
--
-- `class_schedules.start_time`, `schedule_templates.start_time` et
-- `physical_competitions.start_time` sont des colonnes `text`, et tout le code
-- qui les consomme suppose EXACTEMENT `HH:MM` :
--
--   • l'app construit un instant par concaténation —
--     `new Date(\`${scheduled_date}T${start_time}:00\`)` (ReservationScreen,
--     MyReservationsScreen) : `9:00` y donne `Invalid Date`, donc un créneau
--     dont le délai d'inscription ne se calcule plus, en silence ;
--   • le tri des créneaux est un tri de CHAÎNES (`.order('start_time')`,
--     `Array.from(new Set(...)).sort()`) : `9:00` se classe après `10:00` ;
--   • la génération depuis les semaines types déduplique sur l'égalité de
--     chaîne (`cs.start_time = t.start_time`) : `9:00` face à `09:00` crée un
--     doublon au lieu de reconnaître le créneau déjà posé.
--
-- Le type ne change pas — le convertir en `time` réécrirait chaque lecture et
-- chaque comparaison de l'app pour une dette latente. La garde, elle, maintient
-- vraie la seule propriété dont ces lectures dépendent.
--
-- Rien n'est rejeté à la pose : mesuré en production le 2026-06-09,
-- class_schedules 1254/1254, schedule_templates 42/42, physical_competitions
-- 13/13 conformes. `physical_competitions.start_time` est nullable et le reste
-- (le formulaire admin écrit `startTime || null`).

ALTER TABLE public.class_schedules
  ADD CONSTRAINT class_schedules_start_time_hhmm
  CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE public.schedule_templates
  ADD CONSTRAINT schedule_templates_start_time_hhmm
  CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE public.physical_competitions
  ADD CONSTRAINT physical_competitions_start_time_hhmm
  CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
