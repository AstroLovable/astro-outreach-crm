
-- Normalize existing status values
UPDATE public.chat_sessions SET status = 'ai_handling' WHERE status = 'AI Handling';
UPDATE public.chat_sessions SET status = 'awaiting_human' WHERE status = 'Awaiting Human';
UPDATE public.chat_sessions SET status = 'human_active' WHERE status = 'Human Active';
UPDATE public.chat_sessions SET status = 'closed' WHERE status = 'Closed';

ALTER TABLE public.chat_sessions ALTER COLUMN status SET DEFAULT 'ai_handling';

-- Normalize existing role values
UPDATE public.chat_messages SET role = 'visitor' WHERE role = 'user';
