-- ═══════════════════════════════════════════════════════════════════════════
-- WOD du Jour officiel — déploiement automatique quotidien (#WODduJour)
-- ---------------------------------------------------------------------------
-- Réutilise l'infra `daily_tournaments` (mini-tournois) en ajoutant un flag
-- `is_official`. Un seul WOD officiel par jour (Europe/Paris), déployé
-- automatiquement 6j/7 (PAS le dimanche = jour de repos), fenêtre 24h,
-- participants illimités, inscription implicite à la soumission du score.
--
-- Leaderboard "fun" (RX / Scaled séparés) SANS impact ELO : le calcul ELO
-- pairwise est O(n²) et inadapté à un WOD global potentiellement massif, et
-- fausserait les ratings. `elo_reward = 0` sur l'officiel.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Schéma ────────────────────────────────────────────────────────────
ALTER TABLE public.daily_tournaments
  ADD COLUMN IF NOT EXISTS is_official   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_date date;

-- Le WOD officiel est créé par le système (cron), pas par un utilisateur.
ALTER TABLE public.daily_tournaments
  ALTER COLUMN creator_id DROP NOT NULL;

-- Idempotence : au plus 1 WOD officiel par date.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_official_wod_per_day
  ON public.daily_tournaments(official_date)
  WHERE is_official;

CREATE INDEX IF NOT EXISTS idx_daily_t_official
  ON public.daily_tournaments(is_official, status);

-- ── 2. Pool curé de WODs (rotation déterministe par date) ──────────────────
-- Phase 1 = algo simple : on tire 1 template dans un pool curé via un hash de
-- la date → variété garantie, zéro doublon sur ~2 semaines, qualité maîtrisée.
CREATE OR REPLACE FUNCTION public._daily_official_template(p_date date)
RETURNS TABLE (wod_name text, wod_type text, duration int, score_mode text, movements text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pool jsonb := '[
    {"wod_name":"Cindy","wod_type":"AMRAP","duration":20,"score_mode":"rounds",
     "movements":"AMRAP 20 min\n5 Pull-ups\n10 Push-ups\n15 Air squats"},
    {"wod_name":"Fran","wod_type":"For Time","duration":10,"score_mode":"time",
     "movements":"21-15-9\nThrusters (43/30 kg)\nPull-ups"},
    {"wod_name":"Helen","wod_type":"For Time","duration":15,"score_mode":"time",
     "movements":"3 rounds\n400 m Run\n21 Kettlebell swings (24/16 kg)\n12 Pull-ups"},
    {"wod_name":"EMOM 12 — Force","wod_type":"EMOM","duration":12,"score_mode":"reps",
     "movements":"EMOM 12 min\nMin 1 : 8 Deadlifts (80/55 kg)\nMin 2 : 10 Box jumps (60/50 cm)\nMin 3 : 12 Wall balls (9/6 kg)"},
    {"wod_name":"Chelsea","wod_type":"EMOM","duration":30,"score_mode":"rounds",
     "movements":"EMOM 30 min\n5 Pull-ups\n10 Push-ups\n15 Air squats"},
    {"wod_name":"Grace","wod_type":"For Time","duration":8,"score_mode":"time",
     "movements":"For Time\n30 Clean & Jerk (60/42 kg)"},
    {"wod_name":"Annie","wod_type":"For Time","duration":10,"score_mode":"time",
     "movements":"50-40-30-20-10\nDouble-unders\nSit-ups"},
    {"wod_name":"AMRAP 15 — Engine","wod_type":"AMRAP","duration":15,"score_mode":"rounds",
     "movements":"AMRAP 15 min\n12 Cal Row\n9 Burpees\n6 Toes-to-bar"},
    {"wod_name":"Karen","wod_type":"For Time","duration":12,"score_mode":"time",
     "movements":"For Time\n150 Wall balls (9/6 kg)"},
    {"wod_name":"AMRAP 12 — Gymnastique","wod_type":"AMRAP","duration":12,"score_mode":"rounds",
     "movements":"AMRAP 12 min\n7 Handstand push-ups\n14 Alternating lunges\n21 Double-unders"},
    {"wod_name":"EMOM 16 — Mixte","wod_type":"EMOM","duration":16,"score_mode":"reps",
     "movements":"EMOM 16 min\nMin 1 : 15 Cal Bike\nMin 2 : 12 Dumbbell snatch (22/15 kg)\nMin 3 : 10 Burpees over bar\nMin 4 : Repos"},
    {"wod_name":"Jackie","wod_type":"For Time","duration":12,"score_mode":"time",
     "movements":"For Time\n1000 m Row\n50 Thrusters (20/15 kg)\n30 Pull-ups"},
    {"wod_name":"AMRAP 18 — Hero-lite","wod_type":"AMRAP","duration":18,"score_mode":"rounds",
     "movements":"AMRAP 18 min\n10 Deadlifts (60/42 kg)\n10 Hang power cleans\n10 Front squats\n10 Push press"},
    {"wod_name":"Barbara-lite","wod_type":"For Time","duration":20,"score_mode":"time",
     "movements":"3 rounds\n20 Pull-ups\n30 Push-ups\n40 Sit-ups\n50 Air squats"}
  ]'::jsonb;
  v_idx int;
  v_item jsonb;
BEGIN
  -- Seed déterministe = hash de la date, modulo la taille du pool.
  v_idx := (('x' || substr(md5(p_date::text), 1, 8))::bit(32)::int & 2147483647)
           % jsonb_array_length(pool);
  v_item := pool -> v_idx;
  RETURN QUERY SELECT
    v_item->>'wod_name',
    v_item->>'wod_type',
    (v_item->>'duration')::int,
    v_item->>'score_mode',
    v_item->>'movements';
END;
$$;

-- ── 3. Déploiement idempotent du WOD du Jour ───────────────────────────────
-- Appelée par pg_cron (auth.uid() NULL) ou par un admin (fallback manuel).
-- Skip le dimanche. Idempotent : 1 seul WOD officiel par date Europe/Paris.
CREATE OR REPLACE FUNCTION public.ensure_daily_official_wod()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date  date;
  v_dow   int;
  v_start timestamptz;
  v_id    uuid;
  v_is_admin boolean;
  tpl     record;
BEGIN
  -- Autorisation : cron/service (auth.uid() NULL) OU admin/super_admin.
  IF auth.uid() IS NOT NULL THEN
    SELECT (role IN ('admin', 'super_admin')) INTO v_is_admin
      FROM profiles WHERE id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'Réservé aux administrateurs';
    END IF;
  END IF;

  v_date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_dow  := EXTRACT(DOW FROM v_date)::int;   -- 0 = dimanche

  -- Pas de WOD le dimanche (jour de repos).
  IF v_dow = 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotence : déjà déployé aujourd'hui ?
  SELECT id INTO v_id FROM daily_tournaments
    WHERE is_official AND official_date = v_date;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  -- Verrou pour éviter les doublons si le cron rejoue en concurrence.
  PERFORM pg_advisory_xact_lock(hashtext('official_wod:' || v_date::text));
  SELECT id INTO v_id FROM daily_tournaments
    WHERE is_official AND official_date = v_date;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT * INTO tpl FROM _daily_official_template(v_date);

  -- Minuit Europe/Paris du jour → +24h.
  v_start := (v_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Paris';

  INSERT INTO daily_tournaments (
    creator_id, wod_name, wod_type, duration, level, movements,
    score_mode, max_players, status, elo_reward,
    is_official, official_date, starts_at, ends_at
  ) VALUES (
    NULL, tpl.wod_name, tpl.wod_type, tpl.duration, 'rx', tpl.movements,
    tpl.score_mode, 1000000, 'open', 0,
    true, v_date, v_start, v_start + interval '24 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_daily_official_wod() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ensure_daily_official_wod() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ensure_daily_official_wod() TO service_role;

-- ── 4. Planification pg_cron ───────────────────────────────────────────────
-- pg_cron tourne en UTC. Minuit Europe/Paris = 22:00 UTC (été, CEST) ou
-- 23:00 UTC (hiver, CET). On planifie aux deux horaires : la fonction est
-- idempotente (1 WOD/date Paris) donc rejouer est sans effet. Le skip du
-- dimanche est fait DANS la fonction (fiable, indépendant du fuseau du cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-wod-du-jour-cet') THEN
      PERFORM cron.unschedule('daily-wod-du-jour-cet');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-wod-du-jour-cest') THEN
      PERFORM cron.unschedule('daily-wod-du-jour-cest');
    END IF;

    PERFORM cron.schedule(
      'daily-wod-du-jour-cest', '5 22 * * *',
      $cron$ SELECT public.ensure_daily_official_wod(); $cron$
    );
    PERFORM cron.schedule(
      'daily-wod-du-jour-cet', '5 23 * * *',
      $cron$ SELECT public.ensure_daily_official_wod(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponible — activer l''extension puis rejouer le bloc de planification (ou utiliser le fallback admin / l''Edge Function).';
  END IF;
END;
$$;
