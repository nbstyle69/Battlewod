-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 3A — SUPPRESSION DE COMPTE : réparation structurelle
-- Basé sur le DUMP RÉEL de prod (126 FK vers l'utilisateur : 75 CASCADE,
-- 33 NO ACTION, 18 SET NULL).
--
-- CE QUI CLOCHE (mesuré, pas supposé) :
--  • delete_user_account() nettoie une LISTE DE TABLES ÉCRITE À LA MAIN en
--    mars. 33 FK sont en NO ACTION ; la fonction n'en couvre qu'une partie.
--    Résultat mesuré : tout compte ayant reçu un message (34 lignes), validé
--    un score (16), créé un tournoi (5) ou une compétition (13), possédé un
--    programme (4) ou joué un match (1) NE PEUT PAS se supprimer — violation
--    FK. Les tables encore vides (swiss, scores, wods…) casseront au premier
--    usage. C'est le mode d'échec structurel d'une liste manuelle : chaque
--    nouvelle table ajoute une mine.
--  • La fonction ne touche pas storage : l'avatar (image + chemin = uid)
--    survit à la suppression du compte. Mesuré : 2 avatars, 2 orphelins.
--
-- LE CORRECTIF EST DÉCLARATIF, PAS UNE LISTE PLUS LONGUE :
-- on règle la POLITIQUE DE SUPPRESSION dans les FK elles-mêmes, une fois pour
-- toutes. La règle de décision, appliquée aux 33 NO ACTION :
--  • La ligne EST la donnée de l'utilisateur (son score, son inscription, sa
--    participation, son message envoyé) → CASCADE : elle part avec lui.
--  • La ligne appartient à QUELQU'UN D'AUTRE ou à la communauté et ne fait que
--    RÉFÉRENCER l'utilisateur (créateur d'un tournoi, validateur d'un score,
--    adversaire d'un match, destinataire d'un message) → SET NULL : le contenu
--    des autres survit, anonymisé. C'est déjà la règle des 18 SET NULL
--    existants (bracket_matches, reports…), on l'étend, on n'invente rien.
-- Après ça, delete_user_account() n'a plus de liste à maintenir : purge
-- storage + retrait des tableaux membres + DELETE auth.users, et les FK font
-- le reste — y compris pour les tables futures si elles déclarent leur règle.
--
-- DEUX DÉCISIONS EXPLICITES, à valider au protocole :
--  1. GARDE OWNER : boxes.owner_id est déjà CASCADE en prod → un owner qui
--     supprime son compte supprime SA BOX et toutes ses adhésions, sans
--     avertissement. On refuse la suppression tant que sa box a d'autres
--     membres actifs (message clair : transférer ou fermer d'abord). Un owner
--     seul dans sa box peut se supprimer (la box part avec lui, personne n'est
--     lésé).
--  2. programs.owner_id → SET NULL (le programme survit sans propriétaire).
--     Discutable — un programme sans owner n'est plus gérable — mais on ne
--     détruit pas le contenu acheté par d'autres ; à réviser avec l'épic
--     paiement.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 3A.1 — Règles de suppression déclaratives sur les 33 FK NO ACTION
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- (table, contrainte, colonne, cible, action)
      -- ── Donnée DE l'utilisateur → CASCADE ─────────────────────────────
      ('wod_scores',                    'wod_scores_member_id_fkey',                    'member_id',    'public.profiles', 'CASCADE'),
      ('score_comments',                'score_comments_author_id_fkey',                'author_id',    'public.profiles', 'CASCADE'),
      ('messages',                      'messages_sender_id_fkey',                      'sender_id',    'public.profiles', 'CASCADE'),
      ('message_reactions',             'message_reactions_member_id_fkey',             'member_id',    'public.profiles', 'CASCADE'),
      ('message_replies',               'message_replies_sender_id_fkey',               'sender_id',    'public.profiles', 'CASCADE'),
      ('event_registrations',           'event_registrations_member_id_fkey',           'member_id',    'public.profiles', 'CASCADE'),
      ('scores',                        'scores_athlete_id_fkey',                       'athlete_id',   'public.profiles', 'CASCADE'),
      ('competition_participants',      'competition_participants_member_id_fkey',      'member_id',    'public.profiles', 'CASCADE'),
      ('competition_scores',            'competition_scores_member_id_fkey',            'member_id',    'public.profiles', 'CASCADE'),
      ('program_members',               'program_members_user_id_fkey',                 'user_id',      'auth.users',      'CASCADE'),
      ('program_scores',                'program_scores_user_id_fkey',                  'user_id',      'auth.users',      'CASCADE'),
      ('inter_swiss_standings',         'inter_swiss_standings_athlete_id_fkey',        'athlete_id',   'public.profiles', 'CASCADE'),
      -- ── Référence à l'utilisateur dans le contenu des autres → SET NULL ──
      ('messages',                      'messages_receiver_id_fkey',                    'receiver_id',  'public.profiles', 'SET NULL'),
      ('box_wods',                      'box_wods_created_by_fkey',                     'created_by',   'public.profiles', 'SET NULL'),
      ('events',                        'events_created_by_fkey',                       'created_by',   'public.profiles', 'SET NULL'),
      ('message_groups',                'message_groups_created_by_fkey',               'created_by',   'public.profiles', 'SET NULL'),
      ('tournaments',                   'tournaments_created_by_fkey',                  'created_by',   'public.profiles', 'SET NULL'),
      ('mini_tournaments',              'mini_tournaments_created_by_fkey',             'created_by',   'public.profiles', 'SET NULL'),
      ('competitions',                  'competitions_created_by_fkey',                 'created_by',   'public.profiles', 'SET NULL'),
      ('wods',                          'wods_created_by_fkey',                         'created_by',   'public.profiles', 'SET NULL'),
      ('box_programming',               'box_programming_created_by_fkey',              'created_by',   'public.profiles', 'SET NULL'),
      ('box_programming_subscriptions', 'box_programming_subscriptions_created_by_fkey','created_by',   'public.profiles', 'SET NULL'),
      ('physical_competitions',         'physical_competitions_created_by_fkey',        'created_by',   'auth.users',      'SET NULL'),
      ('programs',                      'programs_owner_id_fkey',                       'owner_id',     'auth.users',      'SET NULL'),
      ('tournament_scores',             'tournament_scores_validated_by_fkey',          'validated_by', 'public.profiles', 'SET NULL'),
      ('scores',                        'scores_validated_by_fkey',                     'validated_by', 'public.profiles', 'SET NULL'),
      ('daily_tournament_scores',       'daily_tournament_scores_contested_by_fkey',    'contested_by', 'public.profiles', 'SET NULL'),
      ('matches',                       'matches_athlete1_id_fkey',                     'athlete1_id',  'public.profiles', 'SET NULL'),
      ('matches',                       'matches_athlete2_id_fkey',                     'athlete2_id',  'public.profiles', 'SET NULL'),
      ('matches',                       'matches_winner_id_fkey',                       'winner_id',    'public.profiles', 'SET NULL'),
      ('inter_swiss_pairings',          'inter_swiss_pairings_athlete1_id_fkey',        'athlete1_id',  'public.profiles', 'SET NULL'),
      ('inter_swiss_pairings',          'inter_swiss_pairings_athlete2_id_fkey',        'athlete2_id',  'public.profiles', 'SET NULL'),
      ('inter_swiss_pairings',          'inter_swiss_pairings_winner_id_fkey',          'winner_id',    'public.profiles', 'SET NULL')
    ) AS t(tbl, con, col, cible, action)
  LOOP
    -- SET NULL exige une colonne nullable (no-op si elle l'est déjà).
    IF r.action = 'SET NULL' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col);
    END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s',
      r.tbl, r.con, r.col, r.cible, r.action);
  END LOOP;
END $$;

-- Filet de sécurité : après ce lot, il ne doit RESTER AUCUNE FK NO ACTION
-- vers l'utilisateur dans public. Si une future table en ajoute une, ce bloc
-- ne la verra pas — d'où le contrôle du même invariant dans le protocole.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_constraint c
  JOIN pg_class src ON src.oid = c.conrelid
  JOIN pg_namespace sn ON sn.oid = src.relnamespace
  JOIN pg_class tgt ON tgt.oid = c.confrelid
  JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
  WHERE c.contype = 'f' AND c.confdeltype IN ('a','r')
    AND sn.nspname = 'public'
    AND ((tn.nspname = 'public' AND tgt.relname = 'profiles')
      OR (tn.nspname = 'auth'   AND tgt.relname = 'users'));
  IF n > 0 THEN
    RAISE EXCEPTION 'Il reste % FK NO ACTION/RESTRICT vers l''utilisateur — liste incomplete, on s''arrete', n;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3A.2 — delete_user_account() : plus de liste, plus d'oubli possible
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- GARDE OWNER : boxes.owner_id est CASCADE → supprimer un owner supprime sa
  -- box et toutes les adhésions. On l'interdit tant que d'autres membres
  -- actifs en dépendent. (Owner seul : la suppression passe, la box part.)
  IF EXISTS (
    SELECT 1 FROM public.boxes b
    JOIN public.box_members m ON m.box_id = b.id
    WHERE b.owner_id = uid AND m.member_id <> uid AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'BOX_OWNER: transfère ou ferme ta box avant de supprimer ton compte'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RGPD storage : avatars + documents + pièces jointes de l'utilisateur.
  -- (Supprime les métadonnées et rend l'objet inaccessible ; le protocole
  --  vérifie qu'aucune URL ne le sert plus.)
  DELETE FROM storage.objects
  WHERE (bucket_id = 'avatars'   AND (owner = uid OR name LIKE uid || '/%'))
     OR (bucket_id = 'documents' AND (owner = uid OR name LIKE uid || '/%'))
     OR (bucket_id = 'message-attachments' AND owner = uid);

  -- Tableaux de membres (pas de FK possible sur un uuid[]).
  UPDATE public.message_groups SET members = array_remove(members, uid)
  WHERE uid = ANY(members);

  -- Tout le reste est DÉCLARATIF : les FK (75 CASCADE historiques + celles du
  -- 3A.1) suppriment la donnée de l'utilisateur et anonymisent ses références
  -- dans le contenu des autres. Aucune table à énumérer, y compris futures.
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
