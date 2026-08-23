-- ═════════════════════════════════════════════════════════════════════════════
-- Lot 6 — résidu de lecture nominative : « qui paie quoi » quitte la table
--
-- Constat de la recon : le coach ne lit plus les agrégats d'argent, ni le
-- journal comptoir, ni l'abonnement de la box — mais il lit encore, ligne par
-- ligne et par pseudo, `box_members.subscription_status` et `plan_id`. La cause
-- n'est pas une policy trop large pour le coach : c'est `member_see_boxmates`,
-- qui rend TOUTE ligne `box_members` de la box à TOUT membre de la box. Donc
-- le voisin de tapis lit aussi l'état de paiement de son voisin.
--
-- La RLS est une garde de LIGNE : elle ne peut pas rendre une ligne en cachant
-- trois colonnes. La frontière colonne se pose au grant, et elle est
-- indifférente au titre — c'est pourquoi les lecteurs légitimes passent
-- désormais par deux RPC nommées :
--   · le staff argent (gérant, co-gérant) → get_box_members_billing()
--   · l'adhérent sur lui-même             → get_my_membership_billing()
--
-- Ce qui NE bouge pas, et il faut le dire plutôt que de le mimer :
--   · `membership_plans.price_cents` reste lisible — le tarif des formules est
--     affiché sur la page publique d'une box (`public_read_active_plans`), donc
--     le cacher au coach serait un décor : il le lit sans session. Le prix
--     d'une formule est public par destination ; ce qui est nominatif, c'est
--     QUI y est abonné, et c'est ce que ferme cette migration.
--   · les grants d'écriture : le coach n'écrit déjà pas `box_members` (policies
--     `is_box_owner*`). Fermer SELECT sans toucher UPDATE laisse le geste
--     « assigner une formule » du gérant intact.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les colonnes nominatives d'abonnement sortent de la portée de lecture
--    directe. `anon` les détenait aussi (sans policy pour les servir) : un
--    grant sans policy est une porte sans serrure derrière une autre porte.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE SELECT (
  plan_id,
  subscription_status,
  subscription_current_period_end,
  subscription_cancel_at_period_end,
  subscription_paused,
  pause_started_at,
  pause_resumes_at,
  commitment_end_date
) ON public.box_members FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lecteur staff : le gérant et le co-gérant, pas le coach.
--    `is_box_owner_admin` est la même garde que l'argent des lots 5-C → 5-F ;
--    en reprendre une autre ici ferait diverger deux copies de la règle.
--
--    On n'ouvre PAS une deuxième RPC de facturation : `get_box_billing` existe
--    déjà et sert la page Abonnés. Deux lecteurs d'argent, c'est deux gardes à
--    maintenir. Elle est élargie aux colonnes que la fermeture retire, et son
--    refus devient prononcé : elle rendait zéro ligne au non-autorisé, ce qui
--    est indistinguable d'une box sans adhérent.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_box_billing(uuid);

CREATE OR REPLACE FUNCTION public.get_box_billing(p_box_id uuid)
RETURNS TABLE (
  id uuid,
  member_id uuid,
  role text,
  status text,
  joined_at timestamptz,
  plan_id uuid,
  subscription_status text,
  subscription_current_period_end timestamptz,
  subscription_cancel_at_period_end boolean,
  subscription_paused boolean,
  pause_started_at timestamptz,
  pause_resumes_at timestamptz,
  commitment_end_date timestamptz,
  amount_cents integer,
  platform_fee_cents integer,
  has_stripe_sub boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_box_owner_admin(p_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box requis'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT bm.id, bm.member_id, bm.role, bm.status, bm.joined_at, bm.plan_id,
         bm.subscription_status, bm.subscription_current_period_end,
         bm.subscription_cancel_at_period_end, bm.subscription_paused,
         bm.pause_started_at, bm.pause_resumes_at, bm.commitment_end_date,
         bm.amount_cents, bm.platform_fee_cents,
         (bm.stripe_subscription_id IS NOT NULL)
  FROM public.box_members bm
  WHERE bm.box_id = p_box_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_box_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_box_billing(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_box_billing(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_box_billing(uuid) IS
  'Lot 6 : « qui paie quoi », nominatif, réservé au gérant et au co-gérant. Le coach en est exclu — il programme, il n''encaisse pas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lecteur de soi : l'adhérent voit son propre abonnement (espace /compte,
--    écran mobile). `auth.uid()` est l'autorité — aucun paramètre d'identité,
--    sinon l'appelant choisirait de qui il lit l'abonnement.
-- ─────────────────────────────────────────────────────────────────────────────
-- Cette RPC existe déjà en prod et ne rend que (id, box_id, amount_cents,
-- platform_fee_cents) : aucun appelant, ni web ni mobile, ne l'utilise. Elle
-- est élargie aux colonnes que la fermeture ci-dessus retire — le type de
-- retour change, donc `CREATE OR REPLACE` ne suffit pas.
DROP FUNCTION IF EXISTS public.get_my_membership_billing();

CREATE OR REPLACE FUNCTION public.get_my_membership_billing()
RETURNS TABLE (
  id uuid,
  box_id uuid,
  status text,
  joined_at timestamptz,
  plan_id uuid,
  subscription_status text,
  subscription_current_period_end timestamptz,
  subscription_cancel_at_period_end boolean,
  subscription_paused boolean,
  pause_resumes_at timestamptz,
  commitment_end_date timestamptz,
  amount_cents integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT bm.id, bm.box_id, bm.status, bm.joined_at, bm.plan_id,
         bm.subscription_status, bm.subscription_current_period_end,
         bm.subscription_cancel_at_period_end, bm.subscription_paused,
         bm.pause_resumes_at, bm.commitment_end_date, bm.amount_cents
  FROM public.box_members bm
  WHERE bm.member_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_membership_billing() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_membership_billing() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership_billing() TO authenticated;

COMMENT ON FUNCTION public.get_my_membership_billing() IS
  'Lot 6 : son propre abonnement, par auth.uid(). Remplace la lecture directe des colonnes nominatives de box_members.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Validation : la migration affirme ce qu'elle a fait, sinon elle échoue.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col text;
  v_role text;
  v_reste int;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'plan_id', 'subscription_status', 'subscription_current_period_end',
    'subscription_cancel_at_period_end', 'subscription_paused',
    'pause_started_at', 'pause_resumes_at', 'commitment_end_date'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_column_privilege(v_role, 'public.box_members', v_col, 'SELECT') THEN
        RAISE EXCEPTION 'LOT6 : % lit encore box_members.%', v_role, v_col;
      END IF;
    END LOOP;
  END LOOP;

  -- Contrôle positif : ce qui doit rester lisible l'est encore, sinon la
  -- fermeture est indistinguable d'une panne (les compteurs de membres, la
  -- liste des coachs, l'appartenance à la box passent par ces colonnes).
  FOREACH v_col IN ARRAY ARRAY['box_id', 'member_id', 'role', 'status', 'joined_at'] LOOP
    IF NOT has_column_privilege('authenticated', 'public.box_members', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'LOT6 : authenticated a perdu box_members.% (fermeture trop large)', v_col;
    END IF;
  END LOOP;

  -- Le geste « assigner une formule » du gérant reste écrivable.
  IF NOT has_column_privilege('authenticated', 'public.box_members', 'plan_id', 'UPDATE') THEN
    RAISE EXCEPTION 'LOT6 : authenticated ne peut plus écrire plan_id (assignation de formule cassée)';
  END IF;

  SELECT count(*) INTO v_reste
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_box_billing', 'get_my_membership_billing');
  IF v_reste <> 2 THEN
    RAISE EXCEPTION 'LOT6 : les deux lecteurs nominatifs ne sont pas posés (trouvé %)', v_reste;
  END IF;

  IF has_function_privilege('anon', 'public.get_box_billing(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'LOT6 : anon exécute le lecteur staff';
  END IF;

  -- Le lecteur staff doit refuser en le disant, pas en rendant zéro ligne.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_box_billing'
      AND p.prosrc LIKE '%is_box_owner_admin%'
      AND p.prosrc LIKE '%RAISE EXCEPTION%'
  ) THEN
    RAISE EXCEPTION 'LOT6 : get_box_billing ne refuse pas explicitement hors gérant/co-gérant';
  END IF;
END $$;
