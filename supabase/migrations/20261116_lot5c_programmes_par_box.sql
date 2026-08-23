-- Lot 5-C : le contenu d'un programme vit dans box_wods, et un programme
-- appartient à sa box, pas à une personne.
--
-- Quatre choses ici, dans cet ordre :
--   1. `programs` et `program_members` passent de « possédé par owner_id » à
--      « administré par la box » (is_box_owner_admin). Sans ça, deux gérants
--      de la même box construisent deux stocks mutuellement inéditables.
--   2. L'acheteur d'un programme lit le contenu qu'il a payé, même s'il n'est
--      pas membre de la box qui le vend — sinon la promesse du lot est fausse
--      pour tout achat public.
--   3. Les grants anon repassent au motif R1/R2 : `programs` en lecture de
--      colonnes (celles que la page publique lit réellement), et rien d'autre.
--   4. `join_program('staff')` cesse d'accepter le coach : dispenser de payer
--      est une décision d'argent.
--
-- `program_wods` et `program_scores` disparaissent à la fin : 0 ligne en
-- production, et plus aucun appelant après cette PR.

-- ---------------------------------------------------------------------------
-- 1. programs : administré par la box
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS owner_manage_programs ON public.programs;
DROP POLICY IF EXISTS owner_admin_manage_programs ON public.programs;

-- `TO authenticated` n'est pas cosmétique : `is_box_owner_admin` n'est pas
-- exécutable par `anon`, donc une policy sans rôle ferait échouer la lecture
-- publique de `programs` avec « permission denied for function » — la page
-- /box/[slug] tomberait. Mesuré, pas supposé.
CREATE POLICY owner_admin_manage_programs ON public.programs
  FOR ALL
  TO authenticated
  USING (public.is_box_owner_admin(box_id))
  WITH CHECK (public.is_box_owner_admin(box_id));

-- program_members : même bascule. La lecture reste « la mienne, ou celles des
-- programmes de ma box si j'y suis gérant ».
DROP POLICY IF EXISTS owner_manage_pm ON public.program_members;
DROP POLICY IF EXISTS owner_admin_manage_pm ON public.program_members;
DROP POLICY IF EXISTS read_own_membership ON public.program_members;

CREATE POLICY owner_admin_manage_pm ON public.program_members
  FOR ALL
  TO authenticated
  USING (
    program_id IN (
      SELECT p.id FROM public.programs p WHERE public.is_box_owner_admin(p.box_id)
    )
  )
  WITH CHECK (
    program_id IN (
      SELECT p.id FROM public.programs p WHERE public.is_box_owner_admin(p.box_id)
    )
  );

CREATE POLICY read_own_membership ON public.program_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR program_id IN (
      SELECT p.id FROM public.programs p WHERE public.is_box_owner_admin(p.box_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. L'acheteur lit le contenu qu'il a payé
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER pour la même raison qu'au lot 5-A : les policies de
-- `wod_program_access` interrogent `box_wods`, donc un EXISTS inline dans une
-- policy de `box_wods` produirait « infinite recursion detected in policy ».
-- La fonction ne rend qu'un booléen sur l'appelant.
CREATE OR REPLACE FUNCTION public.wod_in_my_active_program(p_wod_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wod_program_access a
    JOIN public.program_members pm ON pm.program_id = a.program_id
    WHERE a.wod_id = p_wod_id
      AND pm.user_id = auth.uid()
      AND pm.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.wod_in_my_active_program(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wod_in_my_active_program(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wod_in_my_active_program(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wod_in_my_active_program(uuid) TO service_role;

-- Policy permissive supplémentaire : elle n'élargit rien d'autre que le cas
-- « j'ai une inscription active à un programme auquel ce WOD est rattaché ».
DROP POLICY IF EXISTS program_member_see_wods ON public.box_wods;
CREATE POLICY program_member_see_wods ON public.box_wods
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND (publish_at IS NULL OR publish_at <= now())
    AND public.wod_in_my_active_program(id)
  );

-- Le rattachement lui-même doit être lisible par l'acheteur : c'est lui qui
-- porte « ce WOD appartient au programme X ».
DROP POLICY IF EXISTS wod_program_access_member_read ON public.wod_program_access;
CREATE POLICY wod_program_access_member_read ON public.wod_program_access
  FOR SELECT
  TO authenticated
  USING (
    (SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_program_access.wod_id)
      IN (SELECT get_user_box_ids())
    OR public.is_box_admin(
         (SELECT w.box_id FROM public.box_wods w WHERE w.id = wod_program_access.wod_id))
    OR program_id IN (
         SELECT pm.program_id FROM public.program_members pm
         WHERE pm.user_id = auth.uid() AND pm.status = 'active'
       )
  );

-- ---------------------------------------------------------------------------
-- 3. Grants : motif R1/R2
-- ---------------------------------------------------------------------------

-- `programs` : la page publique /box/[slug] lit 8 colonnes et filtre sur 2.
-- invite_code, stripe_price_id, stripe_product_id et owner_id n'ont aucune
-- raison d'être servis à un non-connecté (même famille que boxes.invite_code).
REVOKE ALL ON TABLE public.programs FROM anon;
GRANT SELECT (
  id, box_id, title, description, price_cents, currency, type,
  duration_weeks, days_per_week, image_url, is_active
) ON TABLE public.programs TO anon;

-- Rien de public ne lit ces trois tables.
REVOKE ALL ON TABLE public.program_members FROM anon;
REVOKE ALL ON TABLE public.wod_program_access FROM anon;
REVOKE ALL ON TABLE public.wod_group_access FROM anon;

-- `box_wods` : anon détenait INSERT/UPDATE/DELETE/TRUNCATE. La RLS retenait
-- (created_by = auth.uid() est faux quand auth.uid() est NULL), mais TRUNCATE
-- n'est pas soumis à la RLS — seul le grant le retient.
REVOKE ALL ON TABLE public.box_wods FROM anon;

-- ---------------------------------------------------------------------------
-- 4. join_program('staff') : le coach ne dispense pas de payer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_program(
  p_program_id uuid,
  p_source text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_start_date date DEFAULT NULL::date,
  p_amount_cents integer DEFAULT NULL::integer,
  p_platform_fee_cents integer DEFAULT NULL::integer,
  p_stripe_checkout_session_id text DEFAULT NULL::text,
  p_stripe_subscription_id text DEFAULT NULL::text,
  p_stripe_payment_intent text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user    uuid := COALESCE(p_user_id, auth.uid());
  v_backend boolean := public.request_is_backend();
  v_prog    public.programs;
  v_id      uuid;
BEGIN
  IF p_source NOT IN ('stripe', 'staff') THEN
    RAISE EXCEPTION 'Source d''inscription inconnue : %', p_source USING ERRCODE = '22023';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prog FROM public.programs WHERE id = p_program_id;
  IF v_prog.id IS NULL THEN
    RAISE EXCEPTION 'Programme introuvable' USING ERRCODE = '42704';
  END IF;

  IF p_source = 'stripe' THEN
    -- Un paiement ne se déclare pas depuis un client : seul le webhook, qui a
    -- vérifié la signature Stripe, peut emprunter cette porte.
    IF NOT v_backend THEN
      RAISE EXCEPTION 'Un paiement de programme ne se déclare pas depuis un client'
        USING ERRCODE = '42501';
    END IF;
    IF p_stripe_checkout_session_id IS NULL
       AND p_stripe_subscription_id IS NULL
       AND p_stripe_payment_intent IS NULL THEN
      RAISE EXCEPTION 'Référence de paiement Stripe manquante' USING ERRCODE = '22023';
    END IF;

  ELSE -- staff
    -- Dispenser de payer est une décision d'argent : gérant ou co-gérant, pas
    -- le coach. Et plus de branche owner_id : un programme appartient à sa box.
    IF NOT v_backend
       AND NOT (v_prog.box_id IS NOT NULL AND public.is_box_owner_admin(v_prog.box_id)) THEN
      RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du programme requis'
        USING ERRCODE = '42501';
    END IF;
    -- Le staff n'assigne qu'un membre de sa box.
    IF NOT v_backend
       AND v_prog.box_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.box_members
         WHERE box_id = v_prog.box_id AND member_id = v_user AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'L''athlète n''est pas membre actif de la box'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.program_members (
    program_id, user_id, start_date, status, provenance,
    amount_cents, platform_fee_cents,
    stripe_checkout_session_id, stripe_subscription_id, stripe_payment_intent
  ) VALUES (
    p_program_id, v_user, COALESCE(p_start_date, current_date), 'active', p_source,
    CASE WHEN p_source = 'stripe' THEN p_amount_cents END,
    CASE WHEN p_source = 'stripe' THEN p_platform_fee_cents END,
    p_stripe_checkout_session_id, p_stripe_subscription_id, p_stripe_payment_intent
  )
  ON CONFLICT (program_id, user_id) DO UPDATE SET
    status = 'active',
    -- Un paiement qui atterrit sur une ligne non vérifiée la requalifie ;
    -- l'inverse n'existe pas (une assignation ne dégrade pas un achat).
    provenance = CASE WHEN EXCLUDED.provenance = 'stripe'
                      THEN 'stripe' ELSE program_members.provenance END,
    start_date = COALESCE(EXCLUDED.start_date, program_members.start_date),
    amount_cents = COALESCE(EXCLUDED.amount_cents, program_members.amount_cents),
    platform_fee_cents = COALESCE(EXCLUDED.platform_fee_cents, program_members.platform_fee_cents),
    stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, program_members.stripe_checkout_session_id),
    stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, program_members.stripe_subscription_id),
    stripe_payment_intent = COALESCE(EXCLUDED.stripe_payment_intent, program_members.stripe_payment_intent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Les deux tables legacy partent — mais pas leurs lecteurs cachés
-- ---------------------------------------------------------------------------

-- badge_condition_met interrogeait program_scores pour « premier score ».
-- Le score d'un WOD de programme est désormais une ligne de wod_scores, déjà
-- listée juste au-dessus : la branche disparaît sans perdre de condition.
CREATE OR REPLACE FUNCTION public.badge_condition_met(p_athlete_id uuid, p_badge_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_elo   integer;
  v_count integer;
BEGIN
  IF p_athlete_id IS NULL THEN
    RETURN false;
  END IF;

  CASE p_badge_key

    -- Bienvenue : porté par tout profil existant.
    WHEN 'level_scaled' THEN
      RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_athlete_id);

    -- Paliers de classement : ELO réel du profil.
    WHEN 'level_inter', 'level_rx', 'level_rx_plus', 'level_elite', 'level_pro' THEN
      SELECT elo INTO v_elo FROM public.profiles WHERE id = p_athlete_id;
      IF v_elo IS NULL THEN RETURN false; END IF;
      RETURN v_elo >= CASE p_badge_key
        WHEN 'level_inter'    THEN 1001
        WHEN 'level_rx'       THEN 1200
        WHEN 'level_rx_plus'  THEN 1400
        WHEN 'level_elite'    THEN 1600
        WHEN 'level_pro'      THEN 1800
      END;

    -- Premier score : une ligne de score existe réellement.
    WHEN 'first_score' THEN
      RETURN EXISTS (SELECT 1 FROM public.tournament_scores      WHERE athlete_id = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.daily_tournament_scores WHERE user_id    = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.wod_scores              WHERE member_id  = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.generated_wod_scores    WHERE user_id    = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.inter_scores            WHERE athlete_id = p_athlete_id)
          OR EXISTS (SELECT 1 FROM public.scores                  WHERE athlete_id = p_athlete_id);

    -- Palmarès : rang final distribué par l'organisateur à la clôture.
    WHEN 'first_win' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.tournament_elo_history
         WHERE athlete_id = p_athlete_id AND final_rank = 1
      );

    WHEN 'champion_5' THEN
      SELECT count(*) INTO v_count
        FROM public.tournament_elo_history
       WHERE athlete_id = p_athlete_id AND final_rank = 1;
      RETURN v_count >= 5;

    WHEN 'podium' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.tournament_elo_history
         WHERE athlete_id = p_athlete_id AND final_rank BETWEEN 1 AND 3
      );

    WHEN 'veteran_10' THEN
      SELECT count(DISTINCT tournament_id) INTO v_count
        FROM public.tournament_participants
       WHERE athlete_id = p_athlete_id;
      RETURN v_count >= 10;

    -- Social : amitiés réellement acceptées, dans les deux sens.
    WHEN 'social_5' THEN
      SELECT count(*) INTO v_count
        FROM public.friendships
       WHERE status = 'accepted'
         AND (requester_id = p_athlete_id OR addressee_id = p_athlete_id);
      RETURN v_count >= 5;

    -- Messages réellement envoyés (chat de groupe + messagerie directe).
    WHEN 'chatty_50' THEN
      SELECT (SELECT count(*) FROM public.group_messages WHERE sender_id = p_athlete_id)
           + (SELECT count(*) FROM public.messages       WHERE sender_id = p_athlete_id)
        INTO v_count;
      RETURN v_count >= 50;

    ELSE
      -- Badge sans source serveur fiable : jamais réclamable.
      RETURN false;
  END CASE;
END;
$function$;

DROP TABLE IF EXISTS public.program_scores;
DROP TABLE IF EXISTS public.program_wods;
