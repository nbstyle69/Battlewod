-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: update_user_elo — SECURITY DEFINER to bypass RLS on profiles
-- Allows any authenticated user to update another user's ELO
-- (used after tournament/WOD completion)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_user_elo(
  p_user_id uuid,
  p_new_elo int,
  p_increment_matches int DEFAULT 1,
  p_increment_wins int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    elo           = p_new_elo,
    total_matches = total_matches + p_increment_matches,
    wins          = wins + p_increment_wins
  WHERE id = p_user_id;
END;
$$;
