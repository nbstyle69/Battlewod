-- Durcissement RLS box_members (audit FAIL #3 + #4)
--
-- #3 (confidentialité) : `box_members_select_all USING (true)` exposait TOUTES
--   les lignes box_members (anon + authenticated), colonnes de facturation
--   incluses. L'annuaire public et le classement global dépendent d'une lecture
--   large de (box_id, member_id, status) -> on garde les policies SELECT, mais on
--   retire les 4 colonnes financières via des privilèges au niveau colonne, et on
--   expose ces colonnes aux ayants droit (owner / membre lui-même) via des RPC
--   SECURITY DEFINER.
--
-- #4 (accès) : `member_join` + `box_members_write` (FOR ALL, member_id=auth.uid())
--   permettaient à n'importe quel athlète de s'auto-inscrire "active" dans
--   n'importe quelle box sans code d'invitation ni paiement. On supprime
--   l'auto-INSERT/UPDATE, on garde le self-DELETE (quitter une box) et on passe
--   l'adhésion par invitation par un RPC qui valide le code côté serveur.

BEGIN;

-- ── #3 : masquer les colonnes financières à anon/authenticated ──
REVOKE SELECT ON public.box_members FROM anon, authenticated;
GRANT SELECT (
  id, box_id, member_id, joined_at, status, plan_id, role,
  subscription_status, subscription_current_period_end,
  subscription_cancel_at_period_end, commitment_end_date,
  subscription_paused, pause_started_at, pause_resumes_at
) ON public.box_members TO anon, authenticated;
-- Colonnes NON accordées (protégées) : stripe_subscription_id,
-- stripe_checkout_session_id, amount_cents, platform_fee_cents.

-- RPC owner : facturation des membres de SA box (owner/co-owner/superadmin)
CREATE OR REPLACE FUNCTION public.get_box_billing(p_box_id uuid)
RETURNS TABLE (
  id uuid,
  member_id uuid,
  amount_cents integer,
  platform_fee_cents integer,
  has_stripe_sub boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT bm.id, bm.member_id, bm.amount_cents, bm.platform_fee_cents,
         (bm.stripe_subscription_id IS NOT NULL)
  FROM public.box_members bm
  WHERE bm.box_id = p_box_id
    AND (
      public.is_box_owner(p_box_id)
      OR public.is_box_owner_member(p_box_id)
      OR public.is_super_admin()
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_box_billing(uuid) TO authenticated;

-- RPC membre : sa propre facturation d'abonnement
CREATE OR REPLACE FUNCTION public.get_my_membership_billing()
RETURNS TABLE (
  id uuid,
  box_id uuid,
  amount_cents integer,
  platform_fee_cents integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT bm.id, bm.box_id, bm.amount_cents, bm.platform_fee_cents
  FROM public.box_members bm
  WHERE bm.member_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_membership_billing() TO authenticated;

-- ── #4 : bloquer l'auto-inscription, garder le self-delete ──
DROP POLICY IF EXISTS "member_join" ON public.box_members;
DROP POLICY IF EXISTS "box_members_write" ON public.box_members;

DROP POLICY IF EXISTS "box_members_self_leave" ON public.box_members;
CREATE POLICY "box_members_self_leave" ON public.box_members
  FOR DELETE USING (member_id = auth.uid());

-- Adhésion par invitation : le code est validé en base (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.join_box_by_invite(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_box_id uuid;
BEGIN
  SELECT id INTO v_box_id
  FROM public.boxes
  WHERE upper(invite_code) = upper(btrim(p_invite_code))
    AND is_active = true;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'Code invalide ou box introuvable';
  END IF;

  INSERT INTO public.box_members (box_id, member_id, status, role)
  VALUES (v_box_id, auth.uid(), 'active', 'member')
  ON CONFLICT (box_id, member_id) DO NOTHING;

  RETURN v_box_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.join_box_by_invite(text) TO authenticated;

COMMIT;
