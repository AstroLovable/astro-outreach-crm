
-- Replace owner-scoped policies with single-tenant authenticated access
DROP POLICY IF EXISTS owner_read_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS owner_update_chat_sessions ON public.chat_sessions;
DROP POLICY IF EXISTS owner_read_chat_messages ON public.chat_messages;
DROP POLICY IF EXISTS owner_insert_chat_messages ON public.chat_messages;

CREATE POLICY auth_read_chat_sessions ON public.chat_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY auth_update_chat_sessions ON public.chat_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_read_chat_messages ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY auth_insert_chat_messages ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (true);
