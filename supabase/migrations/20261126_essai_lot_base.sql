-- ═════════════════════════════════════════════════════════════════════════════
-- Offre Essai, lot base — le serveur du tunnel d'acquisition.
--
-- Le parcours est une ÉCRITURE ANONYME : un visiteur sans compte réserve une
-- place dans un cours réel. C'est exactement le geste que le lot 5-E a fermé
-- partout (`ANON_TABLE_WRITE_WHITELIST` est vide, et le reste). On ne rouvre
-- donc aucun grant de table : deux RPC `SECURITY DEFINER` portent le parcours,
-- sur le motif de `peek_box_invitation`.
--
-- Trois formes mesurées en production avant d'écrire, chacune imposant sa
-- contrainte ici :
--
--   `membership_plans.plan_type`  CHECK (subscription | drop_in | pack)
--        → un 4e type est une migration, pas un bouton. Et `price_cents` étant
--          `NOT NULL DEFAULT 0`, « gratuit par construction » n'est acquis que
--          si la base le force : un `plan_type='trial'` à 30 € reste écrivable
--          par la policy owner, et le checkout ne refuse que le prix nul, pas
--          le type — il partirait en abonnement mensuel.
--
--   `class_reservations`  UNIQUE (schedule_id, member_id)
--        → deux NULL sont distincts en Postgres : cette clé ne dédoublonne
--          AUCUN essai. Il faut un index partiel sur le prospect.
--
--   `class_reservations.member_id` déjà nullable, 0 ligne NULL en prod
--        → rien à relâcher. Mais un NULL libre n'est pas la décision : la
--          contrainte ci-dessous n'admet l'absence de membre QUE pour un essai,
--          et exige alors le lien prospect.
--
-- Et la fuite de conception, mesurée aux trois identités réelles : la policy
-- `box_member_see_reservations` couvre TOUTE la box — gérant, coach et adhérent
-- lambda lisent la même ligne. Les coordonnées du prospect ne vivent donc pas
-- dans `class_reservations` (39 adhérents liraient le fichier prospects), mais
-- dans `box_prospects`, lue par le seul staff qui gère le funnel.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le 4e type d'offre, gratuit parce que la base le refuse autrement.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_plan_type_check;

ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_plan_type_check
  CHECK (plan_type = ANY (ARRAY['subscription'::text, 'drop_in'::text, 'pack'::text, 'trial'::text]));

ALTER TABLE public.membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_trial_gratuit;

ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_trial_gratuit
  CHECK (plan_type <> 'trial' OR price_cents = 0);

-- Une box n'a qu'une offre Essai : le parcours public en choisit une sans
-- ambiguïté, et le gérant ne se retrouve pas avec deux « Essai » concurrents.
CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_une_offre_trial_par_box
  ON public.membership_plans (box_id)
  WHERE plan_type = 'trial';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `box_prospects` — le dossier du visiteur sans compte.
--
--    `session_followups` ne pouvait pas l'accueillir : `member_id NOT NULL`
--    avec clé étrangère vers `profiles`, plus `UNIQUE (box_id, member_id)`.
--    Le pipeline existant suppose un compte ; il reste intact, et l'écran
--    Prospects affichera les deux populations distinctement.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.box_prospects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id              uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  first_name          text NOT NULL,
  last_name           text,
  email               text NOT NULL,
  phone               text,
  status              text NOT NULL DEFAULT 'essai_reserve',
  plan_id             uuid REFERENCES public.membership_plans(id) ON DELETE SET NULL,
  schedule_id         uuid REFERENCES public.class_schedules(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'essai_public',
  notes               text,
  converted_member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT box_prospects_status_check CHECK (
    status = ANY (ARRAY['essai_reserve', 'venu', 'pas_venu', 'relance', 'converti', 'perdu'])
  ),
  CONSTRAINT box_prospects_email_forme CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT box_prospects_email_normalise CHECK (email = lower(email))
);

-- Le dédoublonnage vit ici, pas dans `class_reservations` : (box_id, email,
-- créneau). Le même visiteur peut revenir sur un AUTRE créneau — c'est un
-- second essai, refusé plus loin par le plafond, pas par cette clé.
CREATE UNIQUE INDEX IF NOT EXISTS box_prospects_box_email_schedule_key
  ON public.box_prospects (box_id, email, schedule_id)
  WHERE schedule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_box_prospects_box_status ON public.box_prospects (box_id, status);
CREATE INDEX IF NOT EXISTS idx_box_prospects_email      ON public.box_prospects (email);
CREATE INDEX IF NOT EXISTS idx_box_prospects_plan       ON public.box_prospects (plan_id);
CREATE INDEX IF NOT EXISTS idx_box_prospects_schedule   ON public.box_prospects (schedule_id);
CREATE INDEX IF NOT EXISTS idx_box_prospects_converted  ON public.box_prospects (converted_member_id);

COMMENT ON TABLE public.box_prospects IS
  'Prospects sans compte du tunnel Essai. Porte les coordonnées HORS de class_reservations, que tout adhérent de la box lit.';

CREATE OR REPLACE FUNCTION public.touch_box_prospects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_box_prospects_updated_at ON public.box_prospects;
CREATE TRIGGER trg_box_prospects_updated_at
  BEFORE UPDATE ON public.box_prospects
  FOR EACH ROW EXECUTE FUNCTION public.touch_box_prospects_updated_at();

ALTER TABLE public.box_prospects ENABLE ROW LEVEL SECURITY;

-- Lecture et suivi : le staff qui gère le funnel, comme `session_followups`.
-- Aucune policy d'INSERT : la seule porte d'entrée est la RPC de réservation.
DROP POLICY IF EXISTS box_prospects_funnel_select ON public.box_prospects;
CREATE POLICY box_prospects_funnel_select ON public.box_prospects
  FOR SELECT TO authenticated
  USING (public.manages_box_funnel(box_id));

DROP POLICY IF EXISTS box_prospects_funnel_update ON public.box_prospects;
CREATE POLICY box_prospects_funnel_update ON public.box_prospects
  FOR UPDATE TO authenticated
  USING (public.manages_box_funnel(box_id))
  WITH CHECK (public.manages_box_funnel(box_id));

DROP POLICY IF EXISTS box_prospects_funnel_delete ON public.box_prospects;
CREATE POLICY box_prospects_funnel_delete ON public.box_prospects
  FOR DELETE TO authenticated
  USING (public.manages_box_funnel(box_id));

REVOKE ALL ON public.box_prospects FROM anon;
GRANT SELECT, UPDATE, DELETE ON public.box_prospects TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La réservation d'essai vit dans `class_reservations` — décision de Nab,
--    et elle se tient : la capacité et la liste de présence la voient
--    nativement, sans second inventaire à maintenir.
--
--    Le NULL n'est jamais libre : la contrainte exige le triplet cohérent.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.class_reservations
  ADD COLUMN IF NOT EXISTS is_trial    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES public.box_prospects(id) ON DELETE CASCADE;

ALTER TABLE public.class_reservations
  DROP CONSTRAINT IF EXISTS class_reservations_essai_ou_membre;

ALTER TABLE public.class_reservations
  ADD CONSTRAINT class_reservations_essai_ou_membre CHECK (
    (is_trial AND member_id IS NULL AND prospect_id IS NOT NULL)
    OR
    (NOT is_trial AND prospect_id IS NULL AND member_id IS NOT NULL)
  );

-- `UNIQUE (schedule_id, member_id)` ne dédoublonne aucun essai : deux NULL sont
-- distincts. L'index partiel le fait pour le prospect.
CREATE UNIQUE INDEX IF NOT EXISTS class_reservations_schedule_prospect_key
  ON public.class_reservations (schedule_id, prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_reservations_prospect
  ON public.class_reservations (prospect_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Les deux triggers de quota sortent explicitement sur un essai.
--
--    Mesuré : ils ne tombaient déjà pas sur un `member_id` NULL (aucune formule
--    trouvée, aucun crédit trouvé, donc `RETURN NEW`). Mais ils y arrivaient
--    par accident — par la valeur absente, pas par une décision. Un jour où
--    l'un d'eux prendra un chemin par défaut, un essai consommerait un crédit
--    d'adhérent. La sortie est ici prononcée.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_weekly_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max    int;
  v_used   int;
  v_date   date;
  v_monday date;
  v_sunday date;
BEGIN
  -- Un essai n'a pas de formule : aucun quota hebdomadaire à consommer.
  IF NEW.is_trial THEN
    RETURN NEW;
  END IF;

  -- Seules les réservations confirmées consomment le quota.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Quota de la formule active du membre (NULL = illimité ou aucune formule).
  SELECT mp.max_sessions_per_week INTO v_max
  FROM box_members bm
  LEFT JOIN membership_plans mp ON mp.id = bm.plan_id
  WHERE bm.member_id = NEW.member_id
    AND bm.box_id = NEW.box_id
    AND bm.status = 'active'
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT scheduled_date INTO v_date FROM class_schedules WHERE id = NEW.schedule_id;
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;
  v_monday := date_trunc('week', v_date)::date;
  v_sunday := v_monday + 6;

  SELECT COUNT(*) INTO v_used
  FROM class_reservations cr
  JOIN class_schedules cs ON cs.id = cr.schedule_id
  WHERE cr.member_id = NEW.member_id
    AND cr.box_id = NEW.box_id
    AND cr.status = 'confirmed'
    AND (TG_OP = 'INSERT' OR cr.id <> NEW.id)
    AND cs.scheduled_date BETWEEN v_monday AND v_sunday;

  IF v_used >= v_max THEN
    RAISE EXCEPTION 'WEEKLY_LIMIT_REACHED: %/% séances cette semaine', v_used, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_credit_on_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_sub    boolean;
  v_has_any    boolean;
  v_credit_id  uuid;
BEGIN
  -- Un essai est gratuit par construction : il ne consomme aucun crédit.
  IF NEW.is_trial THEN
    RETURN NEW;
  END IF;

  -- Un crédit n'est consommé que par une réservation confirmée.
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Déjà rattachée à un crédit (ex. UPDATE sans changement d'accès) -> rien.
  IF NEW.credit_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mode abonnement : le quota hebdo (trigger dédié) s'applique, pas les crédits.
  SELECT EXISTS (
    SELECT 1
    FROM box_members bm
    JOIN membership_plans mp ON mp.id = bm.plan_id
    WHERE bm.member_id = NEW.member_id
      AND bm.box_id = NEW.box_id
      AND bm.status = 'active'
      AND mp.plan_type = 'subscription'
      AND COALESCE(bm.subscription_status, '') IN ('active', 'trialing', 'past_due')
  ) INTO v_has_sub;

  IF v_has_sub THEN
    RETURN NEW;
  END IF;

  -- Cherche un crédit disponible (le plus proche de l'expiration d'abord).
  SELECT id INTO v_credit_id
  FROM member_class_credits
  WHERE member_id = NEW.member_id
    AND box_id = NEW.box_id
    AND status = 'active'
    AND expires_at > now()
    AND credits_used < credits_total
  ORDER BY expires_at ASC
  FOR UPDATE
  LIMIT 1;

  IF v_credit_id IS NOT NULL THEN
    UPDATE member_class_credits
    SET credits_used = credits_used + 1,
        status = CASE WHEN credits_used + 1 >= credits_total THEN 'exhausted' ELSE status END
    WHERE id = v_credit_id;
    NEW.credit_id := v_credit_id;
    RETURN NEW;
  END IF;

  -- Pas de crédit dispo : si le membre a DÉJÀ acheté des crédits pour cette box
  -- (mode crédit), on bloque. Sinon (membre libre/invité) : accès inchangé.
  SELECT EXISTS (
    SELECT 1 FROM member_class_credits
    WHERE member_id = NEW.member_id AND box_id = NEW.box_id
  ) INTO v_has_any;

  IF v_has_any THEN
    RAISE EXCEPTION 'NO_CREDITS_LEFT: aucun crédit disponible pour cette box'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. `venu` / `pas_venu` sont alimentés par le pointage du coach, pas saisis
--    deux fois. La source de vérité reste `class_reservations.attended`.
--
--    Le statut n'est écrasé que depuis les deux états d'attente : un prospect
--    déjà `converti` ou `perdu` ne redescend pas parce qu'on corrige un
--    pointage.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_prospect_status_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.prospect_id IS NULL OR NEW.attended IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.box_prospects
  SET status = CASE WHEN NEW.attended THEN 'venu' ELSE 'pas_venu' END
  WHERE id = NEW.prospect_id
    AND status IN ('essai_reserve', 'relance', 'venu', 'pas_venu');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_prospect_attendance ON public.class_reservations;
CREATE TRIGGER trg_sync_prospect_attendance
  AFTER INSERT OR UPDATE OF attended ON public.class_reservations
  FOR EACH ROW EXECUTE FUNCTION public.sync_prospect_status_from_attendance();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Lecture publique des créneaux — `anon` ne lit NI `class_schedules` NI
--    `class_reservations` (aucune policy publique, mesuré). Le calendrier
--    d'essai est donc une RPC, pas une lecture directe : aucun grant rouvert,
--    et la fonction ne rend que ce que le visiteur doit voir — jamais qui est
--    inscrit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_public_trial_slots(
  p_box_id uuid,
  p_days   int DEFAULT 21
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_box   public.boxes;
  v_plan  public.membership_plans;
  v_slots jsonb;
  v_days  int := LEAST(GREATEST(COALESCE(p_days, 21), 1), 60);
BEGIN
  IF p_box_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'box_absente');
  END IF;

  SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id AND is_active;
  IF v_box.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'box_introuvable');
  END IF;

  SELECT * INTO v_plan
  FROM public.membership_plans
  WHERE box_id = p_box_id AND plan_type = 'trial' AND is_active;

  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offre_essai_absente');
  END IF;

  -- Seuls les créneaux À VENIR et NON COMPLETS sont proposés. Les places
  -- restantes se comptent sur les réservations confirmées — essais compris,
  -- puisqu'un essai prend une vraie place.
  SELECT COALESCE(jsonb_agg(s ORDER BY s.scheduled_date, s.start_time), '[]'::jsonb)
    INTO v_slots
  FROM (
    SELECT cs.id AS schedule_id,
           cs.title,
           cs.coach,
           cs.scheduled_date,
           cs.start_time,
           cs.end_time,
           cs.max_capacity,
           cs.max_capacity - COUNT(cr.id) FILTER (WHERE cr.status = 'confirmed') AS seats_left
    FROM public.class_schedules cs
    LEFT JOIN public.class_reservations cr ON cr.schedule_id = cs.id
    WHERE cs.box_id = p_box_id
      AND (cs.scheduled_date + cs.start_time::time) > now()
      AND cs.scheduled_date <= (now()::date + v_days)
    GROUP BY cs.id
    HAVING cs.max_capacity - COUNT(cr.id) FILTER (WHERE cr.status = 'confirmed') > 0
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'box',  jsonb_build_object('id', v_box.id, 'name', v_box.name, 'slug', v_box.slug, 'city', v_box.city),
    'plan', jsonb_build_object(
      'id', v_plan.id, 'name', v_plan.name,
      'description', v_plan.description, 'terms', v_plan.terms
    ),
    'slots', v_slots
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. La réservation. Tout est vérifié côté serveur, et chaque refus est nommé.
--
--    Deux points que le trigger impose et que la fonction ne prend pas sur
--    parole :
--
--    `enforce_reservation_capacity` NE REFUSE PAS un cours plein — il bascule
--    silencieusement la ligne en `waiting`. Le prospect lirait « réservé » en
--    étant sur liste d'attente. Le produit dit refuser, pas faire espérer :
--    la fonction relit le statut RÉELLEMENT écrit et annule si ce n'est pas
--    `confirmed`.
--
--    Le comptage préalable prend le MÊME verrou consultatif que le trigger,
--    sinon deux visiteurs simultanés lisent tous les deux « une place ».
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.book_trial_slot(
  p_box_id      uuid,
  p_schedule_id uuid,
  p_first_name  text,
  p_last_name   text,
  p_email       text,
  p_phone       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Plafonds anti-abus tenus EN BASE (l'e-mail est prouvable ici ; l'IP est
  -- prononcée dans la route Next.js — `request.headers` n'est pas mesurable
  -- depuis SQL, et une limite supposée n'est pas une limite).
  c_max_par_box     CONSTANT int := 2;   -- essais dans la même box
  c_max_fenetre     CONSTANT int := 5;   -- essais toutes box confondues…
  c_fenetre         CONSTANT interval := interval '7 days';

  v_plan        public.membership_plans;
  v_sched       public.class_schedules;
  v_email       text := lower(btrim(COALESCE(p_email, '')));
  v_prenom      text := btrim(COALESCE(p_first_name, ''));
  v_nom         text := NULLIF(btrim(COALESCE(p_last_name, '')), '');
  v_tel         text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_confirmed   int;
  v_prospect_id uuid;
  v_res_id      uuid;
  v_status      text;
BEGIN
  IF v_prenom = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'prenom_absent');
  END IF;

  IF v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_invalide');
  END IF;

  SELECT * INTO v_plan
  FROM public.membership_plans
  WHERE box_id = p_box_id AND plan_type = 'trial' AND is_active;

  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offre_essai_absente');
  END IF;

  SELECT * INTO v_sched
  FROM public.class_schedules
  WHERE id = p_schedule_id AND box_id = p_box_id;

  IF v_sched.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_introuvable');
  END IF;

  IF (v_sched.scheduled_date + v_sched.start_time::time) <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_passe');
  END IF;

  -- Doublon exact : ce visiteur a déjà ce créneau.
  IF EXISTS (
    SELECT 1 FROM public.box_prospects
    WHERE box_id = p_box_id AND email = v_email AND schedule_id = p_schedule_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_reserve');
  END IF;

  IF (SELECT COUNT(*) FROM public.box_prospects
      WHERE box_id = p_box_id AND email = v_email) >= c_max_par_box THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plafond_box_atteint');
  END IF;

  IF (SELECT COUNT(*) FROM public.box_prospects
      WHERE email = v_email AND created_at > now() - c_fenetre) >= c_max_fenetre THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plafond_fenetre_atteint');
  END IF;

  -- Même verrou que `enforce_reservation_capacity`, donc le comptage ci-dessous
  -- ne peut pas être doublé par une réservation concurrente.
  PERFORM pg_advisory_xact_lock(hashtext('resa:' || p_schedule_id::text));

  SELECT COUNT(*) INTO v_confirmed
  FROM public.class_reservations
  WHERE schedule_id = p_schedule_id AND status = 'confirmed';

  IF v_confirmed >= v_sched.max_capacity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_complet');
  END IF;

  INSERT INTO public.box_prospects (box_id, first_name, last_name, email, phone, plan_id, schedule_id)
  VALUES (p_box_id, v_prenom, v_nom, v_email, v_tel, v_plan.id, p_schedule_id)
  RETURNING id INTO v_prospect_id;

  INSERT INTO public.class_reservations (schedule_id, box_id, member_id, prospect_id, is_trial, status)
  VALUES (p_schedule_id, p_box_id, NULL, v_prospect_id, true, 'confirmed')
  RETURNING id, status INTO v_res_id, v_status;

  -- Le trigger a le dernier mot : on relit ce qu'il a écrit. Un essai ne va
  -- jamais en liste d'attente.
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'ESSAI_NON_CONFIRME'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'prospect_id', v_prospect_id,
    'reservation_id', v_res_id,
    'plan', jsonb_build_object('id', v_plan.id, 'name', v_plan.name),
    'slot', jsonb_build_object(
      'schedule_id', v_sched.id, 'title', v_sched.title,
      'scheduled_date', v_sched.scheduled_date,
      'start_time', v_sched.start_time, 'end_time', v_sched.end_time
    )
  );
EXCEPTION
  -- Deux mains sur le même créneau, ou le trigger qui bascule en `waiting` :
  -- la transaction de la fonction est annulée, donc aucun prospect orphelin.
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_complet');
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deja_reserve');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants EXECUTE explicites — `PUBLIC` n'exécute rien par défaut ici
--    (leçon du lot 4 : une RPC de lecture staff restait exécutable par PUBLIC,
--    donc par la clé anon).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.list_public_trial_slots(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_trial_slot(uuid, uuid, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_trial_slots(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_trial_slot(uuid, uuid, text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.touch_box_prospects_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_prospect_status_from_attendance() FROM PUBLIC;
