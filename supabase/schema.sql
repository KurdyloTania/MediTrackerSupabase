-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Medications table
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  frequency JSONB NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  reminder_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dose logs table
CREATE TABLE dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID REFERENCES medications(id) ON DELETE CASCADE,
  scheduled_time TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  skipped BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view own profile" ON profiles 
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies for medications
CREATE POLICY "Users can view own medications" ON medications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own medications" ON medications 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own medications" ON medications 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own medications" ON medications 
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for dose logs
CREATE POLICY "Users can view own dose logs" ON dose_logs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM medications 
    WHERE medications.id = dose_logs.medication_id 
    AND medications.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own dose logs" ON dose_logs
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM medications 
    WHERE medications.id = dose_logs.medication_id 
    AND medications.user_id = auth.uid()
  ));
CREATE POLICY "Users can update own dose logs" ON dose_logs
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM medications 
    WHERE medications.id = dose_logs.medication_id 
    AND medications.user_id = auth.uid()
  ));

-- Auto-update updated_at function and trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ 
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_medications_updated_at 
  BEFORE UPDATE ON medications 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function and trigger to handle new user profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();