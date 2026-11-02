-- =========================================================
-- ЕТАП 1: Таблиці для AI-асистента MediTracker
--   ai_conversations  - розмови користувача
--   ai_messages       - повідомлення розмови
--
-- Модель доступу:
--   * Клієнт (authenticated): тільки SELECT і DELETE своїх рядків.
--   * Запис повідомлень робить ЛИШЕ Edge Function (service_role),
--     яка бере user_id з перевіреного JWT. Так користувач не може
--     підробити "відповідь асистента", яка потім потрапила б в
--     контекст моделі (захист від prompt injection через історію).
--   * Медичні таблиці (medications, dose_logs) цей скрипт НЕ чіпає.
--
-- Скрипт ідемпотентний: можна запускати повторно.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ТАБЛИЦІ
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT CHECK (title IS NULL OR char_length(title) <= 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  -- user_id дублюємо навмисно: RLS без JOIN працює швидше і простіше
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  -- Для аудиту: які інструменти викликала модель (назва + аргументи).
  -- РЕЗУЛЬТАТИ інструментів не зберігаємо, щоб не дублювати медичні дані.
  tool_calls       JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------
-- 2. ІНДЕКСИ
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON public.ai_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON public.ai_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_messages_user
  ON public.ai_messages (user_id);

-- ---------------------------------------------------------
-- 3. ТРИГЕРИ
-- ---------------------------------------------------------

-- Узгодженість: user_id повідомлення має збігатися з власником розмови.
-- (Захищає навіть від помилки в коді Edge Function.)
CREATE OR REPLACE FUNCTION public.ai_messages_check_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = NEW.conversation_id AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'ai_messages.user_id не збігається з власником розмови';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_messages_check_owner ON public.ai_messages;
CREATE TRIGGER trg_ai_messages_check_owner
  BEFORE INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.ai_messages_check_owner();

-- Нове повідомлення "піднімає" розмову вгору списку.
CREATE OR REPLACE FUNCTION public.ai_messages_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_conversations
     SET updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_messages_touch_conversation ON public.ai_messages;
CREATE TRIGGER trg_ai_messages_touch_conversation
  AFTER INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.ai_messages_touch_conversation();

-- ---------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_conversations_select" ON public.ai_conversations;
CREATE POLICY "ai_conversations_select"
  ON public.ai_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_conversations_delete" ON public.ai_conversations;
CREATE POLICY "ai_conversations_delete"
  ON public.ai_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_messages_select" ON public.ai_messages;
CREATE POLICY "ai_messages_select"
  ON public.ai_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_messages_delete" ON public.ai_messages;
CREATE POLICY "ai_messages_delete"
  ON public.ai_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT / UPDATE політик для authenticated немає навмисно:
-- без політики RLS забороняє операцію. service_role обходить RLS.

-- ---------------------------------------------------------
-- 5. ПРИВІЛЕЇ (defence in depth поверх RLS)
-- ---------------------------------------------------------

REVOKE ALL ON public.ai_conversations FROM anon, authenticated;
REVOKE ALL ON public.ai_messages      FROM anon, authenticated;

GRANT SELECT, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, DELETE ON public.ai_messages      TO authenticated;

GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages      TO service_role;