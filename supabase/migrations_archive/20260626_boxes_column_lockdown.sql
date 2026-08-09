-- Security hardening (audit P1): stop exposing boxes.invite_code / stripe_account_id
-- to the anonymous key.
--
-- The public box directory (/box) and public box page (/box/[slug]) legitimately
-- read box rows anonymously, so the fix is column-level (like the profiles fix in
-- 20260624): revoke anon's table-wide SELECT and re-grant only the display columns.
-- `invite_code` (lets anyone join / share a private box code) and
-- `stripe_account_id` (connected-account id) are NOT re-granted to anon.
--
-- `authenticated` keeps full column access: the mobile join-by-code flow reads
-- invite_code and box owners read their Stripe account, both as authenticated.
--
-- DEPLOY ORDER: apply this only AFTER TheHub PR #187 (public /box/[slug] switched
-- from select('*') to an explicit display-column list) is in production, otherwise
-- that page fails with "permission denied for column invite_code".

BEGIN;

REVOKE SELECT ON public.boxes FROM anon;

GRANT SELECT (
  id,
  owner_id,
  name,
  description,
  logo_url,
  is_active,
  created_at,
  daily_publish_hour,
  weekly_publish_day,
  weekly_publish_hour,
  address,
  website_url,
  contact_email,
  phone,
  google_maps_url,
  founded_at,
  city,
  postal_code,
  country,
  latitude,
  longitude,
  sport_type,
  services,
  cover_url,
  instagram_url,
  is_listed,
  tagline,
  opening_hours,
  member_count,
  slug,
  stripe_onboarding_complete,
  allowed_tournament_formats
) ON public.boxes TO anon;

COMMIT;
