-- Lot 0-bis (partie 1) — contournement de paiement des programmes,
-- lecteurs explicites du profil, et fin d'un mensonge de trigger.
--
-- Trois trous mesurés au vrai JWT avant d'écrire cette migration :
--
--  1. `member_join_program` n'exigeait qu'un `WITH CHECK (user_id = auth.uid())` :
--     n'importe quel compte connecté s'inscrivait à un programme payant, en
--     inscrivant lui-même `amount_cents` — colonne que /api/box-revenue additionne.
--     Le chiffre d'affaires « programmes » du gérant se gonflait donc tout seul.
--
--  2. `authenticated` gardait le droit de colonne sur `email`, `full_name`,
--     `gender` et `personal_records`, et `public_read_profiles` est `USING (true)` :
--     tout compte connecté lisait ces quatre champs sur N'IMPORTE QUEL profil.
--     Le levier est le droit de COLONNE, pas la policy : une restriction de ligne
--     ferait disparaître les athlètes hors box des classements.
--
--  3. `prevent_role_escalation` annulait l'écriture de `role` en RÉPONDANT « succès ».
--     Une tentative d'escalade repartait donc avec un accusé de réception.
--
-- `full_name`, `gender` et `personal_records` ne sont PAS révoqués ici : la
-- révocation d'un droit de colonne fait échouer toute requête qui la mentionne,
-- et `AuthContext` liste ces trois colonnes dans la lecture du profil de
-- l'utilisateur. Elles partent dans une seconde migration, une fois l'OTA de
-- l'app constatée sur les appareils installés. `email`, lui, n'a aucun lecteur
-- client : il tombe tout de suite.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email : aucun lecteur client dans les deux dépôts (les six lectures
--    serveur passent par service_role, que les droits de `authenticated`
--    ne concernent pas).
-- ─────────────────────────────────────────────────────────────────────────────
-- Un REVOKE de COLONNE ne retire rien tant que le grant de TABLE existe : mesuré
-- au vrai JWT, `REVOKE SELECT (email)` seul laissait l'e-mail parfaitement
-- lisible. Le droit de table est donc retiré, puis rendu colonne par colonne.
-- Conséquence à connaître : une colonne ajoutée plus tard à `profiles` sera
-- illisible par les clients jusqu'à ce qu'elle soit ajoutée à cette liste.
REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT (
  -- champs publics (les mêmes que ceux ouverts à `anon` pour les classements)
  id, username, avatar_url, level, role, elo,
  total_matches, wins, losses, created_at, featured_badges,
  total_scores_submitted, total_wods_generated, total_timer_sessions,
  total_messages_sent, total_tournaments, total_tournament_wins, total_friends,
  -- champs ouverts aux comptes connectés
  bio, referral_code, referred_by,
  -- fermés par la PARTIE 2, une fois l'OTA de l'app constatée
  full_name, gender, personal_records
) ON public.profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lecteur « soi » : remplace la lecture directe de la table par les clients.
--    SETOF profiles pour que l'ajout d'une colonne au profil n'oblige pas à
--    reprendre cette fonction.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Lecteur « staff » : le nom civil et les records d'un athlète de SA box.
--    C'est le lecteur légitime que le %1RM de la programmation musculation
--    consommera — et le seul, une fois les colonnes fermées.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_athlete_private_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  gender text,
  personal_records jsonb,
  avatar_url text,
  level text,
  elo integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  IF p_user_id <> auth.uid()
     AND NOT EXISTS (
       -- gérant, co-gérant ou coach d'une box où l'athlète est membre actif
       SELECT 1
       FROM public.box_members bm_athlete
       JOIN public.box_members bm_staff ON bm_staff.box_id = bm_athlete.box_id
       WHERE bm_athlete.member_id = p_user_id
         AND bm_athlete.status = 'active'
         AND bm_staff.member_id = auth.uid()
         AND bm_staff.status = 'active'
         AND bm_staff.role IN ('owner', 'coach')
     )
     AND NOT EXISTS (
       -- gérant principal, qui n'a pas toujours de ligne box_members
       SELECT 1
       FROM public.box_members bm
       JOIN public.boxes b ON b.id = bm.box_id
       WHERE bm.member_id = p_user_id
         AND bm.status = 'active'
         AND b.owner_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'Accès refusé : staff de la box de l''athlète requis'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.gender, p.personal_records,
         p.avatar_url, p.level, p.elo
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_athlete_private_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_athlete_private_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_athlete_private_profile(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3-bis. Même lecteur, en liste : le staff a besoin de la promotion entière
--        (classement ELO par genre du back-office, et demain le %1RM par
--        athlète). Sans cette RPC, fermer `gender` casserait Statistiques.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_box_members_private_profiles(p_box_id uuid)
RETURNS TABLE (
  member_id uuid,
  username text,
  full_name text,
  gender text,
  personal_records jsonb,
  avatar_url text,
  level text,
  elo integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_box_admin(p_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant, co-gérant ou coach de la box requis'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.gender, p.personal_records,
         p.avatar_url, p.level, p.elo
  FROM public.box_members bm
  JOIN public.profiles p ON p.id = bm.member_id
  WHERE bm.box_id = p_box_id AND bm.status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.get_box_members_private_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_box_members_private_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_box_members_private_profiles(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Provenance des inscriptions aux programmes.
--    Elle rend « a payé » et « assigné par le staff » distinguables en base —
--    ce que l'assignation individuelle de la programmation musculation exigera
--    de toute façon — et permet à /api/box-revenue de ne compter que le payé.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.program_members ADD COLUMN IF NOT EXISTS provenance text;

UPDATE public.program_members
SET provenance = CASE
  WHEN stripe_payment_intent IS NOT NULL
    OR stripe_subscription_id IS NOT NULL
    OR stripe_checkout_session_id IS NOT NULL THEN 'stripe'
  ELSE 'legacy_unverified'
END
WHERE provenance IS NULL;

ALTER TABLE public.program_members
  DROP CONSTRAINT IF EXISTS program_members_provenance_check;
ALTER TABLE public.program_members
  ADD CONSTRAINT program_members_provenance_check
  CHECK (provenance IN ('stripe', 'staff', 'legacy_unverified'));
ALTER TABLE public.program_members ALTER COLUMN provenance SET NOT NULL;

COMMENT ON COLUMN public.program_members.provenance IS
  'stripe = paiement vérifié par le webhook · staff = assignation par le staff de la box (aucun montant) · legacy_unverified = ligne antérieure à la fermeture, sans preuve de paiement';

-- Aucune ligne sans provenance justifiable ne doit plus pouvoir naître : une
-- insertion muette sur la provenance n'est acceptée que si elle porte une
-- référence Stripe. Et la provenance est immuable hors backend privilégié —
-- sinon la colonne se contournerait par un UPDATE.
CREATE OR REPLACE FUNCTION public.program_members_guard_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.provenance IS NULL THEN
      IF NEW.stripe_payment_intent IS NOT NULL
         OR NEW.stripe_subscription_id IS NOT NULL
         OR NEW.stripe_checkout_session_id IS NOT NULL THEN
        NEW.provenance := 'stripe';
      ELSE
        RAISE EXCEPTION 'Inscription à un programme sans provenance : provenance requise (stripe | staff)'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.provenance = 'stripe'
       AND NEW.stripe_payment_intent IS NULL
       AND NEW.stripe_subscription_id IS NULL
       AND NEW.stripe_checkout_session_id IS NULL THEN
      RAISE EXCEPTION 'Provenance « stripe » sans référence de paiement'
        USING ERRCODE = '23514';
    END IF;
    -- Une assignation du staff ne porte pas d'argent : elle ne doit pas
    -- pouvoir entrer dans le chiffre d'affaires par la colonne des montants.
    IF NEW.provenance = 'staff' THEN
      NEW.amount_cents := NULL;
      NEW.platform_fee_cents := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provenance IS DISTINCT FROM OLD.provenance
       AND NOT public.is_privileged_backend() THEN
      RAISE EXCEPTION 'La provenance d''une inscription ne se modifie pas'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_program_members_provenance ON public.program_members;
CREATE TRIGGER trg_program_members_provenance
  BEFORE INSERT OR UPDATE ON public.program_members
  FOR EACH ROW EXECUTE FUNCTION public.program_members_guard_provenance();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fermeture de l'écriture directe. Les clients installés qui portent encore
--    le vieux `// For now: free join` doivent se heurter à la BASE, pas à l'app :
--    le grant tombe, donc aucune policy ne peut le rouvrir par inadvertance.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS member_join_program ON public.program_members;
REVOKE INSERT ON public.program_members FROM authenticated;
REVOKE INSERT ON public.program_members FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6-a. « Appelé par le backend » ne se déduit PAS de `is_privileged_backend()`
--      dans une fonction SECURITY DEFINER : `current_user` y vaut le
--      propriétaire de la fonction, donc elle répondrait `true` à n'importe
--      quel appelant — et la porte Stripe serait grande ouverte. La preuve
--      d'appel serveur est la revendication de rôle du jeton, que PostgREST
--      installe et qu'un client ne peut pas forger (elle est signée).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_is_backend()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    -- Requête HTTP : le rôle du JWT tranche (service_role = clé serveur).
    WHEN nullif(current_setting('request.jwt.claims', true), '') IS NOT NULL
      THEN (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'service_role'
    -- Hors HTTP (psql, cron, migration) : le rôle de session tranche.
    ELSE session_user IN ('postgres', 'supabase_admin', 'service_role')
  END;
$$;

REVOKE ALL ON FUNCTION public.request_is_backend() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_is_backend() TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6-b. Le point d'entrée unique. DEUX portes, toutes deux vérifiées serveur :
--        stripe — réservée au backend (webhook signé) et adossée à une
--                 référence de paiement ;
--        staff  — gérant, co-gérant ou coach de la box du programme, sur un
--                 membre actif de cette box, et sans aucun montant.
--      Aucune troisième porte : un client ne s'inscrit plus lui-même, même à
--      un programme gratuit. Sinon « a payé » et « a été inscrit » resteraient
--      indistinguables, ce que la provenance existe précisément pour empêcher.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_program(
  p_program_id uuid,
  p_source text,
  p_user_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_platform_fee_cents integer DEFAULT NULL,
  p_stripe_checkout_session_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_stripe_payment_intent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    IF NOT v_backend
       AND NOT (
         v_prog.owner_id = auth.uid()
         OR (v_prog.box_id IS NOT NULL AND public.is_box_admin(v_prog.box_id))
       ) THEN
      RAISE EXCEPTION 'Accès refusé : staff de la box du programme requis'
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
$$;

DROP FUNCTION IF EXISTS public.join_program(uuid, text, uuid, date, text, integer, integer, text, text, text);

REVOKE ALL ON FUNCTION public.join_program(uuid, text, uuid, date, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_program(uuid, text, uuid, date, integer, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_program(uuid, text, uuid, date, integer, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_program(uuid, text, uuid, date, integer, integer, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Fin du mensonge de `prevent_role_escalation` : une tentative d'escalade
--    lève désormais une exception au lieu de repartir avec un « succès ».
--    Le reste est inchangé — un UPDATE qui resoumet le même rôle passe.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS NULL OR NEW.role NOT IN ('member', 'athlete') THEN
      NEW.role := 'member';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Le rôle d''un compte ne se modifie pas depuis un client'
        USING ERRCODE = '42501';
    END IF;
    -- Colonnes de compétition : écriture réservée aux RPC serveur (definer).
    NEW.elo           := OLD.elo;
    NEW.wins          := OLD.wins;
    NEW.losses        := OLD.losses;
    NEW.total_matches := OLD.total_matches;
  END IF;

  RETURN NEW;
END;
$$;
