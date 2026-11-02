// // src/services/scheduleGenerator.ts
// import { Medication, DoseLog } from '../types';
// import { generateScheduleForDateRange, startOfDay, endOfDay, isSameDayFn as isSameDay } from '../utils/dateHelpers';

// export interface DoseWithStatus {
//   scheduledTime: Date;
//   status: 'taken' | 'missed' | 'pending';
//   logId?: string;
//   edit_mark?: 'auto' | 'manual' | null;
// }

// export function getDosesForDay(
//   medication: Medication,
//   date: Date,
//   doseLogs: DoseLog[]
// ): DoseWithStatus[] {
//   const dayStart = startOfDay(date);
//   const dayEnd = endOfDay(date);

//   const scheduledDoses = generateScheduleForDateRange(
//     medication.frequency,
//     new Date(medication.start_date),
//     medication.end_date ? new Date(medication.end_date) : null,
//     dayStart,
//     dayEnd
//   );

//   const logMap = new Map<string, DoseLog>();
//   for (const log of doseLogs) {
//     if (log.medication_id === medication.id) {
//       if (isSameDay(new Date(log.scheduled_time), date)) {
//         logMap.set(log.scheduled_time, log);
//       }
//     }
//   }

//   return scheduledDoses.map(scheduledTime => {
//     const iso = scheduledTime.toISOString();
//     const log = logMap.get(iso);

//     if (log) {
//       return {
//         scheduledTime,
//         status: log.status,
//         logId: log.id,
//         edit_mark: log.edit_mark,
//       };
//     }

//     return {
//       scheduledTime,
//       status: 'pending',
//     };
//   });
// }

// export function getTodayStats(
//   medications: Medication[],
//   doseLogs: DoseLog[]
// ): { taken: number; missed: number; pending: number; total: number } {
//   let taken = 0, missed = 0, pending = 0, total = 0;

//   for (const med of medications) {
//     const doses = getDosesForDay(med, new Date(), doseLogs);
//     for (const dose of doses) {
//       total++;
//       if (dose.status === 'taken') taken++;
//       else if (dose.status === 'missed') missed++;
//       else pending++;
//     }
//   }

//   return { taken, missed, pending, total };
// }














// ЦЕ ПІСЛЯ ПОДАННЯ ЗВІТУ

// src/services/scheduleGenerator.ts
import { Medication, DoseLog } from '../types';
import {
  generateScheduleForDateRange,
  startOfDay,
  endOfDay,
  isSameDayFn as isSameDay,
  isBefore,
} from '../utils/dateHelpers';

export interface DoseWithStatus {
  scheduledTime: Date;
  status: 'taken' | 'missed' | 'pending';
  logId?: string;
  edit_mark?: 'auto' | 'manual' | null;
}

export function getDosesForDay(
  medication: Medication,
  date: Date,
  doseLogs: DoseLog[]
): DoseWithStatus[] {
  const now = new Date();
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const scheduledDoses = generateScheduleForDateRange(
    medication.frequency,
    new Date(medication.start_date),
    medication.end_date ? new Date(medication.end_date) : null,
    dayStart,
    dayEnd
  );

  const logMap = new Map<string, DoseLog>();
  for (const log of doseLogs) {
    if (log.medication_id === medication.id) {
      if (isSameDay(new Date(log.scheduled_time), date)) {
        logMap.set(log.scheduled_time, log);
      }
    }
  }

  return scheduledDoses.map(scheduledTime => {
    const iso = scheduledTime.toISOString();
    const log = logMap.get(iso);

    if (log) {
      return {
        scheduledTime,
        status: log.status,
        logId: log.id,
        edit_mark: log.edit_mark,
      };
    }

    // Логу немає: якщо час дози вже минув — вважаємо пропущеною (auto-missed),
    // інакше — ще очікується
    const status: 'missed' | 'pending' = isBefore(scheduledTime, now) ? 'missed' : 'pending';

    return {
      scheduledTime,
      status,
    };
  });
}

export function getTodayStats(
  medications: Medication[],
  doseLogs: DoseLog[]
): { taken: number; missed: number; pending: number; total: number } {
  let taken = 0;
  let missed = 0;
  let pending = 0;
  let total = 0;

  for (const med of medications) {
    const doses = getDosesForDay(med, new Date(), doseLogs);
    for (const dose of doses) {
      total++;
      if (dose.status === 'taken') taken++;
      else if (dose.status === 'missed') missed++;
      else pending++;
    }
  }

  return { taken, missed, pending, total };
}