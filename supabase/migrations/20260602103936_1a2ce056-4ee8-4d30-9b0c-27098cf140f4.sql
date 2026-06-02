
-- Tighten chat_sessions RLS: scope to owner_id (currently any authenticated user can read/update/delete any session)
DROP POLICY IF EXISTS auth_read_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS auth_update_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS auth_delete_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS owner_read_chat_sessions ON public.chat_sessions;

CREATE POLICY owner_read_chat_sessions ON public.chat_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY owner_update_chat_sessions ON public.chat_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY owner_delete_chat_sessions ON public.chat_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Tighten chat_messages RLS: scope by parent session ownership
DROP POLICY IF EXISTS auth_read_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS auth_insert_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS auth_delete_chat_messages ON public.chat_messages;

CREATE POLICY owner_read_chat_messages ON public.chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id AND s.owner_id = auth.uid()
  ));

CREATE POLICY owner_insert_chat_messages ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id AND s.owner_id = auth.uid()
  ));

CREATE POLICY owner_delete_chat_messages ON public.chat_messages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id AND s.owner_id = auth.uid()
  ));

-- Add visitor_secret to chat_sessions to prevent IDOR on send/poll/contact actions
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS visitor_secret text;
