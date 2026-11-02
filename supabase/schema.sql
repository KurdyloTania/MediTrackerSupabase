
-- -- =========================================================
-- -- CLEAN RESET
-- -- =========================================================

-- DROP TABLE IF EXISTS dose_logs CASCADE;
-- DROP TABLE IF EXISTS medications CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;

-- DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
-- DROP FUNCTION IF EXISTS handle_new_user CASCADE;
-- DROP FUNCTION IF EXISTS decrement_stock CASCADE;

-- -- =========================================================
-- -- EXTENSIONS
-- -- =========================================================

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -- =========================================================
-- -- PROFILES
-- -- =========================================================

-- CREATE TABLE profiles (
--   id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
--   full_name TEXT,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );

-- -- =========================================================
-- -- MEDICATIONS
-- -- =========================================================

-- CREATE TABLE medications (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

--   user_id UUID NOT NULL
--     REFERENCES auth.users(id)
--     ON DELETE CASCADE,

--   name TEXT NOT NULL,

--   dosage TEXT,

--   frequency JSONB NOT NULL,

--   start_date DATE NOT NULL,

--   end_date DATE,

--   notes TEXT,

--   reminder_enabled BOOLEAN DEFAULT true,

--   meal_timing TEXT NOT NULL DEFAULT 'any_time'
--     CHECK (
--       meal_timing IN (
--         'before_meal',
--         'after_meal',
--         'with_meal',
--         'on_empty_stomach',
--         'any_time'
--       )
--     ),

--   -- STOCK TRACKING
--   stock_quantity NUMERIC DEFAULT NULL,

--   stock_unit TEXT DEFAULT NULL,

--   dose_per_intake NUMERIC(10,2) DEFAULT NULL,

--   created_at TIMESTAMPTZ DEFAULT now(),

--   updated_at TIMESTAMPTZ DEFAULT now()
-- );

-- -- =========================================================
-- -- DOSE LOGS
-- -- =========================================================

-- CREATE TABLE dose_logs (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

--   medication_id UUID NOT NULL
--     REFERENCES medications(id)
--     ON DELETE CASCADE,

--   scheduled_time TIMESTAMPTZ NOT NULL,

--   taken_at TIMESTAMPTZ,

--   status TEXT NOT NULL DEFAULT 'pending'
--     CHECK (status IN ('taken', 'missed', 'pending')),

--   edit_mark TEXT DEFAULT NULL
--     CHECK (edit_mark IN ('auto', 'manual') OR edit_mark IS NULL),

--   created_at TIMESTAMPTZ DEFAULT now(),

--   updated_at TIMESTAMPTZ DEFAULT now()
-- );

-- -- =========================================================
-- -- INDEXES
-- -- =========================================================

-- CREATE INDEX idx_medications_user ON medications(user_id);
-- CREATE INDEX idx_medications_stock ON medications(user_id, stock_quantity);
-- CREATE INDEX idx_dose_logs_medication ON dose_logs(medication_id);
-- CREATE INDEX idx_dose_logs_med_time_status ON dose_logs(medication_id, scheduled_time, status);

-- -- =========================================================
-- -- UNIQUE CONSTRAINT (без IF NOT EXISTS)
-- -- =========================================================


-- DO $$ 
-- BEGIN
--   BEGIN
--     ALTER TABLE dose_logs DROP CONSTRAINT dose_logs_medication_scheduled_unique;
--   EXCEPTION
--     WHEN undefined_object THEN
--       NULL;
--   END;
-- END $$;


-- ALTER TABLE dose_logs
--   ADD CONSTRAINT dose_logs_medication_scheduled_unique
--   UNIQUE (medication_id, scheduled_time);

-- -- =========================================================
-- -- RLS
-- -- =========================================================

-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;

-- -- =========================================================
-- -- PROFILE POLICIES
-- -- =========================================================

-- CREATE POLICY "profiles_select"
-- ON profiles FOR SELECT
-- USING (auth.uid() = id);

-- CREATE POLICY "profiles_insert"
-- ON profiles FOR INSERT
-- WITH CHECK (auth.uid() = id);

-- CREATE POLICY "profiles_update"
-- ON profiles FOR UPDATE
-- USING (auth.uid() = id);

-- -- =========================================================
-- -- MEDICATION POLICIES
-- -- =========================================================

-- CREATE POLICY "medications_select"
-- ON medications FOR SELECT
-- USING (auth.uid() = user_id);

-- CREATE POLICY "medications_insert"
-- ON medications FOR INSERT
-- WITH CHECK (auth.uid() = user_id);

-- CREATE POLICY "medications_update"
-- ON medications FOR UPDATE
-- USING (auth.uid() = user_id);

-- CREATE POLICY "medications_delete"
-- ON medications FOR DELETE
-- USING (auth.uid() = user_id);

-- -- =========================================================
-- -- DOSE LOGS POLICIES
-- -- =========================================================

-- CREATE POLICY "dose_logs_select"
-- ON dose_logs FOR SELECT
-- USING (
--   EXISTS (
--     SELECT 1 FROM medications
--     WHERE medications.id = dose_logs.medication_id
--     AND medications.user_id = auth.uid()
--   )
-- );

-- CREATE POLICY "dose_logs_insert"
-- ON dose_logs FOR INSERT
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM medications
--     WHERE medications.id = dose_logs.medication_id
--     AND medications.user_id = auth.uid()
--   )
-- );

-- CREATE POLICY "dose_logs_update"
-- ON dose_logs FOR UPDATE
-- USING (
--   EXISTS (
--     SELECT 1 FROM medications
--     WHERE medications.id = dose_logs.medication_id
--     AND medications.user_id = auth.uid()
--   )
-- );

-- -- =========================================================
-- -- UPDATED_AT TRIGGER FOR MEDICATIONS
-- -- =========================================================

-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS trigger_update_medications_updated_at ON medications;
-- CREATE TRIGGER trigger_update_medications_updated_at
--   BEFORE UPDATE ON medications
--   FOR EACH ROW
--   EXECUTE FUNCTION update_updated_at_column();

-- -- =========================================================
-- -- UPDATED_AT TRIGGER FOR DOSE LOGS
-- -- =========================================================

-- DROP TRIGGER IF EXISTS trigger_update_dose_logs_updated_at ON dose_logs;
-- CREATE TRIGGER trigger_update_dose_logs_updated_at
--   BEFORE UPDATE ON dose_logs
--   FOR EACH ROW
--   EXECUTE FUNCTION update_updated_at_column();

-- -- =========================================================
-- -- AUTO PROFILE CREATION
-- -- =========================================================

-- CREATE OR REPLACE FUNCTION handle_new_user()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   INSERT INTO profiles (id, full_name)
--   VALUES (
--     NEW.id,
--     NEW.raw_user_meta_data->>'full_name'
--   );
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION handle_new_user();

-- -- =========================================================
-- -- DECREMENT STOCK FUNCTION
-- -- =========================================================

-- CREATE OR REPLACE FUNCTION decrement_stock(
--   p_medication_id UUID,
--   p_amount NUMERIC
-- )
-- RETURNS VOID AS $$
-- BEGIN
--   UPDATE medications
--   SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_amount)
--   WHERE id = p_medication_id;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- =========================================================
-- -- VERIFICATION QUERIES
-- -- =========================================================

-- -- Перевірка структури dose_logs
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'dose_logs'
-- ORDER BY ordinal_position;

-- -- Перевірка constraint-ів
-- SELECT 
--   constraint_name,
--   constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'dose_logs'
-- ORDER BY constraint_name;

-- -- Перевірка індексів
-- SELECT
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE tablename = 'dose_logs'
-- ORDER BY indexname;



-- -- =============================================
-- -- ВИПРАВЛЕННЯ РЕЄСТРАЦІЇ - ОДИН ПРОСТИЙ СПОСІБ
-- -- =============================================

-- -- 1. Видаляємо стару функцію та тригер
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS handle_new_user CASCADE;

-- -- 2. Створюємо нову, спрощену функцію
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   -- Просто вставляємо профіль з email як ім'ям, якщо full_name відсутнє
--   INSERT INTO public.profiles (id, full_name)
--   VALUES (
--     NEW.id,
--     COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
--   );
  
--   RETURN NEW;
-- END;
-- $$;

-- -- 3. Створюємо новий тригер
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION public.handle_new_user();

-- -- 4. Переконуємось що політика INSERT існує
-- DROP POLICY IF EXISTS "profiles_insert" ON profiles;
-- CREATE POLICY "profiles_insert" ON profiles
--   FOR INSERT 
--   WITH CHECK (auth.uid() = id);

-- -- 5. Додаємо політику для анонімних вставок (важливо!)
-- DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;
-- CREATE POLICY "Enable insert for authenticated users" ON profiles
--   FOR INSERT 
--   WITH CHECK (true);
















-- нова для звіту 
-- =========================================================
-- CLEAN RESET
-- =========================================================

DROP TABLE IF EXISTS dose_logs CASCADE;
DROP TABLE IF EXISTS medications CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS decrement_stock CASCADE;

-- =========================================================
-- EXTENSIONS
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- PROFILES
-- =========================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================
-- MEDICATIONS
-- =========================================================

CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  dosage TEXT,

  frequency JSONB NOT NULL,

  start_date DATE NOT NULL,

  end_date DATE,

  notes TEXT,

  reminder_enabled BOOLEAN DEFAULT true,

  meal_timing TEXT NOT NULL DEFAULT 'any_time'
    CHECK (
      meal_timing IN (
        'before_meal',
        'after_meal',
        'with_meal',
        'on_empty_stomach',
        'any_time'
      )
    ),

  -- STOCK TRACKING
  stock_quantity NUMERIC DEFAULT NULL,

  stock_unit TEXT DEFAULT NULL,

  dose_per_intake NUMERIC(10,2) DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================
-- DOSE LOGS
-- =========================================================

CREATE TABLE dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  medication_id UUID NOT NULL
    REFERENCES medications(id)
    ON DELETE CASCADE,

  scheduled_time TIMESTAMPTZ NOT NULL,

  taken_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('taken', 'missed', 'pending')),

  edit_mark TEXT DEFAULT NULL
    CHECK (edit_mark IN ('auto', 'manual') OR edit_mark IS NULL),

  created_at TIMESTAMPTZ DEFAULT now(),

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_medications_user ON medications(user_id);
CREATE INDEX idx_medications_stock ON medications(user_id, stock_quantity);
CREATE INDEX idx_dose_logs_medication ON dose_logs(medication_id);
CREATE INDEX idx_dose_logs_med_time_status ON dose_logs(medication_id, scheduled_time, status);

-- =========================================================
-- UNIQUE CONSTRAINT
-- =========================================================

DO $$ 
BEGIN
  BEGIN
    ALTER TABLE dose_logs DROP CONSTRAINT dose_logs_medication_scheduled_unique;
  EXCEPTION
    WHEN undefined_object THEN
      NULL;
  END;
END $$;

ALTER TABLE dose_logs
  ADD CONSTRAINT dose_logs_medication_scheduled_unique
  UNIQUE (medication_id, scheduled_time);

-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PROFILE POLICIES
-- =========================================================

-- Політика для SELECT
CREATE POLICY "profiles_select"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Політика для INSERT - дозволяє вставку для автентифікованих користувачів
CREATE POLICY "profiles_insert"
ON profiles FOR INSERT
WITH CHECK (true);

-- Політика для UPDATE
CREATE POLICY "profiles_update"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- =========================================================
-- MEDICATION POLICIES
-- =========================================================

CREATE POLICY "medications_select"
ON medications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "medications_insert"
ON medications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "medications_update"
ON medications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "medications_delete"
ON medications FOR DELETE
USING (auth.uid() = user_id);

-- =========================================================
-- DOSE LOGS POLICIES
-- =========================================================

CREATE POLICY "dose_logs_select"
ON dose_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM medications
    WHERE medications.id = dose_logs.medication_id
    AND medications.user_id = auth.uid()
  )
);

CREATE POLICY "dose_logs_insert"
ON dose_logs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM medications
    WHERE medications.id = dose_logs.medication_id
    AND medications.user_id = auth.uid()
  )
);

CREATE POLICY "dose_logs_update"
ON dose_logs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM medications
    WHERE medications.id = dose_logs.medication_id
    AND medications.user_id = auth.uid()
  )
);

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_medications_updated_at ON medications;
CREATE TRIGGER trigger_update_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_dose_logs_updated_at ON dose_logs;
CREATE TRIGGER trigger_update_dose_logs_updated_at
  BEFORE UPDATE ON dose_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =========================================================
-- AUTO PROFILE CREATION (ПРАВИЛЬНА ВЕРСІЯ)
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Вставляємо профіль з email як ім'ям, якщо full_name відсутнє
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- DECREMENT STOCK FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION decrement_stock(
  p_medication_id UUID,
  p_amount NUMERIC
)
RETURNS VOID AS $$
BEGIN
  UPDATE medications
  SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_amount)
  WHERE id = p_medication_id;
END;
$$ LANGUAGE plpgsql;