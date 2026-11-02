-- Тест RLS етапу 1. Запускати ПІСЛЯ міграції.
-- Локально потрібна імітація Supabase (auth.users, auth.uid(), ролі) - див. README.
-- У реальному Supabase цей тест НЕ запускайте на продакшн-даних:
-- він створює тимчасових користувачів і прибирає за собою у ROLLBACK.
\set ON_ERROR_STOP off
-- Очікувані помилки не повинні обривати транзакцію:
\set ON_ERROR_ROLLBACK on
BEGIN;

INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');

-- Дані пише service_role (як Edge Function)
SET LOCAL ROLE service_role;
INSERT INTO ai_conversations(id, user_id, title) VALUES
  ('c1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Розмова A'),
  ('c2000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Розмова B');
INSERT INTO ai_messages(conversation_id,user_id,role,content) VALUES
  ('c1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','user','Які ліки я приймаю?'),
  ('c2000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','user','секрет B');
RESET ROLE;

-- ===== Користувач A =====
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- T1: A бачить лише свої розмови (очікується 1)'
SELECT count(*) FROM ai_conversations;
\echo '--- T2: A бачить лише свої повідомлення (очікується 1, без "секрет B")'
SELECT content FROM ai_messages;

\echo '--- T3: A НЕ може вставити розмову (очікується permission denied)'
INSERT INTO ai_conversations(user_id,title) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','x');
\echo '--- T4: A НЕ може підробити повідомлення асистента (очікується permission denied)'
INSERT INTO ai_messages(conversation_id,user_id,role,content)
  VALUES ('c1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','assistant','підробка');
\echo '--- T5: A НЕ може редагувати повідомлення (очікується permission denied)'
UPDATE ai_messages SET content='змінено';

\echo '--- T6: A намагається видалити розмову B (очікується DELETE 0)'
DELETE FROM ai_conversations WHERE id='c2000000-0000-0000-0000-000000000002';

\echo '--- T7: A видаляє власну розмову (очікується DELETE 1) + каскад повідомлень'
DELETE FROM ai_conversations WHERE id='c1000000-0000-0000-0000-000000000001';
RESET ROLE;

\echo '--- T8: повідомлення A зникли каскадом, повідомлення B лишились (очікується 1)'
SELECT count(*) FROM ai_messages;

-- ===== anon =====
SET LOCAL ROLE anon;
\echo '--- T9: anon не має доступу (очікується permission denied)'
SELECT count(*) FROM ai_conversations;
RESET ROLE;

-- ===== тригери =====
SET LOCAL ROLE service_role;
\echo '--- T10: user_id повідомлення має збігатися з власником розмови (очікується exception)'
INSERT INTO ai_messages(conversation_id,user_id,role,content)
  VALUES ('c2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','user','чужа розмова');

\echo '--- T11: нове повідомлення оновлює updated_at розмови (очікується t)'
-- now() не змінюється в межах транзакції, тому спершу ставимо дату в минуле
UPDATE ai_conversations SET updated_at = '2000-01-01' WHERE id='c2000000-0000-0000-0000-000000000002';
INSERT INTO ai_messages(conversation_id,user_id,role,content)
  VALUES ('c2000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','assistant','відповідь');
SELECT updated_at > '2000-01-01' AS touched FROM ai_conversations WHERE id='c2000000-0000-0000-0000-000000000002';

\echo '--- T12: порожній і задовгий content відхиляються (очікується 2 помилки CHECK)'
INSERT INTO ai_messages(conversation_id,user_id,role,content)
  VALUES ('c2000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','user','');
INSERT INTO ai_messages(conversation_id,user_id,role,content)
  VALUES ('c2000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','user',repeat('a',8001));
RESET ROLE;

ROLLBACK;