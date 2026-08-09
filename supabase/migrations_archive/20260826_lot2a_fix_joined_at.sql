-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 2A (correctif) — `join_box_by_invite` ne réécrit plus `joined_at`
--
-- La version 20260825 rafraîchissait `joined_at` à la réactivation d'un membre
-- `inactive`. Contrôle back-office : le graphe « inscriptions par date » de la
-- page stats re-datait alors le membre réactivé à aujourd'hui, effaçant sa date
-- d'inscription d'origine. Réécrire une série historique pour gagner un tri de
-- liste plus flatteur est un mauvais échange — on garde la date d'origine.
--
-- Le reste est identique à 20260825 : réactivation propre (aucun élément
-- d'abonnement ressuscité), refus explicite d'un membre `banned`, idempotence.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.join_box_by_invite(p_invite_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_box_id uuid;
  v_owner  uuid;
  v_status text;
  v_role   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: connexion requise' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, owner_id INTO v_box_id, v_owner
  FROM public.boxes
  WHERE upper(invite_code) = upper(btrim(p_invite_code)) AND is_active = true;

  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'Code invalide ou box introuvable';
  END IF;

  -- Un owner « primaire » qui rejoint sa propre box par le code ne doit pas se
  -- retrouver simple membre (même cas qu'aux lots 1C-a / 1C-c).
  v_role := CASE WHEN v_owner = auth.uid() THEN 'owner' ELSE 'member' END;

  SELECT status INTO v_status
  FROM public.box_members
  WHERE box_id = v_box_id AND member_id = auth.uid();

  -- 1. Jamais membre → adhésion normale.
  IF v_status IS NULL THEN
    INSERT INTO public.box_members (box_id, member_id, status, role)
    VALUES (v_box_id, auth.uid(), 'active', v_role)
    ON CONFLICT (box_id, member_id) DO NOTHING;   -- course entre deux appels
    RETURN v_box_id;
  END IF;

  -- 2. Exclu → refus EXPLICITE. Sans ce garde-fou, la réactivation du point 3
  --    réadmettrait un membre banni via le code d'invitation de la box.
  IF v_status = 'banned' THEN
    RAISE EXCEPTION 'BANNED: votre acces a cette box a ete revoque'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Déjà membre → idempotent (l'app peut rappeler le code sans effet de bord).
  IF v_status = 'active' THEN
    RETURN v_box_id;
  END IF;

  -- 4. Ex-membre (`inactive`) → réactivation PROPRE.
  --    Aucun élément d'abonnement n'est ressuscité : ni forfait, ni identifiants
  --    Stripe, ni engagement, ni compteurs de relance. Le membre revient comme
  --    un nouvel arrivant et souscrira à nouveau s'il le souhaite.
  UPDATE public.box_members SET
    status                            = 'active',
    role                              = v_role,
    plan_id                           = NULL,
    subscription_status               = NULL,
    stripe_subscription_id            = NULL,
    stripe_checkout_session_id        = NULL,
    subscription_current_period_end   = NULL,
    amount_cents                      = NULL,
    platform_fee_cents                = NULL,
    subscription_cancel_at_period_end = false,
    commitment_end_date               = NULL,
    subscription_paused               = false,
    pause_started_at                  = NULL,
    pause_resumes_at                  = NULL,
    payment_method_type               = NULL,
    past_due_since                    = NULL,
    dunning_attempts                  = 0,
    last_payment_error                = NULL,
    dunning_reminders_sent            = 0,
    dunning_last_reminder_at          = NULL
  WHERE box_id = v_box_id AND member_id = auth.uid();

  RETURN v_box_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_box_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_box_by_invite(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
