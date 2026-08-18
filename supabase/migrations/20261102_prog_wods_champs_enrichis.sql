-- Programmation box→box : les WOD vendus doivent porter les mêmes champs que
-- les WOD du Whiteboard. Sans ça, un WOD acheté arrive chez la box abonnée sans
-- block, sans notes, sans paramètres EMOM/Tabata et sans vidéo — et le drapeau
-- de classement était perdu à la copie.
--
-- Les mouvements structurés, eux, n'ont pas besoin de colonne : ils sont
-- sérialisés une ligne par mouvement dans `description`, exactement comme dans
-- `box_wods` (« 21 Thruster (43/30 kg) »).

ALTER TABLE public.box_programming_wods
  ADD COLUMN IF NOT EXISTS notes                 text,
  ADD COLUMN IF NOT EXISTS block_name            text,
  ADD COLUMN IF NOT EXISTS video_url             text,
  ADD COLUMN IF NOT EXISTS leaderboard_enabled   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS emom_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS tabata_work_seconds   integer,
  ADD COLUMN IF NOT EXISTS tabata_rest_seconds   integer;

-- La matérialisation hebdomadaire ne recopiait que 8 colonnes sur 15. Les 7
-- ajoutées ci-dessus s'y ajoutent, ainsi que `leaderboard_enabled` — un WOD
-- vendu hors classement devenait classé chez l'abonné (défaut de la table).
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
