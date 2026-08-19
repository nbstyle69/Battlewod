-- Lot 3 — semaines types : enregistrer une semaine du Whiteboard, puis la reposer
-- ailleurs dans le calendrier.
--
-- Aucune table nouvelle : une semaine type EST une `box_programming` interne
-- (`is_template`), non publiée et gratuite, dont la box est à la fois éditrice et
-- consommatrice. La RLS existante (`manages_box(publisher_box_id)`) donne donc
-- l'isolation par box sans écrire une policy, et `apply_program_week` sait déjà
-- recopier les 15 colonnes de WOD, les time caps à la seconde et les accès de
-- groupe. Créer une table de templates aurait ajouté un second espace de vérité
-- à côté d'un mécanisme qui fait exactement ce travail.
--
-- Deux décisions de fond, valables pour LES DEUX sources (même `p_replace`, donc
-- le chemin marketplace en hérite) :
--
--   1. Le remplacement ne détruit jamais la donnée d'un athlète. Il n'efface que
--      les WOD vierges — aucun score, aucune complétion — et rend le détail de
--      ce qu'il a conservé. Supprimer un WOD scoré reste un geste unitaire et
--      délibéré sur ce WOD-là, jamais un effet de bord d'une réapplication.
--
--   2. Le conflit se mesure sur le JOUR du calendrier, pas sur la programmation
--      d'origine. Ce que voit l'athlète, c'est « deux WOD le mardi » : la
--      provenance lui est invisible, elle doit l'être aussi pour la détection.
--      Un WOD saisi à la main compte donc comme conflit — l'ancienne version ne
--      comptait que les WOD de la même programmation et empilait le reste en
--      silence. Seuls les jours réellement remplis par la semaine source sont
--      examinés : une semaine type du lundi au vendredi ne regarde pas le samedi.

-- ═══ 1. La semaine type est une programmation interne ═════════════════════════
ALTER TABLE public.box_programming
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.box_programming.is_template IS
  'Semaine type interne à la box (jamais publiée au catalogue, jamais payante). Le catalogue marketplace lit is_published ; les listes « mes offres » doivent exclure is_template.';

-- Une semaine type ne doit pas pouvoir devenir une offre payante par une simple
-- mise à jour : la garde vit dans la table, pas dans l'écran qui l'édite.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'box_programming_template_is_private'
  ) THEN
    ALTER TABLE public.box_programming
      ADD CONSTRAINT box_programming_template_is_private
      CHECK (
        NOT is_template
        OR (NOT is_published AND billing = 'free' AND price_cents = 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_box_programming_templates
  ON public.box_programming (publisher_box_id)
  WHERE is_template;

-- ═══ 2. Enregistrer la semaine affichée comme semaine type ════════════════════
-- Recopie les WOD d'une semaine du calendrier dans une programmation interne.
-- `p_template_id` permet d'écraser une semaine type existante (son contenu, pas
-- les WOD déjà posés : `box_wods.source_programming_wod_id` est ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.save_week_as_template(
  p_box_id        uuid,
  p_source_monday date,
  p_title         text DEFAULT NULL,
  p_template_id   uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template_id uuid;
  v_title       text;
  v_days        integer;
  v_wods        integer := 0;
  v_replaced    integer := 0;
  wodrow        record;
BEGIN
  IF NOT public.manages_box(p_box_id) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou coach de la box requis'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXTRACT(ISODOW FROM p_source_monday)::int <> 1 THEN
    RAISE EXCEPTION 'La semaine source doit commencer un lundi (reçu : %)', p_source_monday;
  END IF;

  SELECT count(*), count(DISTINCT scheduled_date)
    INTO v_wods, v_days
    FROM public.box_wods
   WHERE box_id = p_box_id
     AND scheduled_date >= p_source_monday
     AND scheduled_date < p_source_monday + 7;

  IF v_wods = 0 THEN
    RAISE EXCEPTION 'Aucun WOD sur la semaine du % : rien à enregistrer', p_source_monday;
  END IF;

  v_title := NULLIF(btrim(COALESCE(p_title, '')), '');
  v_title := COALESCE(v_title, 'Semaine type du ' || to_char(p_source_monday, 'DD/MM/YYYY'));

  IF p_template_id IS NOT NULL THEN
    -- Mise à jour d'une semaine type existante : la box doit la gérer, et ce doit
    -- bien être une semaine type (jamais une offre du catalogue).
    UPDATE public.box_programming
       SET title = v_title,
           days_per_week = v_days,
           weeks_count = 1,
           updated_at = now()
     WHERE id = p_template_id
       AND is_template
       AND public.manages_box(publisher_box_id)
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'Semaine type introuvable pour cette box'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    WITH removed AS (
      DELETE FROM public.box_programming_wods
       WHERE programming_id = v_template_id
      RETURNING 1
    )
    SELECT count(*) INTO v_replaced FROM removed;
  ELSE
    INSERT INTO public.box_programming (
      publisher_box_id, title, description, discipline, level,
      days_per_week, weeks_count, billing, price_cents,
      is_published, is_template, created_by
    )
    VALUES (
      p_box_id, v_title, NULL, NULL, NULL,
      v_days, 1, 'free', 0,
      false, true, auth.uid()
    )
    RETURNING id INTO v_template_id;
  END IF;

  FOR wodrow IN
    SELECT * FROM public.box_wods
     WHERE box_id = p_box_id
       AND scheduled_date >= p_source_monday
       AND scheduled_date < p_source_monday + 7
     ORDER BY scheduled_date, sort_order
  LOOP
    INSERT INTO public.box_programming_wods (
      programming_id, week_number, day_of_week, title, description, wod_type,
      time_cap_seconds, rounds, sort_order,
      notes, block_name, video_url, leaderboard_enabled,
      emom_interval_minutes, tabata_work_seconds, tabata_rest_seconds
    )
    VALUES (
      v_template_id, 1, EXTRACT(ISODOW FROM wodrow.scheduled_date)::smallint,
      wodrow.title, wodrow.description, wodrow.wod_type,
      wodrow.time_cap_seconds, wodrow.rounds, wodrow.sort_order,
      wodrow.notes, wodrow.block_name, wodrow.video_url, wodrow.leaderboard_enabled,
      wodrow.emom_interval_minutes, wodrow.tabata_work_seconds, wodrow.tabata_rest_seconds
    );
  END LOOP;

  RETURN jsonb_build_object(
    'template_id', v_template_id,
    'title', v_title,
    'wods', v_wods,
    'days', v_days,
    'replaced_wods', v_replaced
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_week_as_template(uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_week_as_template(uuid, date, text, uuid) TO authenticated, service_role;

-- ═══ 3. Les semaines types d'une box ══════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_week_templates(p_box_id uuid)
 RETURNS TABLE (
   template_id uuid,
   title       text,
   wods_count  integer,
   days_count  integer,
   updated_at  timestamptz
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
    SELECT p.id,
           p.title,
           count(w.id)::int,
           count(DISTINCT w.day_of_week)::int,
           p.updated_at
      FROM public.box_programming p
      LEFT JOIN public.box_programming_wods w ON w.programming_id = p.id
     WHERE p.publisher_box_id = p_box_id
       AND p.is_template
     GROUP BY p.id, p.title, p.updated_at
     ORDER BY p.updated_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_week_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_week_templates(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_week_template(p_template_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted uuid;
BEGIN
  -- Les WOD déjà posés survivent : `box_wods.source_programming_id` et
  -- `source_programming_wod_id` sont ON DELETE SET NULL.
  DELETE FROM public.box_programming
   WHERE id = p_template_id
     AND is_template
     AND public.manages_box(publisher_box_id)
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'Semaine type introuvable pour cette box'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_week_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_week_template(uuid) TO authenticated, service_role;

-- ═══ 4. La source « template » devient disponible ═════════════════════════════
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
  v_tpl record;
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
    -- Une semaine type se consomme chez elle : la box éditrice EST la box cible.
    -- Aucune souscription n'entre en jeu, la garde est la gestion de la box.
    SELECT p.id, p.publisher_box_id, p.weeks_count, p.created_by
      INTO v_tpl
      FROM public.box_programming p
     WHERE p.id = p_source_id
       AND p.is_template;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Semaine type introuvable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT public.manages_box(v_tpl.publisher_box_id) THEN
      RAISE EXCEPTION 'Accès refusé : gérant ou coach de la box requis'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_week < 1 OR p_week > GREATEST(v_tpl.weeks_count, 1) THEN
      RAISE EXCEPTION 'Semaine % hors de la semaine type (1..%)',
        p_week, GREATEST(v_tpl.weeks_count, 1);
    END IF;

    RETURN QUERY SELECT v_tpl.publisher_box_id, v_tpl.id, COALESCE(v_tpl.created_by, auth.uid());
  ELSE
    RAISE EXCEPTION 'Source inconnue : %', p_source_kind;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_program_week_source(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_program_week_source(text, uuid, integer) TO authenticated, service_role;

-- ═══ 5. Conflits : sur le jour du calendrier, provenance nommée ═══════════════
-- Le détail sert l'écran (« mardi : 1 WOD saisi à la main, porte un score ») ; le
-- compte sert le bouton. Les deux lisent la même définition que l'application,
-- sinon l'avertissement mentirait sur ce que le geste va faire.
CREATE OR REPLACE FUNCTION public.list_program_week_conflicts(
  p_source_kind   text,
  p_source_id     uuid,
  p_week          integer,
  p_target_monday date
)
 RETURNS TABLE (
   scheduled_date date,
   wod_id         uuid,
   title          text,
   origin         text,
   origin_title   text,
   has_results    boolean
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_src record;
BEGIN
  SELECT * INTO v_src
    FROM public.resolve_program_week_source(p_source_kind, p_source_id, p_week);

  RETURN QUERY
    SELECT w.scheduled_date,
           w.id,
           w.title,
           CASE
             WHEN w.source_programming_id IS NULL THEN 'manual'
             WHEN p.is_template THEN 'template'
             ELSE 'subscription'
           END,
           p.title,
           (EXISTS (SELECT 1 FROM public.wod_scores s WHERE s.wod_id = w.id)
            OR EXISTS (SELECT 1 FROM public.wod_completions c WHERE c.wod_id = w.id))
      FROM public.box_wods w
      LEFT JOIN public.box_programming p ON p.id = w.source_programming_id
     WHERE w.box_id = v_src.box_id
       AND w.scheduled_date IN (
         SELECT p_target_monday + (pw.day_of_week - 1)
           FROM public.box_programming_wods pw
          WHERE pw.programming_id = v_src.programming_id
            AND pw.week_number = p_week
       )
     ORDER BY w.scheduled_date, w.sort_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_program_week_conflicts(text, uuid, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_program_week_conflicts(text, uuid, integer, date) TO authenticated, service_role;

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
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.list_program_week_conflicts(
      p_source_kind, p_source_id, p_week, p_target_monday
    );

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.count_program_week_conflicts(text, uuid, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_program_week_conflicts(text, uuid, integer, date) TO authenticated, service_role;

-- ═══ 6. Appliquer : le remplacement épargne les WOD qui portent des résultats ══
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
  v_dates     date[];
  v_conflicts integer := 0;
  v_deleted   integer := 0;
  v_kept      integer := 0;
  v_kept_rows jsonb   := '[]'::jsonb;
  v_inserted  integer := 0;
  v_skipped   integer := 0;
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

  -- Les jours réellement remplis par la semaine source : un jour que la source
  -- ne touche pas n'est ni un conflit ni une cible de suppression.
  SELECT array_agg(DISTINCT p_target_monday + (pw.day_of_week - 1))
    INTO v_dates
    FROM public.box_programming_wods pw
   WHERE pw.programming_id = v_src.programming_id
     AND pw.week_number = p_week;

  IF v_dates IS NULL THEN
    RAISE EXCEPTION 'La semaine % de cette source ne contient aucun WOD', p_week;
  END IF;

  SELECT count(*) INTO v_conflicts
    FROM public.box_wods w
   WHERE w.box_id = v_src.box_id
     AND w.scheduled_date = ANY (v_dates);

  IF v_conflicts > 0 AND NOT p_replace THEN
    RAISE EXCEPTION 'Ces jours portent déjà % WOD', v_conflicts
      USING ERRCODE = 'unique_violation';
  END IF;

  IF v_conflicts > 0 THEN
    -- Un score alimente l'ELO et l'historique de l'athlète : le geste de
    -- programmation du coach ne l'emporte pas, même averti. Les WOD scorés ou
    -- marqués faits sont conservés et nommés dans le retour.
    SELECT count(*),
           COALESCE(jsonb_agg(jsonb_build_object(
             'date', w.scheduled_date, 'title', w.title
           ) ORDER BY w.scheduled_date), '[]'::jsonb)
      INTO v_kept, v_kept_rows
      FROM public.box_wods w
     WHERE w.box_id = v_src.box_id
       AND w.scheduled_date = ANY (v_dates)
       AND (EXISTS (SELECT 1 FROM public.wod_scores s WHERE s.wod_id = w.id)
            OR EXISTS (SELECT 1 FROM public.wod_completions c WHERE c.wod_id = w.id));

    -- `wod_group_access` part en cascade avec le WOD vierge supprimé.
    WITH removed AS (
      DELETE FROM public.box_wods w
       WHERE w.box_id = v_src.box_id
         AND w.scheduled_date = ANY (v_dates)
         AND NOT EXISTS (SELECT 1 FROM public.wod_scores s WHERE s.wod_id = w.id)
         AND NOT EXISTS (SELECT 1 FROM public.wod_completions c WHERE c.wod_id = w.id)
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
    -- Le WOD conservé parce qu'il porte un score occupe déjà cette place : on ne
    -- le double pas et on ne le remplace pas.
    ON CONFLICT (box_id, scheduled_date, source_programming_wod_id)
      WHERE source_programming_wod_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_wod_id;

    IF v_wod_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

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
    'kept_with_results', v_kept,
    'kept_details', v_kept_rows,
    'skipped', v_skipped,
    'group_links', v_groups,
    'box_id', v_src.box_id,
    'week', p_week,
    'target_monday', p_target_monday
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_program_week(text, uuid, integer, date, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_program_week(text, uuid, integer, date, uuid[], boolean) TO authenticated, service_role;
