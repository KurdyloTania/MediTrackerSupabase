// Генератор розкладу. Порт логіки з вашого застосунку:
//   src/utils/dateHelpers.ts   -> generateScheduleForDateRange / getDoseTimesForDay
//   src/services/scheduleGenerator.ts / adherenceCalculator.ts -> правила статусів
// Відмінність: усе рахується в часовій зоні користувача, а не пристрою.

import {
  addDays, localDateStr, weekdayOf, zonedToInstant,
} from "./timezone.ts";

export interface DailyFrequency { type: "daily"; time: string }
export interface IntervalFrequency { type: "interval"; hours: number; startTime: string }
export interface CustomFrequency { type: "custom"; weekdays: number[]; time: string }
export type MedicationFrequency = DailyFrequency | IntervalFrequency | CustomFrequency;

export interface MedicationRow {
  id: string;
  name: string;
  dosage?: string | null;
  frequency: MedicationFrequency;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  reminder_enabled?: boolean | null;
  meal_timing?: string | null;
  notes?: string | null;
  stock_quantity?: number | null;
  stock_unit?: string | null;
  dose_per_intake?: number | null;
}

export type DoseStatus = "taken" | "missed" | "pending";

export interface DoseLogRow {
  medication_id: string;
  scheduled_time: string;
  taken_at: string | null;
  status: DoseStatus;
}

export interface ResolvedDose {
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  mealTiming: string | null;
  scheduledAt: Date;
  status: DoseStatus;
  /** true, якщо користувач відмітив дозу в застосунку (є запис у dose_logs) */
  recorded: boolean;
  takenAt: Date | null;
}

const MAX_DOSES_PER_DAY = 48;
const dateOnly = (s: string) => s.slice(0, 10);

/** Моменти прийому препарату в конкретну ЛОКАЛЬНУ дату. */
export function dosesForDate(
  med: MedicationRow,
  dateStr: string,
  tz: string,
): Date[] {
  if (dateStr < dateOnly(med.start_date)) return [];
  if (med.end_date && dateStr > dateOnly(med.end_date)) return [];

  const f = med.frequency as MedicationFrequency | null;
  if (!f || typeof f !== "object") return [];

  switch (f.type) {
    case "daily":
      return typeof f.time === "string" ? [zonedToInstant(dateStr, f.time, tz)] : [];

    case "custom":
      return Array.isArray(f.weekdays) && f.weekdays.includes(weekdayOf(dateStr)) &&
          typeof f.time === "string"
        ? [zonedToInstant(dateStr, f.time, tz)]
        : [];

    case "interval": {
      if (typeof f.startTime !== "string") return [];
      const first = zonedToInstant(dateStr, f.startTime, tz);
      // Захист: у застосунку hours <= 0 дав би нескінченний цикл
      if (!(f.hours > 0)) return [first];
      const step = f.hours * 3_600_000;
      const out: Date[] = [];
      let cur = first;
      while (localDateStr(cur, tz) === dateStr && out.length < MAX_DOSES_PER_DAY) {
        out.push(cur);
        cur = new Date(cur.getTime() + step);
      }
      return out;
    }
    default:
      return [];
  }
}

export type MedicationState = "active" | "finished" | "not_started";

export function medicationState(med: MedicationRow, todayStr: string): MedicationState {
  if (dateOnly(med.start_date) > todayStr) return "not_started";
  if (med.end_date && dateOnly(med.end_date) < todayStr) return "finished";
  return "active";
}

/**
 * Усі дози за діапазон локальних дат [fromDate, toDate] зі статусами.
 * Правила статусів - як у adherenceCalculator.ts вашого застосунку:
 *   запис taken            -> taken
 *   запис missed           -> missed
 *   інакше, час минув      -> missed (recorded=false: користувач не відмітив)
 *   інакше                 -> pending
 */
export function resolveDoses(
  meds: MedicationRow[],
  logs: DoseLogRow[],
  fromDate: string,
  toDate: string,
  tz: string,
  now: Date,
): ResolvedDose[] {
  // Ключ за epoch-мс, а не за рядком: "…Z" і "…+00:00" - це той самий момент
  const logMap = new Map<string, DoseLogRow>();
  for (const l of logs) {
    logMap.set(`${l.medication_id}::${Date.parse(l.scheduled_time)}`, l);
  }

  const out: ResolvedDose[] = [];
  for (const med of meds) {
    for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
      for (const at of dosesForDate(med, d, tz)) {
        const log = logMap.get(`${med.id}::${at.getTime()}`);
        let status: DoseStatus;
        if (log?.status === "taken") status = "taken";
        else if (log?.status === "missed") status = "missed";
        else status = at.getTime() < now.getTime() ? "missed" : "pending";

        out.push({
          medicationId: med.id,
          medicationName: med.name,
          dosage: med.dosage ?? null,
          mealTiming: med.meal_timing ?? null,
          scheduledAt: at,
          status,
          recorded: log !== undefined && log.status !== "pending",
          takenAt: log?.taken_at ? new Date(log.taken_at) : null,
        });
      }
    }
  }
  return out.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/** Порт calcDaysSupply з src/types/index.ts */
export function daysSupply(med: MedicationRow): number | null {
  if (med.stock_quantity == null || med.dose_per_intake == null || med.dose_per_intake <= 0) {
    return null;
  }
  const f = med.frequency;
  let perDay = 1;
  if (f?.type === "interval" && f.hours > 0) perDay = 24 / f.hours;
  else if (f?.type === "custom" && Array.isArray(f.weekdays)) perDay = f.weekdays.length / 7;
  const usage = perDay * med.dose_per_intake;
  return usage > 0 ? Math.floor(med.stock_quantity / usage) : null;
}