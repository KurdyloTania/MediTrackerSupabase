// src/services/adherenceCalculator.ts
import { startOfDay, endOfDay, subDays, isBefore, isAfter } from 'date-fns';
import { Medication, DoseLog } from '../types';
import { generateScheduleForDateRange } from '../utils/dateHelpers';

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

export function calculateAdherence(
  medications: Medication[],
  doseLogs: DoseLog[]
): AdherenceSummary {
  const now = new Date();

  // Карта логів для швидкого пошуку
  const logMap = new Map<string, DoseLog>();
  for (const log of doseLogs) {
    logMap.set(`${log.medication_id}::${log.scheduled_time}`, log);
  }

  /**
   * Рахуємо статистику за конкретний день.
   * ВАЖЛИВО: для розрахунку беремо ВСІ medications (включно з soft-deleted)
   * щоб зберегти коректну статистику минулих днів.
   * Але для "сьогодні" — тільки активні (без soft-deleted).
   */
  function getDayStats(
    date: Date,
    medsToCheck: Medication[]
  ): { scheduled: number; taken: number; missed: number } {
    let scheduled = 0;
    let taken = 0;
    let missed = 0;
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    for (const med of medsToCheck) {
      // Перевіряємо чи препарат активний на цю дату
      const medStart = new Date(med.start_date);
      if (isAfter(medStart, dayEnd)) continue; // Ще не почався

      const doses = generateScheduleForDateRange(
        med.frequency,
        medStart,
        med.end_date ? new Date(med.end_date) : null,
        dayStart,
        dayEnd
      );

      for (const dose of doses) {
        scheduled++;
        const key = `${med.id}::${dose.toISOString()}`;
        const log = logMap.get(key);

        if (log?.status === 'taken') {
          taken++;
        } else if (log?.status === 'missed') {
          missed++;
        } else if (isBefore(dose, now)) {
          // Ще не позначено, але час пройшов — вважаємо пропущеним для статистики
          missed++;
        }
      }
    }

    return { scheduled, taken, missed };
  }

  // Для "сьогодні" — тільки поточні активні medications
  const todayStats = getDayStats(now, medications);
  const todayPercentage = todayStats.scheduled > 0
    ? (todayStats.taken / todayStats.scheduled) * 100
    : 0;

  // Для тижневих даних і загальної статистики — всі medications (включно з завершеними)
  // Але ми отримуємо тільки активні, тому використовуємо те що маємо
  const weeklyData: DailyAdherence[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(now, i);
    const stats = getDayStats(day, medications);
    const percentage = stats.scheduled > 0 ? (stats.taken / stats.scheduled) * 100 : 0;
    weeklyData.push({ date: day, ...stats, percentage });
  }

  let totalTaken = 0;
  let totalScheduled = 0;
  let totalMissed = 0;

  for (let i = 29; i >= 0; i--) {
    const stats = getDayStats(subDays(now, i), medications);
    totalTaken += stats.taken;
    totalScheduled += stats.scheduled;
    totalMissed += stats.missed;
  }

  const overallAdherence = totalScheduled > 0
    ? (totalTaken / totalScheduled) * 100
    : 0;

  // Поточна серія (consecutive days 100%)
  let currentStreak = 0;
  for (let i = 0; i <= 29; i++) {
    const stats = getDayStats(subDays(now, i), medications);
    if (stats.scheduled === 0) continue;
    if (stats.taken === stats.scheduled) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Найкраща серія за 30 днів
  let bestStreak = 0;
  let streak = 0;
  for (let i = 29; i >= 0; i--) {
    const stats = getDayStats(subDays(now, i), medications);
    if (stats.scheduled === 0) continue;
    if (stats.taken === stats.scheduled) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  // Активні medications — ті що ще не завершились
  const activeMedications = medications.filter(med => {
    if (!med.end_date) return true;
    return !isBefore(endOfDay(new Date(med.end_date)), now);
  }).length;

  return {
    todayScheduled: todayStats.scheduled,
    todayTaken: todayStats.taken,
    todayMissed: todayStats.missed,
    todayPercentage,
    weeklyData,
    totalTaken,
    totalScheduled,
    totalMissed,
    overallAdherence,
    bestStreak,
    currentStreak,
    activeMedications,
  };
}


























