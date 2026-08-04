-- ═══════════════════════════════════════════════════════════════════════════
-- ⛔ NE PAS APPLIQUER TANT QUE L'APP PATCHÉE N'EST PAS EN PRODUCTION.
-- Cette migration = LOT 1C-c2. Elle rend les buckets privés : toute app qui
-- ne sait pas signer les URLs (donc toute version antérieure au patch
-- storageUrl) cesse d'afficher les PDF et les pièces jointes.
-- La livraison OTA s'est révélée impossible (aucun `channel` configuré dans
-- eas.json) → il faut un build store. En attendant, seule la migration
-- 20260821_lot1c_c1_documents_durcissement.sql est déployable : elle ferme la
-- faille de suppression SANS aucune dépendance à la version de l'app.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1C-c — Buckets `documents` & `message-attachments` PRIVÉS + accès scopé
-- Basé sur le DUMP RÉEL de prod (reconnaissance 1C-c + complément policies).
--
-- ÉTAT AVANT (constaté, pas supposé) :
--  • Les 2 buckets sont `public = true` → tout PDF de box et toute photo de
--    conversation est lisible par QUICONQUE possède l'URL, sans compte.
--  • SELECT : `public_read_documents` / `public_read_attachments`, rôle {public},
--    aucun filtre → dump intégral des 2 buckets.
--  • INSERT : `auth_upload_documents` / `auth_upload_attachments` =
--    `auth.uid() IS NOT NULL`, SANS contrainte de chemin → n'importe quel
--    compte écrit dans le dossier de n'importe qui.
--  • DELETE `documents` : `delete_own_doc_objects` = `auth.uid() IS NOT NULL`
--    → n'importe quel compte connecté SUPPRIME le PDF de n'importe quelle box.
--    (« own » dans le nom, pas dans le prédicat.)
--  • DELETE `message-attachments` : aucune policy → rien n'est nettoyable.
--  • Aucune policy fourre-tout sur storage.objects (vérifié : 0 ligne sans
--    filtre `bucket_id`) → pas de risque de contournement en OR comme au 1A.
--
-- FORME DES CHEMINS (constatée) :
--  • documents           : `<uid>/<ts>.pdf`, et `foldername[1] = owner` sur
--                          100% des objets → contrainte d'écriture applicable
--                          sans reprise de données. Chemin INCHANGÉ par ce lot.
--  • message-attachments : chemins PLATS (1 seul objet, référencé par
--                          `messages`, affiché nulle part dans l'app). L'app
--                          patchée écrit désormais `<group_id>/<uid>_<ts>.<ext>`
--                          → la lecture peut être réservée aux membres du groupe.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT OBLIGATOIRE : le patch app (URLs signées) doit être
--    livré et vérifié AVANT cette migration. Les URLs signées fonctionnent
--    aussi sur un bucket public → aucune coupure. L'inverse casse l'affichage
--    des PDF et des pièces jointes sur tous les téléphones non mis à jour.
--    Voir RUNBOOK_lot1c_c.md.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1C-c.1 — Bascule des 2 buckets en PRIVÉ
-- À partir d'ici, `/object/public/...` renvoie 400 : seule une URL signée
-- (createSignedUrl, qui vérifie la RLS ci-dessous) donne accès au fichier.
-- ─────────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false
WHERE id IN ('documents', 'message-attachments');

-- ─────────────────────────────────────────────────────────────
-- 1C-c.1bis — Helpers SECURITY DEFINER
-- Une policy sur storage.objects s'exécute avec le rôle appelant : une
-- sous-requête vers `box_documents` / `boxes` y subirait LEUR PROPRE RLS.
-- Cas concret : un owner « primaire » (sans ligne box_members) ne voit pas la
-- ligne box_documents → il perdrait l'accès aux PDF de sa propre box. On isole
-- donc la décision dans des fonctions definer, comme get_user_box_ids() &
-- is_box_admin() ailleurs dans le schéma.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_read_document_object(p_name text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.box_documents d
    LEFT JOIN public.boxes b ON b.id = d.box_id
    WHERE d.file_url LIKE '%' || p_name          -- chemin nu OU URL publique historique
      AND (
        d.uploaded_by = auth.uid()               -- mon document
        OR b.owner_id = auth.uid()               -- owner de la box (même sans box_members)
        OR d.box_id IN (                          -- membre actif de la box
          SELECT bm.box_id FROM public.box_members bm
          WHERE bm.member_id = auth.uid() AND bm.status = 'active'
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_document_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_document_object(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_message_group_member(p_group text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT p_group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.message_groups g
    WHERE g.id::text = p_group
      AND g.members::text[] @> ARRAY[auth.uid()::text]
  );
$$;
REVOKE ALL ON FUNCTION public.is_message_group_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_message_group_member(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 1C-c.2 — `documents` : lecture réservée à la portée réelle du document
-- La portée n'est PAS dans le chemin (`<uid>/<ts>.pdf`) mais dans la ligne
-- `box_documents` qui référence l'objet : on lit donc l'autorisation là où
-- elle est vraie. La table est minuscule et indexée par box/uploader.
-- `file_url` contient soit le chemin nu (nouveaux écrits), soit l'URL publique
-- historique se terminant par le chemin → `LIKE '%' || name` couvre les deux.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_documents"   ON storage.objects;
DROP POLICY IF EXISTS "documents_read_scoped"   ON storage.objects;

CREATE POLICY "documents_read_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      -- 1. Mes propres fichiers (couvre les documents personnels sans box).
      owner = auth.uid()
      OR (storage.foldername(name))[1] = auth.uid()::text
      -- 2. Document rattaché à une box dont je suis membre actif ou owner.
      OR public.can_read_document_object(name)
    )
  );

-- Écriture : uniquement dans MON dossier (avant : n'importe quel chemin).
DROP POLICY IF EXISTS "auth_upload_documents"    ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_own"     ON storage.objects;

CREATE POLICY "documents_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Suppression : uniquement MES fichiers (avant : tout compte connecté pouvait
-- supprimer le PDF de n'importe quelle box — c'était la faille la plus directe
-- de ce lot, indépendamment du caractère public du bucket).
DROP POLICY IF EXISTS "delete_own_doc_objects"   ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_own"     ON storage.objects;

CREATE POLICY "documents_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ─────────────────────────────────────────────────────────────
-- 1C-c.3 — `message-attachments` : lecture réservée aux membres du groupe
-- Le 1er segment du chemin porte le groupe (`<group_id>/<uid>_<ts>.<ext>`,
-- écrit par l'app patchée). `message_groups.members` est un tableau : on le
-- compare en text[] pour rester indépendant du type sous-jacent (uuid[]/text[]).
-- L'objet PLAT historique (1 seul, non affiché par l'app) reste accessible à
-- son propriétaire via la 1re branche — il n'est pas perdu, il n'est plus public.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_attachments"  ON storage.objects;
DROP POLICY IF EXISTS "attachments_read_group"   ON storage.objects;

CREATE POLICY "attachments_read_group" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND (
      owner = auth.uid()
      OR public.is_message_group_member((storage.foldername(name))[1])
    )
  );

-- Écriture : uniquement dans un groupe dont je suis membre (avant : n'importe
-- quel compte écrivait à plat dans le bucket, sans lien avec une conversation).
DROP POLICY IF EXISTS "auth_upload_attachments"     ON storage.objects;
DROP POLICY IF EXISTS "attachments_insert_member"   ON storage.objects;

CREATE POLICY "attachments_insert_member" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.is_message_group_member((storage.foldername(name))[1])
  );

-- Suppression : mes propres pièces jointes (n'existait pas → aucun ménage
-- possible côté client, y compris pour son propre envoi).
DROP POLICY IF EXISTS "attachments_delete_own" ON storage.objects;

CREATE POLICY "attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'message-attachments' AND owner = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- NON TRAITÉ ICI (assumé, documenté)
--  • Grants PostgREST larges sur storage.objects (anon a INSERT/UPDATE/DELETE) :
--    inoffensifs tant qu'aucune policy n'autorise `anon` (vérifié : toutes les
--    policies INSERT exigent un utilisateur authentifié). Toucher aux grants du
--    schéma `storage` ferait courir un risque au service Storage lui-même pour
--    un gain nul → hors périmètre, à revoir seulement si une policy anon apparaît.
--  • Les 9 autres buckets restent publics : logos, bannières, avatars, images de
--    programmes, assets — contenus destinés à l'affichage public. Inchangés.
--  • `messages.attachment_url` (1 ligne) n'est affiché nulle part dans l'app ni
--    dans TheHub ; l'objet correspondant devient privé, lisible par son
--    propriétaire uniquement.
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
