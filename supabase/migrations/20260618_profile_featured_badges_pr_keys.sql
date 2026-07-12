-- Profil : découpler le stockage des PR et des badges épinglés.
--
-- 1) Colonne dédiée `featured_badges` (les badges épinglés vivaient dans
--    profiles.personal_records->'_featured_badges', mélangés aux PR).
-- 2) Renommer les clés de PR : préfixe = libellé de catégorie codé en dur
--    (« Haltérophilie_… ») -> slug stable et neutre en langue (« weightlifting_… »).
--
-- Migration idempotente : réexécutable sans effet de bord.

-- 1. Colonne dédiée -----------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS featured_badges text[] NOT NULL DEFAULT '{}';

-- Backfill depuis l'ancien emplacement JSON (seulement si la colonne est vide).
UPDATE public.profiles
SET featured_badges = ARRAY(
  SELECT jsonb_array_elements_text(personal_records -> '_featured_badges')
)
WHERE personal_records ? '_featured_badges'
  AND jsonb_typeof(personal_records -> '_featured_badges') = 'array'
  AND cardinality(featured_badges) = 0;

-- 2. Renommage des clés de PR + suppression de _featured_badges ---------------
UPDATE public.profiles p
SET personal_records = (
  SELECT COALESCE(
    jsonb_object_agg(
      CASE
        WHEN starts_with(kv.key, 'Haltérophilie_')      THEN 'weightlifting_' || substr(kv.key, length('Haltérophilie_') + 1)
        WHEN starts_with(kv.key, 'Gymnastics_')          THEN 'gymnastics_'    || substr(kv.key, length('Gymnastics_') + 1)
        WHEN starts_with(kv.key, 'Benchmarks CrossFit_') THEN 'benchmarks_'    || substr(kv.key, length('Benchmarks CrossFit_') + 1)
        WHEN starts_with(kv.key, 'Cardio & Endurance_')  THEN 'cardio_'        || substr(kv.key, length('Cardio & Endurance_') + 1)
        ELSE kv.key
      END,
      kv.value
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(p.personal_records) kv
  WHERE kv.key <> '_featured_badges'
)
WHERE p.personal_records IS NOT NULL
  AND jsonb_typeof(p.personal_records) = 'object'
  AND (
    p.personal_records ? '_featured_badges'
    OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(p.personal_records) k
      WHERE starts_with(k, 'Haltérophilie_')
         OR starts_with(k, 'Gymnastics_')
         OR starts_with(k, 'Benchmarks CrossFit_')
         OR starts_with(k, 'Cardio & Endurance_')
    )
  );
