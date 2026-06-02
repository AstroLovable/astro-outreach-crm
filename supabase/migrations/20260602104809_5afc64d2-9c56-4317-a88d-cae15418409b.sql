-- Recreate pg_net in extensions schema (pg_net doesn't support SET SCHEMA)
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Re-schedule cron jobs with Authorization header
DO $$
DECLARE
  base_url text := 'https://project--88cc73b1-bb94-458c-9c48-3d009ebab63c.lovable.app';
  service_key text;
  hdrs jsonb;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF service_key IS NULL THEN
    RAISE NOTICE 'service_role_key not found in vault; cron jobs not rescheduled';
    RETURN;
  END IF;

  hdrs := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_key
  );

  PERFORM cron.unschedule(jobname) FROM cron.job
    WHERE jobname IN ('overdue-invoices-daily', 'close-idle-chats-hourly');

  PERFORM cron.schedule(
    'overdue-invoices-daily',
    '0 9 * * *',
    format($cron$select extensions.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) as request_id;$cron$,
      base_url || '/api/public/hooks/overdue-invoices', hdrs::text)
  );

  PERFORM cron.schedule(
    'close-idle-chats-hourly',
    '0 * * * *',
    format($cron$select extensions.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb) as request_id;$cron$,
      base_url || '/api/public/hooks/close-idle-chats', hdrs::text)
  );
END $$;