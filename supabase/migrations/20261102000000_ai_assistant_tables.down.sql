-- Відкат етапу 1 (видаляє ВСЮ історію розмов з асистентом!)
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP FUNCTION IF EXISTS public.ai_messages_check_owner() CASCADE;
DROP FUNCTION IF EXISTS public.ai_messages_touch_conversation() CASCADE;