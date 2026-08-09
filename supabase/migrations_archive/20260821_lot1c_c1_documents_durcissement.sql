-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1C-c1 — `documents` : durcissement écriture & suppression
-- ⚠️ SANS dépendance à la version de l'app → déployable IMMÉDIATEMENT.
--
-- POURQUOI CE DÉCOUPAGE : la livraison OTA du patch app s'est révélée
-- impossible (aucun `channel` configuré dans eas.json → les mises à jour
-- n'atteignent pas le binaire installé). Passer les buckets en privé
-- (migration 20260820, = lot 1C-c2) casserait l'affichage sur tous les
-- téléphones jusqu'au prochain build store. Mais la faille la PLUS grave de
-- ce périmètre ne dépend pas du tout de l'app : on la ferme tout de suite.
--
-- CE QUE ÇA CORRIGE (constaté en prod) :
--  • `delete_own_doc_objects` : prédicat = `auth.uid() IS NOT NULL`. Le nom
--    promet « own », le code ne le vérifie jamais → N'IMPORTE QUEL compte
--    connecté peut supprimer le PDF de N'IMPORTE QUELLE box. Destruction de
--    données par un tiers, aucune trace, aucune restauration possible.
--  • `auth_upload_documents` : même prédicat → on peut écrire dans le dossier
--    d'un autre utilisateur (usurpation de l'origine d'un document).
--
-- POURQUOI C'EST SANS RISQUE POUR L'APP ACTUELLE : la version en production
-- écrit déjà `<uid>/<ts>.pdf` (vérifié : `foldername[1] = owner` sur 100% des
-- objets existants) et ne supprime que les documents de l'utilisateur courant
-- (le bouton n'apparaît que pour ses propres fichiers). Les deux policies
-- ci-dessous décrivent donc EXACTEMENT ce que l'app fait déjà.
--
-- HORS PÉRIMÈTRE ICI (→ 20260820, après le build store) : bascule des buckets
-- en privé, lecture scopée, et durcissement de `message-attachments` (dont
-- l'écriture À PLAT par l'app actuelle serait cassée par une policy par groupe).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- Écriture : uniquement dans MON dossier.
DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_own"  ON storage.objects;

CREATE POLICY "documents_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Suppression : uniquement MES fichiers.
DROP POLICY IF EXISTS "delete_own_doc_objects" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_own"   ON storage.objects;

CREATE POLICY "documents_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (owner = auth.uid() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- NB : la lecture reste publique pour l'instant (`public_read_documents`
-- intacte) — c'est ce qui garantit qu'aucun téléphone ne casse. Elle sera
-- fermée par 20260820 le jour où l'app patchée est en production.

NOTIFY pgrst, 'reload schema';
