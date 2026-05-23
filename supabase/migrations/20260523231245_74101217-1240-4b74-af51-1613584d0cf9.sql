-- Tighten chat_messages SELECT to owner of the session
DROP POLICY IF EXISTS owner_read_chat_messages ON public.chat_messages;
CREATE POLICY owner_read_chat_messages
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id
      AND s.owner_id = auth.uid()
  )
);

-- Tighten chat_sessions SELECT/UPDATE to authenticated owner only
DROP POLICY IF EXISTS owner_read_chat_sessions ON public.chat_sessions;
CREATE POLICY owner_read_chat_sessions
ON public.chat_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS owner_update_chat_sessions ON public.chat_sessions;
CREATE POLICY owner_update_chat_sessions
ON public.chat_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);