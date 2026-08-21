-- Lot 5-B : un seul résolveur serveur pour « quelles box j'administre, et à
-- quel titre ».
--
-- Avant : la règle vivait à trois endroits (le résolveur serveur du dashboard,
-- le résolveur client, et la RPC `is_box_owner_admin` appelée séparément), et
-- aucun des deux résolveurs ne connaissait `role = 'coach'` — un coach de box
-- ne pouvait donc pas ouvrir le back-office du tout. Trois copies d'une règle
-- d'autorisation, c'est la divergence garantie.
--
-- Cette RPC rend la liste ET le titre (`my_role`), pour que la frontière argent
-- soit décidée par la base, pas recomposée par chaque appelant.
--
--   my_role = 'owner'  → gérant principal (boxes.owner_id) ou co-gérant
--                        (box_members.role = 'owner', actif)
--   my_role = 'coach'  → coach actif de la box (box_members.role = 'coach')
--
-- Le titre le plus fort gagne : un coach promu co-gérant est rendu 'owner'.
-- Les colonnes rendues sont volontairement celles que `authenticated` peut déjà
-- lire : ni `invite_code`, ni `stripe_account_id`, ni `dunning_grace_days`.

CREATE OR REPLACE FUNCTION public.get_my_admin_boxes()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  owner_id uuid,
  city text,
  logo_url text,
  is_active boolean,
  created_at timestamptz,
  allowed_tournament_formats text[],
  my_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    b.id, b.name, b.slug, b.owner_id, b.city, b.logo_url, b.is_active,
    b.created_at, b.allowed_tournament_formats,
    r.my_role
  FROM public.boxes b
  JOIN (
    SELECT box_id, MIN(rank) AS rank, CASE WHEN MIN(rank) = 1 THEN 'owner' ELSE 'coach' END AS my_role
    FROM (
      SELECT bx.id AS box_id, 1 AS rank
      FROM public.boxes bx
      WHERE bx.owner_id = auth.uid()
      UNION ALL
      SELECT bm.box_id, CASE WHEN bm.role = 'owner' THEN 1 ELSE 2 END
      FROM public.box_members bm
      WHERE bm.member_id = auth.uid()
        AND bm.role IN ('owner', 'coach')
        AND COALESCE(bm.status, 'active') = 'active'
    ) titres
    GROUP BY box_id
  ) r ON r.box_id = b.id
  WHERE auth.uid() IS NOT NULL
  ORDER BY b.created_at ASC;
$$;

COMMENT ON FUNCTION public.get_my_admin_boxes() IS
  'Lot 5-B : résolveur unique des box administrées par l''appelant, avec son titre (owner = gérant/co-gérant, coach). Les frontières argent se décident sur my_role, côté serveur.';

-- Règle 14 : une fonction naît fermée. `anon` n'a rien à faire ici — le
-- résolveur ne répond qu'à un appelant identifié.
REVOKE ALL ON FUNCTION public.get_my_admin_boxes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_admin_boxes() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_admin_boxes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_boxes() TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_my_admin_boxes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_admin_boxes reste exécutable par anon';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_my_admin_boxes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_admin_boxes n''est pas exécutable par authenticated';
  END IF;

  -- Le titre 'coach' ne doit jamais être rendu comme 'owner' : c'est cette
  -- valeur qui ouvre ou ferme les routes argent côté serveur.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_admin_boxes'
      AND pg_get_functiondef(p.oid) NOT LIKE '%''coach''%'
  ) THEN
    RAISE EXCEPTION 'get_my_admin_boxes ne distingue pas le titre coach';
  END IF;
END $$;
