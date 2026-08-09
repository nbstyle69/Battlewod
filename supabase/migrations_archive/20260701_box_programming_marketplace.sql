-- ═══════════════════════════════════════════════════════════════════════════
-- Marketplace de programmation box → box (Chantier 1)
-- ---------------------------------------------------------------------------
-- Une box « éditrice » publie une programmation (semaines de WOD). D'autres box
-- s'y abonnent et, chaque dimanche 18h (Europe/Paris), la semaine due est
-- matérialisée en lignes `box_wods` chez la box cliente (réutilise tout le
-- pipeline Whiteboard/badges/scores existant). La programmation reçue COEXISTE
-- avec les WOD manuels — elle ne remplace rien.
--
-- Le catalogue est réservé aux owners/coaches (jamais montré aux athlètes) :
-- garanti par les policies RLS + le fait que ces écrans vivent dans le
-- back-office.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Offre de programmation (éditée par une box) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.box_programming (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_box_id  uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  discipline        text,     -- crossfit / hyrox / hybrid / haltero ...
  level             text,     -- beginner / intermediate / advanced / all
  days_per_week     smallint CHECK (days_per_week IS NULL OR (days_per_week BETWEEN 1 AND 7)),
  weeks_count       smallint NOT NULL DEFAULT 1 CHECK (weeks_count BETWEEN 1 AND 52),
  billing           text NOT NULL DEFAULT 'free'
                      CHECK (billing IN ('free', 'one_time', 'monthly')),
  price_cents       integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency          text NOT NULL DEFAULT 'eur',
  stripe_product_id text,
  stripe_price_id   text,
  is_published      boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_box_programming_publisher
  ON public.box_programming(publisher_box_id);
CREATE INDEX IF NOT EXISTS idx_box_programming_catalogue
  ON public.box_programming(is_published, discipline, level);

-- ── 2. Contenu (WOD) d'une programmation, organisé par semaine + jour ──────
CREATE TABLE IF NOT EXISTS public.box_programming_wods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programming_id    uuid NOT NULL REFERENCES public.box_programming(id) ON DELETE CASCADE,
  week_number       smallint NOT NULL DEFAULT 1 CHECK (week_number BETWEEN 1 AND 52),
  day_of_week       smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=lundi … 7=dimanche
  title             text NOT NULL,
  description       text,
  wod_type          text,
  time_cap_seconds  integer,
  rounds            integer,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_box_programming_wods_prog
  ON public.box_programming_wods(programming_id, week_number, day_of_week, sort_order);

-- ── 3. Abonnement d'une box cliente à une programmation ────────────────────
CREATE TABLE IF NOT EXISTS public.box_programming_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programming_id         uuid NOT NULL REFERENCES public.box_programming(id) ON DELETE CASCADE,
  subscriber_box_id      uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'canceled', 'past_due', 'expired')),
  -- Ancre = lundi de la semaine où l'abonnement démarre → sert à calculer la
  -- semaine "due" (week_number) par rotation, en bouclant sur weeks_count.
  week_anchor            date NOT NULL DEFAULT (
                            (now() AT TIME ZONE 'Europe/Paris')::date
                            - EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Paris'))::int + 1
                          ),
  stripe_subscription_id text,
  stripe_customer_id     text,
  current_period_end     timestamptz,
  created_by             uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programming_id, subscriber_box_id)
);

CREATE INDEX IF NOT EXISTS idx_box_prog_subs_subscriber
  ON public.box_programming_subscriptions(subscriber_box_id, status);
CREATE INDEX IF NOT EXISTS idx_box_prog_subs_prog
  ON public.box_programming_subscriptions(programming_id, status);

-- ── 4. Traçabilité de la matérialisation dans box_wods (idempotence) ───────
ALTER TABLE public.box_wods
  ADD COLUMN IF NOT EXISTS source_programming_id     uuid REFERENCES public.box_programming(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_programming_wod_id uuid REFERENCES public.box_programming_wods(id) ON DELETE SET NULL;

-- Un même WOD source ne peut être matérialisé qu'une fois par box + date.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_box_wods_from_programming
  ON public.box_wods(box_id, scheduled_date, source_programming_wod_id)
  WHERE source_programming_wod_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.box_programming              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_programming_wods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_programming_subscriptions ENABLE ROW LEVEL SECURITY;

-- Helper : l'utilisateur courant gère-t-il cette box ? (owner direct ou owner/coach membre)
CREATE OR REPLACE FUNCTION public.manages_box(p_box_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.boxes WHERE id = p_box_id AND owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.box_members
        WHERE box_id = p_box_id AND member_id = auth.uid()
          AND role IN ('owner', 'coach') AND COALESCE(status, 'active') = 'active'
      );
$$;

-- Helper : cette box est-elle abonnée active à cette programmation ?
CREATE OR REPLACE FUNCTION public.box_subscribes_programming(p_programming_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.box_programming_subscriptions s
    JOIN public.boxes b ON b.id = s.subscriber_box_id
    WHERE s.programming_id = p_programming_id
      AND s.status = 'active'
      AND public.manages_box(b.id)
  );
$$;

-- ── box_programming ────────────────────────────────────────────────────────
-- Lecture catalogue : toute box gérante voit les offres publiées ; l'éditeur
-- voit aussi ses brouillons.
DROP POLICY IF EXISTS box_programming_select ON public.box_programming;
CREATE POLICY box_programming_select ON public.box_programming
  FOR SELECT USING (
    (is_published AND EXISTS (
      SELECT 1 FROM public.boxes b WHERE public.manages_box(b.id)
    ))
    OR public.manages_box(publisher_box_id)
  );

-- Écriture : seule l'éditrice gère ses offres.
DROP POLICY IF EXISTS box_programming_write ON public.box_programming;
CREATE POLICY box_programming_write ON public.box_programming
  FOR ALL USING (public.manages_box(publisher_box_id))
  WITH CHECK (public.manages_box(publisher_box_id));

-- ── box_programming_wods ───────────────────────────────────────────────────
-- Lisible par l'éditrice OU par une box abonnée active (le détail est le
-- produit payant → jamais lisible sans abonnement).
DROP POLICY IF EXISTS box_programming_wods_select ON public.box_programming_wods;
CREATE POLICY box_programming_wods_select ON public.box_programming_wods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.box_programming p
      WHERE p.id = programming_id AND public.manages_box(p.publisher_box_id)
    )
    OR public.box_subscribes_programming(programming_id)
  );

DROP POLICY IF EXISTS box_programming_wods_write ON public.box_programming_wods;
CREATE POLICY box_programming_wods_write ON public.box_programming_wods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.box_programming p
      WHERE p.id = programming_id AND public.manages_box(p.publisher_box_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.box_programming p
      WHERE p.id = programming_id AND public.manages_box(p.publisher_box_id)
    )
  );

-- ── box_programming_subscriptions ──────────────────────────────────────────
-- Visible par la box cliente (la sienne) ET par l'éditrice (voir ses abonnés).
DROP POLICY IF EXISTS box_prog_subs_select ON public.box_programming_subscriptions;
CREATE POLICY box_prog_subs_select ON public.box_programming_subscriptions
  FOR SELECT USING (
    public.manages_box(subscriber_box_id)
    OR EXISTS (
      SELECT 1 FROM public.box_programming p
      WHERE p.id = programming_id AND public.manages_box(p.publisher_box_id)
    )
  );

-- La box cliente crée/annule ses propres abonnements (offres gratuites en
-- direct ; les offres payantes passent par le webhook Stripe en service-role).
DROP POLICY IF EXISTS box_prog_subs_write ON public.box_programming_subscriptions;
CREATE POLICY box_prog_subs_write ON public.box_programming_subscriptions
  FOR ALL USING (public.manages_box(subscriber_box_id))
  WITH CHECK (public.manages_box(subscriber_box_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- Matérialisation : insère la semaine due de chaque abonnement actif dans
-- box_wods de la box cliente. Idempotente (ON CONFLICT DO NOTHING via l'index
-- unique). Appelée par un cron le dimanche 18h Europe/Paris.
--   - scheduled_date : lundi..dimanche de la semaine à venir.
--   - publish_at     : dimanche 18h (révélation, comme les athlètes).
--   - is_published   : true (les WOD sont "programmés", révélés à publish_at).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.materialize_box_programming(p_target_monday date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_monday    date;
  v_reveal    timestamptz;
  v_inserted  integer := 0;
  sub         record;
  wodrow      record;
  v_weeknum   int;
BEGIN
  -- Lundi de la semaine à venir (par défaut : le prochain lundi).
  v_monday := COALESCE(
    p_target_monday,
    ((now() AT TIME ZONE 'Europe/Paris')::date
      - EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Paris'))::int + 1) + 7
  );
  -- Révélation : dimanche 18h Europe/Paris précédant cette semaine.
  v_reveal := ((v_monday - 1)::text || ' 18:00:00 Europe/Paris')::timestamptz;

  FOR sub IN
    SELECT s.*, p.weeks_count
    FROM public.box_programming_subscriptions s
    JOIN public.box_programming p ON p.id = s.programming_id
    WHERE s.status = 'active'
  LOOP
    -- Semaine due par rotation (boucle sur weeks_count).
    v_weeknum := (((v_monday - sub.week_anchor) / 7) % GREATEST(sub.weeks_count, 1)) + 1;

    FOR wodrow IN
      SELECT * FROM public.box_programming_wods
      WHERE programming_id = sub.programming_id AND week_number = v_weeknum
    LOOP
      INSERT INTO public.box_wods (
        box_id, created_by, title, description, wod_type,
        scheduled_date, time_cap_seconds, rounds, is_published,
        publish_at, sort_order, source_programming_id, source_programming_wod_id
      )
      VALUES (
        sub.subscriber_box_id, sub.created_by, wodrow.title, wodrow.description,
        wodrow.wod_type, v_monday + (wodrow.day_of_week - 1),
        wodrow.time_cap_seconds, wodrow.rounds, true,
        v_reveal, wodrow.sort_order, sub.programming_id, wodrow.id
      )
      ON CONFLICT (box_id, scheduled_date, source_programming_wod_id)
        WHERE source_programming_wod_id IS NOT NULL DO NOTHING;

      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_box_programming(date) FROM public, anon, authenticated;

-- ── Planification pg_cron : dimanche 18h Europe/Paris ──────────────────────
-- pg_cron tourne en UTC. Dimanche 18h Paris = 16:00 UTC (été CEST) / 17:00 UTC
-- (hiver CET). On planifie aux deux : l'RPC est idempotente (index unique) donc
-- rejouer est sans effet. La révélation (publish_at) est calculée DANS l'RPC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize-box-programming-cest') THEN
      PERFORM cron.unschedule('materialize-box-programming-cest');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize-box-programming-cet') THEN
      PERFORM cron.unschedule('materialize-box-programming-cet');
    END IF;

    PERFORM cron.schedule(
      'materialize-box-programming-cest', '0 16 * * 0',
      $cron$ SELECT public.materialize_box_programming(); $cron$
    );
    PERFORM cron.schedule(
      'materialize-box-programming-cet', '0 17 * * 0',
      $cron$ SELECT public.materialize_box_programming(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponible — activer l''extension puis rejouer ce bloc (ou déclencher l''Edge Function materialize-box-programming).';
  END IF;
END;
$$;
