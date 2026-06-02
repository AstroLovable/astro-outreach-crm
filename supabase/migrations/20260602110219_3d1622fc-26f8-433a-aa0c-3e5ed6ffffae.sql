
-- 1. Generate dedicated cron secret in vault (idempotent)
DO $$
DECLARE v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'cron_secret', 'Dedicated secret for authenticating pg_cron HTTP hook calls');
  END IF;
END $$;

-- 2. Helper readable only by service_role (used by hook routes to verify caller)
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;

-- 3. Reschedule cron jobs to use dedicated secret
DO $$
DECLARE
  v_secret text;
  v_headers text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE NOTICE 'cron_secret missing — skipping reschedule';
    RETURN;
  END IF;

  v_headers := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  )::text;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'overdue-invoices-daily') THEN
    PERFORM cron.unschedule('overdue-invoices-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-idle-chats-hourly') THEN
    PERFORM cron.unschedule('close-idle-chats-hourly');
  END IF;

  PERFORM cron.schedule(
    'overdue-invoices-daily',
    '0 9 * * *',
    format(
      $f$SELECT extensions.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb)$f$,
      'https://project--88cc73b1-bb94-458c-9c48-3d009ebab63c.lovable.app/api/public/hooks/overdue-invoices',
      v_headers
    )
  );

  PERFORM cron.schedule(
    'close-idle-chats-hourly',
    '0 * * * *',
    format(
      $f$SELECT extensions.http_post(url:=%L, headers:=%L::jsonb, body:='{}'::jsonb)$f$,
      'https://project--88cc73b1-bb94-458c-9c48-3d009ebab63c.lovable.app/api/public/hooks/close-idle-chats',
      v_headers
    )
  );
END $$;
