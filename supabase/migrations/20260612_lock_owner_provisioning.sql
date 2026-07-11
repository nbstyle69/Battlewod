-- ═══════════════════════════════════════════════════════════════
-- Verrou provisioning owner — l'app cliente ne peut plus se promouvoir
-- gérant de box. La création owner (compte + box + abonnement) passe
-- désormais UNIQUEMENT par le web (athlex.app) en service_role.
--
-- Les triggers ci-dessous s'exécutent quelle que soit la RLS. On
-- autorise les backends privilégiés (service_role / dashboard) et on
-- bloque toute tentative depuis une session client authentifiée.
-- ═══════════════════════════════════════════════════════════════

-- Session privilégiée = webhook Stripe / onboarding web (service_role),
-- migrations et SQL editor (postgres / supabase_admin), auth admin.
CREATE OR REPLACE FUNCTION public.is_privileged_backend()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_user IN (
    'service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin'
  );
$$;

-- ── 1. profiles : empêcher l'escalade de rôle côté client ──────────
-- Un client ne peut ni s'inscrire avec un rôle privilégié, ni se
-- promouvoir ensuite. On ré-aligne silencieusement le rôle sur une
-- valeur non privilégiée / sur l'ancienne valeur (non bloquant pour
-- les updates de profil légitimes qui ne touchent pas `role`).
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
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
      NEW.role := OLD.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ── 2. boxes : création réservée au backend web ───────────────────
-- Les owners existants gardent leur box ; seules les NOUVELLES
-- créations client sont bloquées (l'update des réglages reste permis).
CREATE OR REPLACE FUNCTION public.prevent_client_box_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La création de box se fait sur athlex.app (owner via abonnement web).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_box_insert ON public.boxes;
CREATE TRIGGER trg_prevent_client_box_insert
  BEFORE INSERT ON public.boxes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_box_insert();

-- ── 3. box_subscriptions : écriture réservée au backend web ────────
-- Le client ne doit jamais écrire un abonnement (le webhook Stripe et
-- l'onboarding web le font en service_role). La lecture owner reste
-- ouverte via la policy RLS existante.
CREATE OR REPLACE FUNCTION public.prevent_client_subscription_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_privileged_backend() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'Les abonnements de box sont gérés côté serveur (Stripe / athlex.app).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_subscription_write ON public.box_subscriptions;
CREATE TRIGGER trg_prevent_client_subscription_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.box_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_subscription_write();

-- ── 4. Nettoyage : retirer les policies client devenues inutiles ───
-- Ces policies autorisaient l'app à insérer un abonnement au moment de
-- la création self-serve de box (supprimée). Le service_role ignore la
-- RLS, donc le web n'est pas impacté.
DROP POLICY IF EXISTS "box_owner_insert_subscription" ON public.box_subscriptions;
-- Ancienne policy trop large (USING true pour tous) — le service_role
-- écrit déjà en contournant la RLS, elle n'a plus lieu d'être.
DROP POLICY IF EXISTS "service_role_update_subscription" ON public.box_subscriptions;
