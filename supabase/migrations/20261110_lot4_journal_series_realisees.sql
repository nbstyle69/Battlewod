-- Lot 4 — suivi athlète : le journal des séries réellement réalisées.
--
-- Ce que le lot 2 a livré : un bloc de force prescrit (séries × reps × charge)
-- et un 1RM alimenté par la charge saisie. Ce qu'il jetait : le travail. Le
-- coach prescrit 5 × 3 @ 80 %, l'athlète soulève, le 1RM bouge, et personne ne
-- peut dire ce qui a été fait. Cette table est cette trace — une ligne par
-- série.
--
-- Trois décisions de conception, chacune contre une faute déjà commise ailleurs :
--
--   1. Table dédiée, PAS `movement_logs`. `movement_logs` est le compteur des
--      badges et des reps à vie, et le lot 2 a délibérément rendu les blocs de
--      force invisibles à ce crédit (écriture « nom d'abord », le parseur rend
--      `null`, un test verrouille le non-crédit). Y écrire les séries de force
--      recréditerait de la muscu en badges, en silence. Le journal des séries
--      n'est pas un second espace de vérité sur les reps : il porte la seule
--      dimension qu'aucune table ne porte, ce qui a été RÉALISÉ sur un bloc.
--
--   2. Provenance par couple `(source_type, source_id)`, jamais par clé
--      étrangère vers `program_wods` : cette table disparaît au lot 5 (son
--      contenu passe sur `box_programming`/`box_wods`), une FK dessus rendrait
--      ce lot à refaire. `source_title` est figé à l'écriture, pour qu'une
--      séance supprimée reste lisible dans l'historique.
--
--   3. Ré-enregistrer un score ne duplique pas l'historique : l'unicité
--      (athlète, source, mouvement, index de série) fait de la réécriture un
--      upsert, et le client purge ensuite les séries qu'il n'a pas réécrites.
--      Corriger sa saisie corrige l'historique, elle ne l'empile pas — et une
--      série qui disparaît de la grille disparaît du journal : trois séries
--      déclarées après cinq, c'est trois séries.
--
-- Ce que la table ne stocke PAS, volontairement : le 1RM estimé. Il se calcule
-- (Epley) depuis reps et charge ; le stocker créerait une seconde valeur de
-- record à côté de `profiles.personal_records`, donc deux chiffres qui peuvent
-- se contredire. La provenance du record vit côté profil, dans la clé
-- `<catégorie>_<mouvement>_src` qui pointe l'`id` de la série qui l'a établi.

-- ═══ 1. Le journal ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.strength_set_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Séance d'origine. Non nullable : une série sans séance n'aurait pas de
  -- provenance, et c'est justement la provenance qu'on livre ici.
  source_type        text NOT NULL CHECK (source_type IN ('whiteboard', 'program')),
  source_id          uuid NOT NULL,
  source_title       text,
  -- Mouvement tel qu'écrit dans le bloc, et libellé canonique de la page
  -- Records quand il en a un (seuls ceux-là alimentent un 1RM).
  movement           text NOT NULL CHECK (length(btrim(movement)) > 0),
  movement_label     text,
  set_index          integer NOT NULL CHECK (set_index >= 1 AND set_index <= 50),
  -- Réalisé.
  reps               integer NOT NULL CHECK (reps >= 1 AND reps <= 500),
  load_kg            numeric(6,2) CHECK (load_kg IS NULL OR (load_kg > 0 AND load_kg <= 500)),
  -- Prescrit, figé à l'écriture : c'est ce qui rend l'écart lisible par le
  -- coach (« prévu 5 × 3 @ 80, fait 5, 5, 3 »).
  prescribed_reps    integer CHECK (prescribed_reps IS NULL OR prescribed_reps >= 1),
  prescribed_load_kg numeric(6,2) CHECK (prescribed_load_kg IS NULL OR prescribed_load_kg > 0),
  performed_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.strength_set_logs IS
  'Séries de musculation réellement réalisées (une ligne par série). Source des 1RM et de la fiche athlète du back-office. N''alimente ni les badges ni les reps à vie : voir movement_logs, dont le crédit exclut volontairement les blocs de force.';
COMMENT ON COLUMN public.strength_set_logs.source_type IS
  'whiteboard = WOD de box (box_wods), program = WOD de programme commercial. Pas de clé étrangère : program_wods disparaît au lot 5, et une séance supprimée ne doit pas effacer l''historique de l''athlète (source_title est figé pour ça).';
COMMENT ON COLUMN public.strength_set_logs.movement_label IS
  'Libellé canonique de la page Records (« Back Squat »), NULL si le mouvement n''a pas de 1RM de référence.';

-- Une correction de score corrige l'historique au lieu de l'empiler.
CREATE UNIQUE INDEX IF NOT EXISTS strength_set_logs_unique_set
  ON public.strength_set_logs (user_id, source_type, source_id, movement, set_index);

CREATE INDEX IF NOT EXISTS strength_set_logs_user_performed
  ON public.strength_set_logs (user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS strength_set_logs_user_movement
  ON public.strength_set_logs (user_id, movement_label, performed_at DESC);

-- ═══ 2. RLS : l'athlète écrit et lit sa propre trace, personne d'autre ════════
ALTER TABLE public.strength_set_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.strength_set_logs'::regclass
                   AND polname = 'strength_sets_own_read') THEN
    CREATE POLICY strength_sets_own_read ON public.strength_set_logs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.strength_set_logs'::regclass
                   AND polname = 'strength_sets_own_insert') THEN
    CREATE POLICY strength_sets_own_insert ON public.strength_set_logs
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.strength_set_logs'::regclass
                   AND polname = 'strength_sets_own_update') THEN
    CREATE POLICY strength_sets_own_update ON public.strength_set_logs
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.strength_set_logs'::regclass
                   AND polname = 'strength_sets_own_delete') THEN
    CREATE POLICY strength_sets_own_delete ON public.strength_set_logs
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- Le staff ne lit PAS la table : il lit la RPC ci-dessous. Une policy de lecture
-- staff sur la table donnerait aussi la lecture à tout ce qui joint dessus.
REVOKE ALL ON public.strength_set_logs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strength_set_logs TO authenticated;

-- ═══ 3. Lecture staff : même autorisation que le profil privé ═════════════════
-- Le test d'autorisation est celui de `get_athlete_private_profile()`, à la
-- lettre : gérant principal, co-gérant ou coach d'une box où l'athlète est
-- membre actif — ou l'athlète lui-même. Deux tests divergents sur la même
-- relation finiraient par ne plus dire la même chose.
CREATE OR REPLACE FUNCTION public.list_athlete_strength_sets(
  p_user_id uuid,
  p_limit   integer DEFAULT 200
)
RETURNS TABLE (
  id                 uuid,
  source_type        text,
  source_id          uuid,
  source_title       text,
  movement           text,
  movement_label     text,
  set_index          integer,
  reps               integer,
  load_kg            numeric,
  prescribed_reps    integer,
  prescribed_load_kg numeric,
  performed_at       timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  IF p_user_id <> auth.uid()
     AND NOT EXISTS (
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
  SELECT s.id, s.source_type, s.source_id, s.source_title, s.movement,
         s.movement_label, s.set_index, s.reps, s.load_kg,
         s.prescribed_reps, s.prescribed_load_kg, s.performed_at
  FROM public.strength_set_logs s
  WHERE s.user_id = p_user_id
  ORDER BY s.performed_at DESC, s.movement, s.set_index
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

COMMENT ON FUNCTION public.list_athlete_strength_sets(uuid, integer) IS
  'Journal des séries réalisées d''un athlète. Autorisation identique à get_athlete_private_profile() : l''athlète lui-même, ou le gérant/co-gérant/coach d''une box où il est membre actif. Le journal n''est pas cloisonné par box : le staff voit aussi les séances faites ailleurs, exactement comme il voit déjà tous les 1RM.';

REVOKE ALL ON FUNCTION public.list_athlete_strength_sets(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_athlete_strength_sets(uuid, integer) TO authenticated;

-- ═══ 4. Règle 12 — une capacité sans appelant doit le dire ════════════════════
-- Trois fonctions ont été livrées comme points d'extension et n'ont jamais été
-- appelées par une interface : relues six mois plus tard, elles se distinguent
-- mal d'une fonctionnalité livrée. On l'écrit dans leur en-tête.
COMMENT ON FUNCTION public.join_program(uuid, text, uuid, date, integer, integer, text, text, text) IS
  'Inscription à un programme par deux portes vérifiées : « stripe » (webhook signé uniquement) et « staff » (gérant/co-gérant de la box du programme). La colonne provenance est asymétrique : un paiement requalifie une ligne non vérifiée, une assignation ne dégrade jamais un achat. POINT D''EXTENSION : la porte « staff » n''a aucun appelant dans les interfaces à ce jour, donc elle n''est pas exercée en production (le lot 5 lui donne son écran).';

COMMENT ON FUNCTION public.resolve_program_week_source(text, uuid, integer) IS
  'Résout la semaine source d''une application de programmation : « subscription » (offre souscrite) ou « template » (semaine type interne de la box). La branche « template » a été livrée sans appelant au lot 3-serveur ; elle est exercée en production depuis l''écran Whiteboard du back-office (lot 3-web) — occurrence refermée, conservée ici comme trace.';

COMMENT ON FUNCTION public.get_athlete_private_profile(uuid) IS
  'Profil privé d''un athlète (nom, genre, 1RM) pour lui-même ou pour le gérant/co-gérant/coach d''une box où il est membre actif. Livrée sans appelant au lot 0-bis ; premier appelant réel : la fiche athlète du /members du back-office web (lot 4).';
