-- Lot 5-E : `anon` ne détient plus aucun grant d'écriture sur `public`.
--
-- Ce que la mesure dit, et qui change la nature du correctif : les 101 tables
-- où `anon` détient INSERT/UPDATE/DELETE/TRUNCATE ne sont pas un résidu posé à
-- la main, c'est la **règle**. `pg_default_acl` accorde, pour les créateurs
-- `postgres` *et* `supabase_admin` dans le schéma public, l'ensemble des
-- privilèges d'écriture à `anon` et `authenticated` sur toute table neuve. Les
-- 21 tables déjà fermées l'ont été une par une, au fil des lots (box_wods en
-- 5-C, profiles, program_members, box_cash_payments…) — et la table créée par
-- la migration suivante renaissait ouverte.
--
-- Donc une révocation seule serait un instantané : le prochain CREATE TABLE
-- l'annulerait. Cette migration fait les deux, dans cet ordre :
--   1. révoquer l'existant (aujourd'hui) ;
--   2. refermer les privilèges par défaut (demain).
-- C'est la forme que le lot 4 avait déjà imposée aux fonctions (R3/D1) : une
-- convention qu'on relit s'oublie, un défaut fermé ne s'oublie pas.
--
-- Ce que ce lot n'est pas : une faille ouverte. Toutes les policies d'écriture
-- atteignables par `anon` délèguent à des helpers `SECURITY DEFINER` bâtis sur
-- `auth.uid()`, et rendent donc faux sans session ; PostgREST n'émet jamais de
-- TRUNCATE. Le risque était **latent**. Ce que la révocation change est la
-- forme du refus : « permission denied for table » au lieu d'un filtrage RLS
-- silencieux, nommé une étape plus tôt — exactement ce qui s'est produit sur
-- `box_wods` en 5-C.
--
-- Mesures qui bornent le geste (constatées, pas supposées) :
--   * aucun grant de *colonne* d'écriture n'existe (`pg_attribute.attacl`
--     n'expose que des SELECT) : un REVOKE de table suffit. Le contraire était
--     le piège du lot 0-bis, où un REVOKE de table laissait vivre un grant de
--     colonne ;
--   * aucune colonne `serial`/`identity` dans public, et zéro séquence : le
--     retrait de l'UPDATE de séquence à `anon` ne casse aucun INSERT ;
--   * `anon` et `authenticated` n'ont pas CREATE sur le schéma public, donc
--     TRIGGER et REFERENCES leur sont inutilisables — ils partent quand même,
--     un grant sans usage est un grant qu'on ne relit plus.
--
-- Liste blanche : vide. Aucun chemin produit ne demande à `anon` d'écrire dans
-- une table — les achats publics et l'inscription passent par des routes
-- `service_role` ou des RPC `SECURITY DEFINER`. Elle est écrite quand même,
-- pour que l'exception future ait un endroit unique et visible où s'inscrire.

-- Ce que la première rédaction de cette migration ne bouclait pas, et qui était
-- le vrai défaut : les **vues**. Une vue de `public` est servie par PostgREST
-- comme une table, mais sans `security_invoker` elle s'exécute avec les droits
-- de son propriétaire — la RLS de la table sous-jacente n'est jamais évaluée.
-- Trois des quatre vues de `public` sont dans ce cas, et l'une d'elles porte
-- des triggers `INSTEAD OF` : le geste anonyme y était **franchissable**, pas
-- latent (mesuré sur pile jetable, HTTP 201 puis 204, membre réellement ajouté
-- puis retiré d'un groupe dont anon n'administre rien). La boucle porte donc
-- sur r, p, v, m, f : ce qui est servi par l'API doit être énuméré par le lot.
DO $$
DECLARE
  -- Une exception se déclare ici, jamais en ligne de commande. Vide aujourd'hui.
  v_liste_blanche text[] := ARRAY[]::text[];
  v_table text;
  v_ferme int := 0;
BEGIN
  FOR v_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT (c.relname = ANY (v_liste_blanche))
    ORDER BY 1
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon',
      v_table);
    -- `authenticated` garde INSERT/UPDATE/DELETE : c'est la RLS qui décide, et
    -- elle a besoin du grant pour être évaluée. Ne partent que les privilèges
    -- qu'aucun chemin PostgREST n'emprunte.
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',
      v_table);
    v_ferme := v_ferme + 1;
  END LOOP;

  RAISE NOTICE 'Lot 5-E : grants d''écriture retirés sur % relation(s).', v_ferme;
END $$;

REVOKE UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ── Demain : ce qui naîtra fermé ─────────────────────────────────────────────
-- Sans ces deux lignes, la migration ci-dessus est datée du jour où elle passe.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE UPDATE ON SEQUENCES FROM anon;

-- `supabase_admin` porte le même défaut ouvert et appartient à la plateforme :
-- `postgres` n'en est pas membre, donc l'ALTER échoue par conception. On tente,
-- on nomme l'échec, et on ne fait pas échouer la migration pour un privilège
-- que nous ne détenons pas — c'est l'exception déjà documentée côté fonctions
-- (EXCEPTIONS_D1). Le garde-fou qui la rend inoffensive est ailleurs : aucune
-- table de `public` ne lui appartient (les 118 sont à `postgres`), et le
-- contrôle le vérifie à chaque exécution.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
       || 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
       || 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated';
  RAISE NOTICE 'Lot 5-E : défaut `supabase_admin` refermé.';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'Lot 5-E : défaut `supabase_admin` hors de portée (rôle de la '
    'plateforme) — couvert par le contrôle « aucune table de public ne lui appartient ».';
END $$;

-- ── La garde que la fermeture des grants a révélée ───────────────────────────
-- Fermer `anon` ne suffit pas ici, et c'est le point important du lot : la vue
-- `message_group_members` écrit dans `message_groups` par deux triggers
-- `INSTEAD OF` déclarés `SECURITY DEFINER` et **sans aucun contrôle
-- d'autorisation**. Le privilège d'exécution d'une fonction de trigger n'est
-- vérifié qu'à sa création, jamais à son déclenchement : quiconque détient
-- INSERT sur la vue franchit la RLS de la table. Mesuré sur pile jetable :
--   * à la clé anon                    → HTTP 201, membre ajouté
--   * au JWT d'un connecté étranger    → HTTP 201, membre ajouté
-- La règle de la table existe pourtant depuis le lot 0 : seuls le gérant et le
-- co-gérant administrent les groupes de leur box. Elle vit ici aussi, sinon la
-- révocation de `anon` déplacerait la porte au lieu de la fermer — le trou
-- resterait ouvert à tout compte inscrit, c'est-à-dire à l'essentiel du risque.
--
-- Et la garde dit `request_is_backend()`, pas `is_privileged_backend()` : dans
-- une fonction `SECURITY DEFINER` appartenant à `postgres`, `current_user` *est*
-- `postgres`, donc le second rend vrai pour tout appelant et la garde ne garde
-- rien. Mesuré : premier jet écrit avec lui, l'inconnu connecté repassait en
-- HTTP 201. `request_is_backend()` lit le rôle du JWT, que le changement
-- d'identité de la fonction ne touche pas. Les gardes des lots précédents
-- (provenance, PAID_ACCESS) sont `SECURITY INVOKER` : le piège ne les concerne
-- pas, et c'est pourquoi il n'était jamais apparu.
CREATE OR REPLACE FUNCTION public.fn_message_group_members_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_box_id uuid;
BEGIN
  SELECT box_id INTO v_box_id FROM message_groups WHERE id = NEW.group_id;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'GROUPE_INCONNU : aucun groupe % .', NEW.group_id;
  END IF;
  IF NOT (public.request_is_backend() OR public.is_box_owner_admin(v_box_id)) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du groupe requis.';
  END IF;

  UPDATE message_groups
  SET members = array_append(members, NEW.member_id)
  WHERE id = NEW.group_id
    AND NOT (NEW.member_id = ANY(members));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_message_group_members_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_box_id uuid;
BEGIN
  SELECT box_id INTO v_box_id FROM message_groups WHERE id = OLD.group_id;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'GROUPE_INCONNU : aucun groupe % .', OLD.group_id;
  END IF;
  IF NOT (public.request_is_backend() OR public.is_box_owner_admin(v_box_id)) THEN
    RAISE EXCEPTION 'Accès refusé : gérant ou co-gérant de la box du groupe requis.';
  END IF;

  UPDATE message_groups
  SET members = array_remove(members, OLD.member_id)
  WHERE id = OLD.group_id;
  RETURN OLD;
END;
$function$;

-- ── La fuite de lecture, du même angle mort ──────────────────────────────────
-- Les mêmes vues sans `security_invoker` servaient à la clé anon des données
-- que leurs tables refusent : la composition des groupes de messagerie
-- (group_id, member_id, box_id) et le volume de répétitions par athlète
-- (user_id, mouvement, reps). Mesuré en production, en lecture seule, HTTP 200
-- avec des lignes réelles. `public_leaderboard` reste ouverte : elle est
-- publique par destination (page /classement) et porte `security_invoker`,
-- donc elle n'emprunte aucun droit à son propriétaire.
REVOKE SELECT ON TABLE public.message_group_members FROM anon;
REVOKE SELECT ON TABLE public.movement_totals       FROM anon;
REVOKE SELECT ON TABLE public.inter_standings       FROM anon;
