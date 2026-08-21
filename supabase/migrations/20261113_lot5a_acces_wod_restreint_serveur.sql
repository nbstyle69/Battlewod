-- 20261113 — Lot 5-A : la restriction d'accès à un WOD de box devient serveur.
--
-- Constat (mesuré en production, recon du lot 5) : deux tables portent une
-- restriction d'accès sur un `box_wods` —
--
--   * `wod_program_access` : WOD réservé aux membres d'un programme payant ;
--   * `wod_group_access`   : WOD réservé aux membres d'un groupe de la box.
--
-- …et la policy de lecture ne les regardait pas :
--
--   member_see_published  SELECT  box_id IN (get_user_box_ids())
--                                 AND is_published
--                                 AND (publish_at IS NULL OR publish_at <= now())
--
-- Le seul filtre effectif vivait dans `canSee()` de `WhiteboardScreen`, donc
-- côté client. N'importe quel membre actif de la box lisait, à la clé
-- `authenticated`, le contenu réservé aux acheteurs d'un programme. C'est la
-- famille « autorisation prononcée par le client » : la valeur affichée est
-- correcte, la garde n'existe pas.
--
-- Les deux tables sont fermées ensemble : elles sont dans le même état, et
-- n'en fermer qu'une laisserait la même faille ouverte à côté.
--
-- Pourquoi une fonction et non un EXISTS inline : les policies de
-- `wod_program_access` / `wod_group_access` interrogent elles-mêmes `box_wods`
-- pour retrouver la box. Un EXISTS inline dans la policy de `box_wods`
-- déclencherait donc « infinite recursion detected in policy ». Le
-- SECURITY DEFINER coupe la récursion — et il ne rend qu'un booléen sur
-- l'appelant, aucune donnée.

CREATE OR REPLACE FUNCTION public.wod_access_allowed(p_wod_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Aucune restriction posée sur ce WOD → visible de tous les membres.
    (
      NOT EXISTS (SELECT 1 FROM public.wod_program_access a WHERE a.wod_id = p_wod_id)
      AND
      NOT EXISTS (SELECT 1 FROM public.wod_group_access g WHERE g.wod_id = p_wod_id)
    )
    -- Restreint à un programme : l'inscription doit être active.
    OR EXISTS (
      SELECT 1
      FROM public.wod_program_access a
      JOIN public.program_members pm ON pm.program_id = a.program_id
      WHERE a.wod_id = p_wod_id
        AND pm.user_id = auth.uid()
        AND pm.status = 'active'
    )
    -- Restreint à un groupe : l'appartenance vit dans `message_groups.members`.
    OR EXISTS (
      SELECT 1
      FROM public.wod_group_access g
      JOIN public.message_groups mg ON mg.id = g.group_id
      WHERE g.wod_id = p_wod_id
        AND auth.uid() = ANY (mg.members)
    );
$$;

COMMENT ON FUNCTION public.wod_access_allowed(uuid) IS
  'Lot 5-A : un WOD sans restriction est visible de tous les membres ; un WOD '
  'restreint exige une inscription active au programme ou l''appartenance au '
  'groupe. Appelée par la policy de lecture de box_wods (SECURITY DEFINER pour '
  'couper la récursion de policies). Le staff passe par ses policies ALL.';

-- Règle 14 : une fonction naît atteignable par PUBLIC (défaut du moteur) et par
-- `anon` (pg_default_acl de la plateforme). Le grant se referme nominativement
-- ET sur PUBLIC, sinon `anon` hérite.
REVOKE ALL ON FUNCTION public.wod_access_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wod_access_allowed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wod_access_allowed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wod_access_allowed(uuid) TO service_role;

-- La policy membre intègre la garde. Le staff (owner / co-gérant / coach) garde
-- ses policies ALL : il doit voir ce qu'il programme, restriction comprise.
DROP POLICY IF EXISTS member_see_published ON public.box_wods;
CREATE POLICY member_see_published ON public.box_wods
  FOR SELECT
  USING (
    box_id IN (SELECT get_user_box_ids())
    AND is_published = true
    AND (publish_at IS NULL OR publish_at <= now())
    AND public.wod_access_allowed(id)
  );

-- Le raffinement « semaine à venir » des groupes (`wod_visibility_mode`) reste
-- côté client : il est PLUS strict que cette policy, donc il ne peut pas rendre
-- visible ce que la base refuse. L'inverse aurait été un défaut.

DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'box_wods' AND policyname = 'member_see_published';

  IF v_qual IS NULL OR v_qual NOT LIKE '%wod_access_allowed%' THEN
    RAISE EXCEPTION 'La policy member_see_published n''appelle pas wod_access_allowed : %', v_qual;
  END IF;

  IF has_function_privilege('anon', 'public.wod_access_allowed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'wod_access_allowed reste exécutable par anon';
  END IF;
END $$;
