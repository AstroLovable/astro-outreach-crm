
-- Clients: follow-up + quick status note
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_note text;

-- Settings: idle close, greeting delay, sound, office hours
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS idle_close_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS greeting_delay_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS notification_sound boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS office_hours_start text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS office_hours_end text NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS office_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS office_timezone text NOT NULL DEFAULT 'Europe/London';

-- Chat sessions: snapshot system prompt + unread visitor messages
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

-- Invoices: deposit splits
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS job_reference text,
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_part text;

-- Allow owners to delete their sessions; cascade messages
DROP POLICY IF EXISTS auth_delete_chat_sessions ON public.chat_sessions;
CREATE POLICY auth_delete_chat_sessions
  ON public.chat_sessions FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS auth_delete_chat_messages ON public.chat_messages;
CREATE POLICY auth_delete_chat_messages
  ON public.chat_messages FOR DELETE TO authenticated
  USING (true);

-- Add FK with cascade if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chat_messages_session_id_fkey'
      AND table_name = 'chat_messages'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Enable realtime
ALTER TABLE public.chat_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.clients REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;
