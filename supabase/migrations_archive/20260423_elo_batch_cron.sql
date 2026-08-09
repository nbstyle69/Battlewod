-- ─────────────────────────────────────────────────────────────
-- Daily cron for compute-elo-batch edge function
--
-- Runs every day at 03:00 UTC and computes ELO for all expired
-- WODs that don't have elo_history rows yet. Requires the
-- pg_cron and pg_net extensions (already enabled on Supabase).
--
-- IMPORTANT: set the two GUCs below with your project URL and
-- service-role key before this migration can schedule the job.
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'elo_cron_service_key');
-- Then reference it in the http request headers.
--
-- If you prefer, you can invoke the function manually on demand:
--   SELECT net.http_post(
--     url := 'https://<project>.supabase.co/functions/v1/compute-elo-batch',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{"all": true}'::jsonb
--   );
-- ─────────────────────────────────────────────────────────────

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule previous job (if exists) to keep this migration idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('compute_elo_batch_daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute_elo_batch_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- NOTE:
-- Uncomment and fill in your project URL + service role key token
-- to enable the automatic daily run. The project URL is available in
-- the Supabase dashboard (Settings → API).
--
-- SELECT cron.schedule(
--   'compute_elo_batch_daily',
--   '0 3 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/compute-elo-batch',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
--       'Content-Type', 'application/json'
--     ),
--     body := '{"all": true}'::jsonb
--   );
--   $$
-- );
