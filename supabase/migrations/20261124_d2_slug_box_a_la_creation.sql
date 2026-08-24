-- 20261124 — D2 : une box active et listée sans `slug` est invisible partout.
--
-- Mesuré en production le 2026-06-09 : 3 box `is_active AND is_listed`, 1 seule
-- carte dans l'annuaire `/box`. RAW PERFORMANCE et Crossfit AX ont `slug NULL`
-- et sont éliminées par le `.not('slug','is',null)` de l'annuaire — AVANT le
-- filtre d'abonnement, donc leur contrat n'y est pour rien. Corollaire : leur
-- page publique `/box/[slug]` est également inatteignable, puisque l'URL se
-- construit sur cette colonne.
--
-- Cause établie côté code : `app/api/create-box/route.ts` (le seul chemin de
-- création — l'inscription gérant est web uniquement depuis athlex-app#35)
-- n'écrit AUCUN slug à l'insertion, et la colonne n'est ensuite éditable que
-- dans `/settings`. Une box créée aujourd'hui naît donc invisible, et le reste
-- jusqu'à ce que son gérant trouve un champ dont rien ne lui signale l'effet.
--
-- Limite nommée : la création n'a PAS été rejouée en production (aucune
-- écriture de sonde). Ce que la lecture du code établit, c'est l'absence de
-- slug à l'insertion ; que les deux box existantes soient nées par ce chemin
-- reste une déduction, pas une mesure.
--
-- Pourquoi la garde est en base et pas dans la route : la route est UN chemin.
-- Un import, un script de dépannage, une future création depuis l'app
-- reproduiraient le défaut. Le trigger le rend impossible quelle que soit la
-- porte — y compris au service_role.
--
-- Pourquoi seulement à l'INSERT, et seulement si `slug IS NULL` :
--   • renommer une box ne doit PAS changer son URL publique (les liens posés
--     ailleurs deviendraient morts, en silence) ;
--   • un slug déjà choisi dans `/settings` fait foi — le trigger comble un
--     manque, il n'arbitre pas.

CREATE OR REPLACE FUNCTION public.slugify_box_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  -- `unaccent` n'est pas installé sur ce projet (7 extensions, mesuré) :
  -- la translittération est explicite plutôt que dépendante d'une extension
  -- qu'il faudrait faire installer par la plateforme.
  SELECT NULLIF(
    trim(
      both '-' FROM
      regexp_replace(
        regexp_replace(
          -- `lower` AVANT `translate` : sinon une majuscule accentuée (« Éléonore »)
          -- n'est pas dans le jeu source, survit à la translittération, et se fait
          -- effacer par le filtre de caractères — « eleonore » devient « leonore ».
          translate(
            lower(coalesce(p_name, '')),
            'àáâäãåèéêëìíîïòóôöõøùúûüçñýÿ',
            'aaaaaaeeeeiiiioooooouuuucnyy'
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-{2,}', '-', 'g'
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.slugify_box_name(text) IS
  'Slug public dérivé du nom de la box : minuscules, accents translittérés, séparateurs réduits à un tiret. NULL si le nom ne donne aucun caractère utilisable.';

CREATE OR REPLACE FUNCTION public.boxes_fill_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix int := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  v_base := public.slugify_box_name(NEW.name);

  -- Un nom qui ne rend aucun caractère utilisable (émoji seul, idéogrammes)
  -- ne doit pas produire un slug vide ni faire échouer la création : on retombe
  -- sur un identifiant stable dérivé de la clé primaire.
  IF v_base IS NULL THEN
    v_base := 'box-' || left(replace(NEW.id::text, '-', ''), 8);
  END IF;

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.boxes b WHERE b.slug = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix;
  END LOOP;

  NEW.slug := v_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_boxes_fill_slug ON public.boxes;
CREATE TRIGGER trg_boxes_fill_slug
  BEFORE INSERT ON public.boxes
  FOR EACH ROW
  EXECUTE FUNCTION public.boxes_fill_slug();

-- Rattrapage des box déjà créées sans slug. Ligne par ligne, avec la même
-- résolution de collision que le trigger : un `row_number()` global ne verrait
-- pas les slugs déjà pris par les box qui en ont un.
DO $$
DECLARE
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
BEGIN
  FOR r IN
    SELECT id, name FROM public.boxes
    WHERE slug IS NULL OR slug = ''
    ORDER BY created_at, id
  LOOP
    v_base := coalesce(
      public.slugify_box_name(r.name),
      'box-' || left(replace(r.id::text, '-', ''), 8)
    );
    v_candidate := v_base;
    v_suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.boxes b WHERE b.slug = v_candidate) LOOP
      v_suffix := v_suffix + 1;
      v_candidate := v_base || '-' || v_suffix;
    END LOOP;
    UPDATE public.boxes SET slug = v_candidate WHERE id = r.id;
    RAISE NOTICE 'slug posé : % → %', r.name, v_candidate;
  END LOOP;
END $$;
