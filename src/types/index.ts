export type FrequencyType = 'daily' | 'interval' | 'custom';

export interface DailyFrequency {
  type: 'daily';
  time: string; // HH:MM format
}

export interface IntervalFrequency {
  type: 'interval';
  hours: number;
}

export interface CustomFrequency {
  type: 'custom';
  weekdays: number[]; // 0-6, Sunday=0
  time: string;
}

export type Frequency = DailyFrequency | IntervalFrequency | CustomFrequency;

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  dosage: string | null;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Тип для вставки нового медикаменту (без полів, які генеруються автоматично)
export interface MedicationInsert {
  user_id: string;
  name: string;
  dosage: string | null;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  reminder_enabled: boolean;
}

// Тип для оновлення медикаменту (всі поля опціональні)
export type MedicationUpdate = Partial<MedicationInsert>;

export interface DoseLog {
  id: string;
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  skipped: boolean;
  created_at: string;
}

// Тип для вставки логу дози
export interface DoseLogInsert {
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  skipped: boolean;
}

// Тип для оновлення логу дози
export type DoseLogUpdate = Partial<Omit<DoseLogInsert, 'medication_id' | 'scheduled_time'>>;

export interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
}

export interface PendingAction {
  id: string;
  type: 'ADD_MED' | 'UPDATE_MED' | 'DELETE_MED' | 'LOG_DOSE' | 'SKIP_DOSE';
  payload: any;
  timestamp: number;
}