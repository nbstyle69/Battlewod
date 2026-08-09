-- ═══════════════════════════════════════════════════════════════════════════
-- Security hardening of RLS policies
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. box_subscriptions: remove world-writable UPDATE policy ───────────────
-- The previous "service_role_update_subscription" policy used
--   FOR UPDATE USING (true) WITH CHECK (true)
-- with NO `TO service_role` clause, so it applied to every role (anon /
-- authenticated). Any user could therefore UPDATE any subscription row
-- (e.g. set status = 'active' or extend trial_ends_at) => payment bypass.
--
-- Subscription rows are only ever UPDATEd by the Stripe webhook Edge Function,
-- which uses the service_role key and bypasses RLS entirely. No client code
-- path updates box_subscriptions (clients only SELECT / INSERT). Dropping the
-- policy therefore denies UPDATE to anon/authenticated while keeping the
-- webhook fully functional.
DROP POLICY IF EXISTS "service_role_update_subscription" ON box_subscriptions;

-- ── 2. profiles: stop anonymous PII / email harvesting ─────────────────────
-- The "Public profiles are viewable by everyone" policy used USING (true),
-- which exposed every profile row — including the `email` column — to anyone
-- holding the public anon key, even without being logged in. Restrict reads to
-- authenticated users so logged-out clients can no longer scrape the table.
--
-- NOTE (follow-up): RLS is row-level only and cannot hide the `email` column
-- from other authenticated users. The complete fix is to expose cross-user
-- profile data through a column-filtered view (without `email`) or move `email`
-- out of the broadly-readable table. This migration closes the anonymous
-- access vector; the column-level work requires client query changes.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';
