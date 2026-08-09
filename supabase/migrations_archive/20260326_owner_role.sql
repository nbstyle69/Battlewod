-- ============================================
-- OWNER ROLE: permettre le rôle 'owner' dans box_members
-- pour les co-propriétaires de box
-- ============================================

-- Supprimer l'ancien CHECK constraint sur role
ALTER TABLE public.box_members DROP CONSTRAINT IF EXISTS box_members_role_check;

-- Recréer avec 'owner' ajouté
ALTER TABLE public.box_members
  ADD CONSTRAINT box_members_role_check CHECK (role IN ('member', 'coach', 'owner'));

-- ── Fonction helper : is_box_owner (via box_members) ──
CREATE OR REPLACE FUNCTION public.is_box_owner_member(p_box_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_members
    WHERE box_id = p_box_id
      AND member_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  )
$$;

-- ── RLS: co-owners can manage box_members ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "box_members_coowner_manage" ON public.box_members;
  CREATE POLICY "box_members_coowner_manage" ON public.box_members
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: box_members';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP box_members: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage boxes settings ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "boxes_coowner_manage" ON public.boxes;
  CREATE POLICY "boxes_coowner_manage" ON public.boxes
    FOR UPDATE USING (is_box_owner_member(id))
    WITH CHECK (is_box_owner_member(id));
  RAISE NOTICE 'OK: boxes';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP boxes: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage WODs ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "wods_coowner_manage" ON public.wods;
  CREATE POLICY "wods_coowner_manage" ON public.wods
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: wods';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP wods: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage message_groups ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "message_groups_coowner_manage" ON public.message_groups;
  CREATE POLICY "message_groups_coowner_manage" ON public.message_groups
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: message_groups';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP message_groups: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage schedules ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "class_schedules_coowner_manage" ON public.class_schedules;
  CREATE POLICY "class_schedules_coowner_manage" ON public.class_schedules
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: class_schedules';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP class_schedules: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage articles ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "articles_coowner_manage" ON public.box_articles;
  CREATE POLICY "articles_coowner_manage" ON public.box_articles
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: box_articles';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP box_articles: %', SQLERRM;
END $$;

-- ── RLS: co-owners can manage membership_plans ──
DO $$ BEGIN
  DROP POLICY IF EXISTS "membership_plans_coowner_manage" ON public.membership_plans;
  CREATE POLICY "membership_plans_coowner_manage" ON public.membership_plans
    FOR ALL USING (is_box_owner_member(box_id))
    WITH CHECK (is_box_owner_member(box_id));
  RAISE NOTICE 'OK: membership_plans';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP membership_plans: %', SQLERRM;
END $$;
