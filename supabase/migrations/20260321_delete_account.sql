-- ============================================================
-- #43 — Suppression de compte
-- Fonction RPC appelable par l'utilisateur authentifié
-- Nettoie les tables sans ON DELETE CASCADE puis supprime auth.users
-- (profiles ON DELETE CASCADE → cascade les tables liées)
-- Exécuter dans Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── Tables sans ON DELETE CASCADE (SET NULL ou DELETE) ──────

  -- wod_scores: supprimer les scores de l'utilisateur
  DELETE FROM wod_scores WHERE member_id = uid;

  -- score_comments: supprimer les commentaires de l'utilisateur
  DELETE FROM score_comments WHERE author_id = uid;

  -- messages: supprimer les messages envoyés
  DELETE FROM messages WHERE sender_id = uid;

  -- message_reactions: supprimer les réactions
  DELETE FROM message_reactions WHERE member_id = uid;

  -- message_replies: supprimer les réponses
  DELETE FROM message_replies WHERE sender_id = uid;

  -- message_groups: retirer le user des arrays members
  UPDATE message_groups SET members = array_remove(members, uid)
  WHERE uid = ANY(members);

  -- event_registrations: supprimer les inscriptions
  DELETE FROM event_registrations WHERE member_id = uid;

  -- box_wods: nullifier le créateur (garder les WODs)
  UPDATE box_wods SET created_by = NULL WHERE created_by = uid;

  -- events: nullifier le créateur (garder les events)
  UPDATE events SET created_by = NULL WHERE created_by = uid;

  -- message_groups: nullifier le créateur
  UPDATE message_groups SET created_by = NULL WHERE created_by = uid;

  -- daily_tournament_participants
  DELETE FROM daily_tournament_participants WHERE user_id = uid;

  -- daily_tournament_scores
  DELETE FROM daily_tournament_scores WHERE user_id = uid;

  -- tournament_scores
  DELETE FROM tournament_scores WHERE athlete_id = uid;

  -- push_tokens
  DELETE FROM push_tokens WHERE user_id = uid;

  -- ── Supprimer le compte auth (cascade → profiles → reste) ──
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Autoriser les utilisateurs authentifiés à appeler cette fonction
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
