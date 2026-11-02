// import {
//   addDays,
//   addHours,
//   startOfDay as fnsStartOfDay,
//   endOfDay as fnsEndOfDay,
//   isBefore,
//   isAfter,
//   isSameDay,
//   differenceInMinutes,
//   differenceInHours,
// } from 'date-fns';
// import { MedicationFrequency } from '../types';

// export const startOfDay = fnsStartOfDay;
// export const endOfDay = fnsEndOfDay;
// export const isSameDayFn = isSameDay;

// export function setTimeToDate(date: Date, timeStr: string): Date {
//   const [hours, minutes] = timeStr.split(':').map(Number);
//   const result = new Date(date);
//   result.setHours(hours, minutes, 0, 0);
//   return result;
// }

// export function parseEndDate(endDateStr: string | null | undefined): Date | null {
//   if (!endDateStr) return null;
//   const [y, m, d] = endDateStr.split('-').map(Number);
//   const date = new Date(y, m - 1, d);
//   date.setHours(23, 59, 59, 999);
//   return date;
// }

// // ==================== НОВІ ФУНКЦІЇ ====================

// export function isTimePassedToday(doseTime: Date, now: Date = new Date()): boolean {
//   return isBefore(doseTime, now);
// }

// export function getEditMark(doseTime: Date, now: Date = new Date()): 'auto' | 'manual' | null {
//   const diffMinutes = differenceInMinutes(now, doseTime);
//   if (diffMinutes < 0) return null;
//   if (diffMinutes <= 30) return null;
//   if (diffMinutes < 24 * 60) return 'manual';
//   return null;
// }

// export function isDoseDue(doseTime: Date, now: Date = new Date()): boolean {
//   const diff = differenceInMinutes(now, doseTime);
//   return diff >= 0 && diff <= 30;
// }

// export function canEditDose(doseTime: Date, now: Date = new Date()): boolean {
//   const diff = differenceInHours(now, doseTime);
//   return diff >= 0 && diff < 24;
// }

// export function isPastEditWindow(doseTime: Date, now: Date = new Date()): boolean {
//   return differenceInHours(now, doseTime) >= 24;
// }

// export function shouldAutoMiss(doseTime: Date, now: Date = new Date()): boolean {
//   const diffMinutes = differenceInMinutes(now, doseTime);
//   return diffMinutes >= 30 && diffMinutes < 24 * 60;
// }

// // ==================== ГЕНЕРАТОР РОЗКЛАДУ ====================

// export function generateScheduleForDateRange(
//   frequency: MedicationFrequency,
//   startDate: Date,
//   endDate: Date | null,
//   rangeStart: Date,
//   rangeEnd: Date
// ): Date[] {
//   const results: Date[] = [];

//   const medStart = startOfDay(startDate);
//   const medEnd = endDate ? parseEndDate(endDate.toISOString().split('T')[0])! : endOfDay(rangeEnd);
//   const effectiveRangeStart = startOfDay(rangeStart);
//   const effectiveRangeEnd = endOfDay(rangeEnd);

//   let currentDay = new Date(Math.max(medStart.getTime(), effectiveRangeStart.getTime()));

//   while (currentDay <= effectiveRangeEnd && currentDay <= medEnd) {
//     const doseTimes = getDoseTimesForDay(frequency, currentDay);

//     for (const dose of doseTimes) {
//       if (dose >= effectiveRangeStart && dose <= effectiveRangeEnd && dose <= medEnd) {
//         results.push(dose);
//       }
//     }
//     currentDay = addDays(currentDay, 1);
//   }

//   return results.sort((a, b) => a.getTime() - b.getTime());
// }

// function getDoseTimesForDay(freq: MedicationFrequency, date: Date): Date[] {
//   const day = startOfDay(date);
//   const times: Date[] = [];

//   switch (freq.type) {
//     case 'daily':
//       times.push(setTimeToDate(day, freq.time));
//       break;

//     case 'interval':
//       let current = setTimeToDate(day, freq.startTime);
//       const intervalMs = freq.hours * 60 * 60 * 1000;
//       while (current <= endOfDay(day)) {
//         times.push(new Date(current));
//         current = new Date(current.getTime() + intervalMs);
//       }
//       break;

//     case 'custom':
//       if (freq.weekdays.includes(day.getDay())) {
//         times.push(setTimeToDate(day, freq.time));
//       }
//       break;
//   }
//   return times;
// }

// export { isBefore, isAfter };



// src/utils/dateHelpers.ts
import {
  addDays,
  addHours,
  startOfDay as fnsStartOfDay,
  endOfDay as fnsEndOfDay,
  isBefore,
  isAfter,
  isSameDay,
  differenceInMinutes,
  differenceInHours,
} from 'date-fns';
import { MedicationFrequency } from '../types';

export const startOfDay = fnsStartOfDay;
export const endOfDay = fnsEndOfDay;
export const isSameDayFn = isSameDay;

export function setTimeToDate(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function parseEndDate(endDateStr: string | null | undefined): Date | null {
  if (!endDateStr) return null;
  const [y, m, d] = endDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(23, 59, 59, 999);
  return date;
}

// ==================== НОВІ ФУНКЦІЇ ====================

export function isTimePassedToday(doseTime: Date, now: Date = new Date()): boolean {
  return isBefore(doseTime, now);
}

export function getEditMark(doseTime: Date, now: Date = new Date()): 'auto' | 'manual' | null {
  const diffMinutes = differenceInMinutes(now, doseTime);
  if (diffMinutes < 0) return null;
  if (diffMinutes <= 30) return null;
  if (diffMinutes < 24 * 60) return 'manual';
  return null;
}

export function isDoseDue(doseTime: Date, now: Date = new Date()): boolean {
  const diff = differenceInMinutes(now, doseTime);
  return diff >= 0 && diff <= 30;
}

export function canEditDose(doseTime: Date, now: Date = new Date()): boolean {
  const diff = differenceInHours(now, doseTime);
  return diff >= 0 && diff < 24;
}

export function isPastEditWindow(doseTime: Date, now: Date = new Date()): boolean {
  return differenceInHours(now, doseTime) >= 24;
}

export function shouldAutoMiss(doseTime: Date, now: Date = new Date()): boolean {
  const diffMinutes = differenceInMinutes(now, doseTime);
  return diffMinutes >= 30 && diffMinutes < 24 * 60;
}

// ==================== ГЕНЕРАТОР РОЗКЛАДУ ====================

export function generateScheduleForDateRange(
  frequency: MedicationFrequency,
  startDate: Date,
  endDate: Date | null,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const results: Date[] = [];

  const medStart = startOfDay(startDate);
  const medEnd = endDate ? parseEndDate(endDate.toISOString().split('T')[0])! : endOfDay(rangeEnd);
  const effectiveRangeStart = startOfDay(rangeStart);
  const effectiveRangeEnd = endOfDay(rangeEnd);

  let currentDay = new Date(Math.max(medStart.getTime(), effectiveRangeStart.getTime()));

  while (currentDay <= effectiveRangeEnd && currentDay <= medEnd) {
    const doseTimes = getDoseTimesForDay(frequency, currentDay);

    for (const dose of doseTimes) {
      if (dose >= effectiveRangeStart && dose <= effectiveRangeEnd && dose <= medEnd) {
        results.push(dose);
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  return results.sort((a, b) => a.getTime() - b.getTime());
}

function getDoseTimesForDay(freq: MedicationFrequency, date: Date): Date[] {
  const day = startOfDay(date);
  const times: Date[] = [];

  switch (freq.type) {
    case 'daily':
      times.push(setTimeToDate(day, freq.time));
      break;

    case 'interval':
      let current = setTimeToDate(day, freq.startTime);
      const intervalMs = freq.hours * 60 * 60 * 1000;
      while (current <= endOfDay(day)) {
        times.push(new Date(current));
        current = new Date(current.getTime() + intervalMs);
      }
      break;

    case 'custom':
      if (freq.weekdays.includes(day.getDay())) {
        times.push(setTimeToDate(day, freq.time));
      }
      break;
  }
  return times;
}

export { isBefore, isAfter };