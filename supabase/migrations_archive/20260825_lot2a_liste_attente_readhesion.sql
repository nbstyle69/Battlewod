-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 2A — Liste d'attente (2.2) & ré-adhésion d'un membre (moitié vivante de 2.4)
-- Basé sur le DUMP RÉEL de prod (définitions §1, triggers §2, contraintes §4).
--
-- HORS PÉRIMÈTRE, ASSUMÉ : la résiliation B2B (dépublication des semaines,
-- réabonnement d'une box à une programmation) — `box_programming_subscriptions`
-- a 0 ligne en prod. On ne patche pas une table sans abonné ; à reprendre le
-- jour où la marketplace a un vrai client.
--
-- ─── 2A.1 — LISTE D'ATTENTE ────────────────────────────────────────────────
-- CE QUI CLOCHE (constaté dans les définitions, pas supposé) :
--  • `trg_promote_waiting` est AFTER DELETE : la promotion s'exécute DANS la
--    transaction d'annulation du membre partant.
--  • L'UPDATE de promotion déclenche `trg_zzz_consume_credit`, dont la fonction
--    fait `RAISE EXCEPTION 'NO_CREDITS_LEFT'` quand le membre promu a déjà
--    acheté des crédits mais n'en a plus de valides.
--  → Conséquence : le membre A ne peut PAS annuler sa réservation parce que le
--    membre B, en liste d'attente, a un carnet de crédits épuisé. A reste
--    inscrit à un cours qu'il a quitté, et l'échec ne le concerne en rien.
--  • `trg_enforce_weekly_limit` est déclaré BEFORE INSERT uniquement : une
--    promotion est un UPDATE, donc elle CONTOURNE le quota hebdomadaire. Un
--    membre en liste d'attente dépasse son forfait sans que rien ne le voie.
--
-- CE QU'ON FAIT :
--  1. La promotion devient tolérante à l'échec ET itérative : chaque candidat
--     est tenté dans un sous-bloc ; s'il est inéligible (crédits épuisés, quota
--     atteint), on passe au suivant au lieu de faire échouer l'annulation.
--     L'annulation de A ne peut plus JAMAIS être rejetée à cause de l'état d'un
--     tiers — c'est la propriété qu'on cherche.
--  2. Le quota hebdomadaire s'applique aussi à la promotion (trigger étendu à
--     UPDATE OF status). Combiné au point 1, un candidat hors quota est
--     simplement sauté au profit du suivant.
--
-- POURQUOI PAS « HORS TRANSACTION » : une promotion asynchrone supposerait un
-- worker fiable, or la prod n'a qu'une seule tâche planifiée opérationnelle
-- (constaté au Lot 1C-b). Un sous-bloc PL/pgSQL donne la même garantie —
-- l'échec du promu n'annule pas le partant — sans dépendre d'une infra absente.
--
-- ─── 2A.2 — RÉ-ADHÉSION ────────────────────────────────────────────────────
-- CE QUI CLOCHE : `join_box_by_invite` fait `ON CONFLICT DO NOTHING` puis
-- retourne `v_box_id` DANS TOUS LES CAS. Un ex-membre passé `inactive` garde sa
-- ligne : rien n'est réactivé, mais l'app reçoit un id de box et affiche une
-- adhésion réussie. Le membre se retrouve sans accès, sans message d'erreur.
--
-- CE QU'ON FAIT : réactivation explicite d'un `inactive`, refus explicite d'un
-- `banned` (une réactivation aveugle réadmettrait un membre exclu avec le code
-- d'invitation public de la box — le correctif ne doit pas ouvrir cette porte),
-- idempotence conservée pour un membre déjà `active`.
--
-- La réactivation ne ressuscite AUCUN élément d'abonnement : un ex-membre qui
-- revient ne doit pas récupérer silencieusement un forfait payant, un engagement
-- ou un historique d'impayés. Tous ces champs repartent à zéro.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 2A.1a — Promotion tolérante à l'échec et itérative
-- Corps repris du dump, seule la robustesse change.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promote_waiting_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  r        record;
  v_status text;
BEGIN
  IF OLD.status IS DISTINCT FROM 'confirmed' THEN
    RETURN OLD;
  END IF;

  -- Candidats par ancienneté. La borne évite un balayage sans fin si une file
  -- entière est inéligible ; au-delà, personne n'est promu et l'annulation
  -- aboutit quand même (c'est le comportement voulu).
  <<promo>>
  FOR r IN
    SELECT id FROM class_reservations
    WHERE schedule_id = OLD.schedule_id AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT 20
  LOOP
    BEGIN
      UPDATE class_reservations SET status = 'confirmed' WHERE id = r.id;

      SELECT status INTO v_status FROM class_reservations WHERE id = r.id;
      IF v_status = 'confirmed' THEN
        EXIT promo;                     -- promu, terminé
      END IF;

      -- Statut resté 'waiting' : enforce_reservation_capacity a jugé le
      -- créneau plein. Inutile d'essayer les suivants.
      EXIT promo;

    EXCEPTION WHEN OTHERS THEN
      -- Candidat inéligible : NO_CREDITS_LEFT (carnet épuisé) ou
      -- WEEKLY_LIMIT_REACHED (quota atteint). On passe au suivant.
      -- L'annulation du membre partant ne doit jamais échouer à cause de
      -- l'état d'un tiers : c'est TOUT l'objet de ce correctif.
      RAISE NOTICE 'liste attente: candidat % ignore (%)', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN OLD;
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 2A.1b — Le quota hebdomadaire s'applique aussi à la promotion
-- On NE réécrit PAS le trigger à la main : on relit sa définition réelle et on
-- n'en change que l'événement. Toute clause WHEN ou option posée en prod et
-- absente du repo est ainsi préservée (le repo ment, on a déjà donné).
-- La fonction `enforce_weekly_limit()` gère déjà le cas UPDATE : son compte
-- exclut la ligne courante via `(TG_OP='INSERT' OR cr.id <> NEW.id)`.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_triggerdef(t.oid) INTO v_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND n.nspname = 'public'
    AND c.relname = 'class_reservations'
    AND t.tgname  = 'trg_enforce_weekly_limit';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'trg_enforce_weekly_limit introuvable — etat de prod different du dump, on ne devine pas';
  END IF;

  IF v_def ~* 'UPDATE' THEN
    RAISE NOTICE 'trg_enforce_weekly_limit couvre deja UPDATE — rien a faire';
  ELSE
    v_def := regexp_replace(v_def, 'BEFORE INSERT', 'BEFORE INSERT OR UPDATE OF status', 'i');
    EXECUTE 'DROP TRIGGER trg_enforce_weekly_limit ON public.class_reservations';
    EXECUTE v_def;
    RAISE NOTICE 'trg_enforce_weekly_limit etendu a UPDATE OF status';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2A.2 — Ré-adhésion : réactiver un `inactive`, refuser un `banned`
-- ─────────────────────────────────────────────────────────────
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
    joined_at                         = now(),
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
