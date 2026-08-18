-- Consommer une programmation souscrite : le geste « appliquer une semaine sur le
-- calendrier avec un accès groupe ».
--
-- Un seul mécanisme, deux sources (`p_source_kind`) :
--   'subscription' — une programmation souscrite chez une autre box (implémenté ici) ;
--   'template'     — une semaine type interne (chantier Musculation, point d'extension).
--
-- La frontière est vérifiée SERVEUR, pas dans le menu déroulant : souscription
-- active ET non expirée (`current_period_end`), gérant/coach de la box cible,
-- groupes appartenant à cette box. Une souscription `canceled`/`expired`/`past_due`
-- ou dont la période est échue ne donne plus accès au contenu.

-- ═══ 1. Le cron du dimanche 18h devient opt-in par souscription ═══════════════
-- Sinon la matérialisation automatique pose S2 sur une box dont le gérant vient
-- d'appliquer S1 à la main : « le gérant reste maître » exige le contraire.
ALTER TABLE public.box_programming_subscriptions
  ADD COLUMN IF NOT EXISTS auto_apply_weekly boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.box_programming_subscriptions.auto_apply_weekly IS
  'Application automatique de la semaine due par le cron du dimanche 18h. Désactivée par défaut : le gérant applique lui-même via apply_program_week.';

CREATE OR REPLACE FUNCTION public.materialize_box_programming(p_target_monday date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_monday    date;
  v_reveal    timestamptz;
  v_inserted  integer := 0;
  sub         record;
  wodrow      record;
  v_weeknum   int;
BEGIN
  v_monday := COALESCE(
    p_target_monday,
    ((now() AT TIME ZONE 'Europe/Paris')::date
      - EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Paris'))::int + 1) + 7
  );
  v_reveal := ((v_monday - 1)::text || ' 18:00:00 Europe/Paris')::timestamptz;

  FOR sub IN
    SELECT s.*, p.weeks_count
    FROM public.box_programming_subscriptions s
    JOIN public.box_programming p ON p.id = s.programming_id
    WHERE s.status = 'active'
      AND s.auto_apply_weekly                                    -- opt-in
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  LOOP
    v_weeknum := (((v_monday - sub.week_anchor) / 7) % GREATEST(sub.weeks_count, 1)) + 1;

    FOR wodrow IN
      SELECT * FROM public.box_programming_wods
      WHERE programming_id = sub.programming_id AND week_number = v_weeknum
    LOOP
      INSERT INTO public.box_wods (
        box_id, created_by, title, description, wod_type,
        scheduled_date, time_cap_seconds, rounds, is_published,
        publish_at, sort_order, source_programming_id, source_programming_wod_id,
        notes, block_name, video_url, leaderboard_enabled,
        emom_interval_minutes, tabata_work_seconds, tabata_rest_seconds
      )
      VALUES (
        sub.subscriber_box_id, sub.created_by, wodrow.title, wodrow.description,
        wodrow.wod_type, v_monday + (wodrow.day_of_week - 1),
        wodrow.time_cap_seconds, wodrow.rounds, true,
        v_reveal, wodrow.sort_order, sub.programming_id, wodrow.id,
        wodrow.notes, wodrow.block_name, wodrow.video_url, wodrow.leaderboard_enabled,
        wodrow.emom_interval_minutes, wodrow.tabata_work_seconds, wodrow.tabata_rest_seconds
      )
      ON CONFLICT (box_id, scheduled_date, source_programming_wod_id)
        WHERE source_programming_wod_id IS NOT NULL DO NOTHING;

      IF FOUND THEN v_inserted := v_inserted + 1; END IF;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- ═══ 2. Les programmations applicables par une box ════════════════════════════
-- Le menu déroulant du Whiteboard lit cette RPC : elle n'expose QUE les
-- souscriptions qui passeraient la garde d'application.
CREATE OR REPLACE FUNCTION public.list_applicable_programmings(p_box_id uuid)
 RETURNS TABLE (
   subscription_id     uuid,
   programming_id      uuid,
   title               text,
   publisher_box_name  text,
   weeks_count         integer,
   days_per_week       integer,
   auto_apply_weekly   boolean,
   current_period_end  timestamptz
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.manages_box(p_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou coach de la box requis'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT s.id, p.id, p.title, pb.name, p.weeks_count, p.days_per_week,
           s.auto_apply_weekly, s.current_period_end
      FROM public.box_programming_subscriptions s
      JOIN public.box_programming p ON p.id = s.programming_id
      LEFT JOIN public.boxes pb ON pb.id = p.publisher_box_id
     WHERE s.subscriber_box_id = p_box_id
       AND s.status = 'active'
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
     ORDER BY p.title;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_applicable_programmings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_applicable_programmings(uuid) TO authenticated, service_role;

-- ═══ 3. Garde commune aux deux gestes ═════════════════════════════════════════
-- Résout la source en (box cible, programmation) après vérification de la
-- frontière. Toute source refusée lève 42501 — pas de retour vide ambigu.
CREATE OR REPLACE FUNCTION public.resolve_program_week_source(
  p_source_kind text,
  p_source_id   uuid,
  p_week        integer
)
 RETURNS TABLE (box_id uuid, programming_id uuid, created_by uuid)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sub record;
BEGIN
  IF p_source_kind = 'subscription' THEN
    SELECT s.subscriber_box_id, s.programming_id, p.weeks_count
      INTO v_sub
      FROM public.box_programming_subscriptions s
      JOIN public.box_programming p ON p.id = s.programming_id
     WHERE s.id = p_source_id
       AND s.status = 'active'
       AND (s.current_period_end IS NULL OR s.current_period_end > now());

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Souscription introuvable, résiliée ou expirée'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.manages_box(v_sub.subscriber_box_id) THEN
      RAISE EXCEPTION 'Accès refusé : gérant ou coach de la box requis'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_week < 1 OR p_week > GREATEST(v_sub.weeks_count, 1) THEN
      RAISE EXCEPTION 'Semaine % hors de la programmation (1..%)',
        p_week, GREATEST(v_sub.weeks_count, 1);
    END IF;

    RETURN QUERY SELECT v_sub.subscriber_box_id, v_sub.programming_id, auth.uid();

  ELSIF p_source_kind = 'template' THEN
    -- Point d'extension du chantier Musculation (publication d'une semaine type).
    RAISE EXCEPTION 'Source « template » pas encore disponible';
  ELSE
    RAISE EXCEPTION 'Source inconnue : %', p_source_kind;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_program_week_source(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_program_week_source(text, uuid, integer) TO authenticated, service_role;

-- ═══ 4. Doublons : compter avant d'écrire ═════════════════════════════════════
-- L'UI avertit sur ce compte et propose le remplacement ; l'application refuse
-- d'écraser sans `p_replace`.
CREATE OR REPLACE FUNCTION public.count_program_week_conflicts(
  p_source_kind   text,
  p_source_id     uuid,
  p_week          integer,
  p_target_monday date
)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_src   record;
  v_count integer;
BEGIN
  SELECT * INTO v_src
    FROM public.resolve_program_week_source(p_source_kind, p_source_id, p_week);

  SELECT count(*) INTO v_count
    FROM public.box_wods w
   WHERE w.box_id = v_src.box_id
     AND w.source_programming_id = v_src.programming_id
     AND w.scheduled_date >= p_target_monday
     AND w.scheduled_date < p_target_monday + 7;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.count_program_week_conflicts(text, uuid, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_program_week_conflicts(text, uuid, integer, date) TO authenticated, service_role;

-- ═══ 5. Le geste : poser une semaine sur le calendrier avec un accès ══════════
-- Une seule fonction plpgsql = une seule transaction : soit toute la semaine est
-- posée avec ses accès de groupe, soit rien.
CREATE OR REPLACE FUNCTION public.apply_program_week(
  p_source_kind   text,
  p_source_id     uuid,
  p_week          integer,
  p_target_monday date,
  p_group_ids     uuid[] DEFAULT NULL,
  p_replace       boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_src       record;
  v_conflicts integer;
  v_deleted   integer := 0;
  v_inserted  integer := 0;
  v_groups    integer := 0;
  wodrow      record;
  v_wod_id    uuid;
  v_group_id  uuid;
BEGIN
  SELECT * INTO v_src
    FROM public.resolve_program_week_source(p_source_kind, p_source_id, p_week);

  IF EXTRACT(ISODOW FROM p_target_monday)::int <> 1 THEN
    RAISE EXCEPTION 'La semaine cible doit commencer un lundi (reçu : %)', p_target_monday;
  END IF;

  -- Les groupes doivent appartenir à la box cible : sinon on ouvrirait un WOD
  -- aux membres d'une autre box.
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_group_ids) g(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.message_groups mg
          WHERE mg.id = g.id AND mg.box_id = v_src.box_id
       )
    ) THEN
      RAISE EXCEPTION 'Groupe hors de la box cible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT count(*) INTO v_conflicts
    FROM public.box_wods w
   WHERE w.box_id = v_src.box_id
     AND w.source_programming_id = v_src.programming_id
     AND w.scheduled_date >= p_target_monday
     AND w.scheduled_date < p_target_monday + 7;

  IF v_conflicts > 0 AND NOT p_replace THEN
    RAISE EXCEPTION 'Cette semaine porte déjà % WOD de cette programmation', v_conflicts
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_conflicts > 0 THEN
    -- `wod_group_access` part en cascade avec le WOD.
    WITH removed AS (
      DELETE FROM public.box_wods w
       WHERE w.box_id = v_src.box_id
         AND w.source_programming_id = v_src.programming_id
         AND w.scheduled_date >= p_target_monday
         AND w.scheduled_date < p_target_monday + 7
      RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM removed;
  END IF;

  FOR wodrow IN
    SELECT * FROM public.box_programming_wods
     WHERE programming_id = v_src.programming_id
       AND week_number = p_week
     ORDER BY day_of_week, sort_order
  LOOP
    INSERT INTO public.box_wods (
      box_id, created_by, title, description, wod_type,
      scheduled_date, time_cap_seconds, rounds, is_published,
      publish_at, sort_order, source_programming_id, source_programming_wod_id,
      notes, block_name, video_url, leaderboard_enabled,
      emom_interval_minutes, tabata_work_seconds, tabata_rest_seconds
    )
    VALUES (
      v_src.box_id, COALESCE(v_src.created_by, auth.uid()), wodrow.title,
      wodrow.description, wodrow.wod_type,
      p_target_monday + (wodrow.day_of_week - 1),
      wodrow.time_cap_seconds, wodrow.rounds, true,
      now(), wodrow.sort_order, v_src.programming_id, wodrow.id,
      wodrow.notes, wodrow.block_name, wodrow.video_url, wodrow.leaderboard_enabled,
      wodrow.emom_interval_minutes, wodrow.tabata_work_seconds, wodrow.tabata_rest_seconds
    )
    RETURNING id INTO v_wod_id;

    v_inserted := v_inserted + 1;

    -- Aucun groupe = toute la box (absence de ligne d'accès = WOD ouvert),
    -- exactement comme un WOD saisi au Whiteboard.
    IF p_group_ids IS NOT NULL THEN
      FOREACH v_group_id IN ARRAY p_group_ids LOOP
        INSERT INTO public.wod_group_access (wod_id, group_id)
        VALUES (v_wod_id, v_group_id)
        ON CONFLICT (wod_id, group_id) DO NOTHING;
        v_groups := v_groups + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'replaced', v_deleted,
    'group_links', v_groups,
    'box_id', v_src.box_id,
    'week', p_week,
    'target_monday', p_target_monday
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_program_week(text, uuid, integer, date, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_program_week(text, uuid, integer, date, uuid[], boolean) TO authenticated, service_role;
