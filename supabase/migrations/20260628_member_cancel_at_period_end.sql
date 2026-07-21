-- Track scheduled cancellation (Stripe `cancel_at_period_end`) at the member level.
-- A membership resiliated by the athlete stays `active` until the paid period ends;
-- without this flag the owner back-office can't tell an active row is being cancelled.
ALTER TABLE box_members
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false;
