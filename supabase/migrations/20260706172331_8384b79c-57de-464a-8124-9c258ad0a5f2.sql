DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS chatbot_system_prompt,
  DROP COLUMN IF EXISTS notify_new_chat,
  DROP COLUMN IF EXISTS idle_close_hours,
  DROP COLUMN IF EXISTS greeting_delay_seconds,
  DROP COLUMN IF EXISTS notification_sound;