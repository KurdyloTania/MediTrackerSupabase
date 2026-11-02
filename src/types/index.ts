// // src/types/index.ts
export interface DailyFrequency {
  type: 'daily';
  time: string;
}

export interface IntervalFrequency {
  type: 'interval';
  hours: number;
  startTime: string;
}

export interface CustomFrequency {
  type: 'custom';
  weekdays: number[];
  time: string;
}

export type MedicationFrequency = DailyFrequency | IntervalFrequency | CustomFrequency;

export type MealTiming = 'before_meal' | 'after_meal' | 'with_meal' | 'any_time';

export const MEAL_TIMING_LABELS: Record<MealTiming, string> = {
  before_meal: 'До їжі',
  after_meal: 'Після їжі',
  with_meal: 'Під час їжі',
  any_time: 'Будь-коли',
};

export const MEAL_TIMING_ICONS: Record<MealTiming, string> = {
  before_meal: 'food-off',
  after_meal: 'food',
  with_meal: 'silverware-fork-knife',
  any_time: 'clock-outline',
};

export type StockUnit = 'таблетки' | 'капсули' | 'мл' | 'краплі' | 'дози' | 'пачки' | 'ампули';

export const STOCK_UNITS: StockUnit[] = [
  'таблетки', 'капсули', 'мл', 'краплі', 'дози', 'пачки', 'ампули',
];

export const LOW_STOCK_THRESHOLD_DOSES = 3;

export interface Medication {
  id: string;
  user_id: string;
  name: string;
  dosage?: string;
  frequency: MedicationFrequency;
  start_date: string;
  end_date?: string | null;
  reminder_enabled: boolean;
  meal_timing?: MealTiming;
  notes?: string | null;
  stock_quantity?: number | null;
  stock_unit?: StockUnit | null;
  dose_per_intake?: number | null;
  created_at: string;
  updated_at: string;
}

export type MedicationInsert = Omit<Medication, 'id' | 'created_at' | 'updated_at'>;
export type MedicationUpdate = Partial<Omit<Medication, 'id' | 'user_id' | 'created_at'>>;

export type DoseStatus = 'taken' | 'missed' | 'pending';
export type EditMark = 'auto' | 'manual' | null;

export interface DoseLog {
  id: string;
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: DoseStatus;
  edit_mark: EditMark;
  created_at: string;
  updated_at: string;
}

export type DoseLogInsert = Omit<DoseLog, 'id' | 'created_at' | 'updated_at'>;
export type DoseLogUpdate = Partial<Omit<DoseLog, 'id' | 'medication_id' | 'created_at'>>;

export interface DailyAdherence {
  date: Date;
  scheduled: number;
  taken: number;
  missed: number;
  percentage: number;
}

export interface AdherenceSummary {
  todayScheduled: number;
  todayTaken: number;
  todayMissed: number;
  todayPercentage: number;
  weeklyData: DailyAdherence[];
  totalTaken: number;
  totalScheduled: number;
  totalMissed: number;
  overallAdherence: number;
  bestStreak: number;
  currentStreak: number;
  activeMedications: number;
}

export function calcDaysSupply(med: Medication): number | null {
  if (med.stock_quantity == null || med.dose_per_intake == null || med.dose_per_intake <= 0) {
    return null;
  }

  let dosesPerDay: number;
  switch (med.frequency.type) {
    case 'daily':
      dosesPerDay = 1;
      break;
    case 'interval':
      dosesPerDay = 24 / med.frequency.hours;
      break;
    case 'custom':
      dosesPerDay = med.frequency.weekdays.length / 7;
      break;
    default:
      dosesPerDay = 1;
  }

  const dailyUsage = dosesPerDay * med.dose_per_intake;
  if (dailyUsage <= 0) return null;
  return Math.floor(med.stock_quantity / dailyUsage);
}

export function isLowStock(med: Medication): boolean {
  if (med.stock_quantity == null) return false;
  if (med.stock_quantity <= 0) return true;

  const daysSupply = calcDaysSupply(med);
  if (daysSupply === null) return false;

  const dosesLeft = med.stock_quantity;
  return dosesLeft <= LOW_STOCK_THRESHOLD_DOSES;
}