-- Security hardening (audit P0): tighten public RLS on profiles / messages / message_groups.
--
-- Findings:
--   * profiles: 3 duplicate `SELECT USING(true)` policies + broad anon column grant
--     exposed `email` / `referral_code` / `referred_by` (PII) to the anon key.
--   * messages: `messages_read USING(true)` + `messages_insert WITH CHECK(true)`
--     neutralised the scoped `box_general_messages` / `send_message` policies
--     (any client could read every private message and forge sender_id).
--   * message_groups: `mg_write ALL USING(true)` + `mg_select USING(true)`
--     neutralised the owner/co-owner/member policies.
--
-- Design notes:
--   * Public *row* read of profiles is intentional (global / WOD-du-jour / inter-box
--     rankings show usernames, avatars, elo of non box-mates). We keep ONE public
--     SELECT policy but restrict which COLUMNS the anon key may read.
--   * `authenticated` keeps full column access: AuthContext reads its own profile
--     (incl. email) and box owners legitimately read their members' emails in the
--     back-office. Hardening authenticated email access requires app changes and is
--     tracked as a follow-up.
--   * A dedicated `public_leaderboard` view is provided as an explicit, leak-proof
--     public read surface (never exposes email/PII, regardless of table grants).

BEGIN;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- Drop the two redundant permissive SELECT policies; keep `public_read_profiles`.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;

-- Close PII columns to the anonymous key while preserving the display columns
-- required by public rankings / directory embeds.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  username,
  avatar_url,
  level,
  role,
  elo,
  total_matches,
  wins,
  losses,
  created_at,
  full_name,
  bio,
  personal_records,
  gender,
  total_scores_submitted,
  total_wods_generated,
  total_timer_sessions,
  total_messages_sent,
  total_tournaments,
  total_tournament_wins,
  total_friends,
  featured_badges
) ON public.profiles TO anon;

-- Explicit, leak-proof public leaderboard surface (display columns only).
CREATE OR REPLACE VIEW public.public_leaderboard
WITH (security_invoker = true) AS
SELECT
  id,
  username,
  avatar_url,
  level,
  elo,
  role,
  wins,
  losses,
  total_matches
FROM public.profiles
WHERE role = 'member';

GRANT SELECT ON public.public_leaderboard TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

-- Remove the catch-all policies; the scoped `box_general_messages` (SELECT) and
-- `send_message` (INSERT WITH CHECK sender_id = auth.uid()) policies remain.
DROP POLICY IF EXISTS messages_read ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;

-- ---------------------------------------------------------------------------
-- message_groups
-- ---------------------------------------------------------------------------

-- Remove the catch-all policies; owner_manage_groups / message_groups_coowner_manage
-- (ALL) and member_see_own_groups (SELECT) remain.
DROP POLICY IF EXISTS mg_write ON public.message_groups;
DROP POLICY IF EXISTS mg_select ON public.message_groups;

COMMIT;
