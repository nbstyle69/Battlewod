-- Messagerie de groupe : l'expéditeur disparaît, le message reste.
--
-- group_messages.sender_id n'avait aucune clé étrangère : delete_user_account
-- laissait des messages orphelins (24 lors de la purge du 4 septembre,
-- supprimés à la main). Désormais la colonne référence profiles en
-- ON DELETE SET NULL ; l'écran affiche « Compte supprimé » pour un
-- expéditeur NULL. Les politiques RLS d'insertion exigent toujours
-- sender_id = auth.uid() : un client ne peut pas écrire NULL.

BEGIN;

-- Orphelins éventuels avant la pose de la clé (aucun attendu ; on ne casse pas
-- la transaction sur un cas hypothétique, on anonymise comme le fera la clé).
UPDATE public.group_messages gm
SET sender_id = NULL
WHERE sender_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = gm.sender_id);

ALTER TABLE public.group_messages
  ALTER COLUMN sender_id DROP NOT NULL,
  ADD CONSTRAINT group_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
DECLARE v_type "char";
BEGIN
  SELECT confdeltype INTO v_type
  FROM pg_constraint WHERE conname = 'group_messages_sender_id_fkey';
  IF v_type IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'GROUP_MESSAGES_FK : confdeltype = %, attendu n', v_type;
  END IF;
END $$;

COMMIT;
