-- Lot 6 — l'espace coach : la grille de créneaux récurrents passe à la même
-- frontière que les créneaux qu'elle génère.
--
-- État constaté avant ce lot, et c'est une divergence, pas un choix :
--
--   class_schedules                        coach_manage_schedules   is_box_coach(box_id)
--                                          ..._coowner_manage       is_box_owner_member(box_id)
--   generate_class_schedules_from_templates                          is_box_admin(p_box_id)
--   schedule_templates                     box_owner_manage_templates
--                                              boxes.owner_id = auth.uid()
--
-- Donc : le coach modifie un créneau à l'unité, il peut GÉNÉRER les créneaux
-- depuis les modèles, mais il ne peut pas écrire le modèle. Et le co-gérant non
-- plus — la policy ne connaît que le propriétaire principal, alors que tout le
-- reste des horaires accepte le co-gérant depuis le lot 5-B.
--
-- Une grille de créneaux récurrents est de la planification, pas une décision
-- d'argent : elle passe à `is_box_admin()`, exactement le helper que la fonction
-- de génération exige déjà. Les deux cessent de se contredire.
--
-- Ce que ce lot ne fait PAS : toucher aux RPC de semaines types
-- (save_week_as_template, list_week_templates, apply_program_week,
-- delete_week_template). Elles acceptent déjà le coach de la box et refusent le
-- coach d'une autre box — mesuré. L'écran s'aligne sur le serveur.

DROP POLICY IF EXISTS "box_owner_manage_templates" ON public.schedule_templates;

CREATE POLICY "schedule_templates_staff_manage"
ON public.schedule_templates
FOR ALL
TO authenticated
USING (public.is_box_admin(box_id))
WITH CHECK (public.is_box_admin(box_id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'schedule_templates' AND policyname = 'box_owner_manage_templates'
  ) THEN
    RAISE EXCEPTION 'la policy propriétaire-principal survit sur schedule_templates';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'schedule_templates'
      AND policyname = 'schedule_templates_staff_manage'
      AND qual LIKE '%is_box_admin%'
      AND with_check LIKE '%is_box_admin%'
  ) THEN
    RAISE EXCEPTION 'la policy staff de schedule_templates n''est pas posée avec is_box_admin dans les deux sens';
  END IF;
END $$;

COMMENT ON POLICY "schedule_templates_staff_manage" ON public.schedule_templates IS
  'Lot 6 : le staff de la box (gérant, co-gérant, coach) écrit la grille de '
  'créneaux récurrents — même garde que generate_class_schedules_from_templates.';
