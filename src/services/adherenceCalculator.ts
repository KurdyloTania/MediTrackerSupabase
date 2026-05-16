import { Medication, DoseLog } from '../types';
import { generateDoseSlotsForDateRange, startOfDay, endOfDay } from '../utils/dateHelpers';
import { differenceInDays, format } from 'date-fns';

export interface DailyAdherence {
  date: Date;
  scheduled: number;
  taken: number;
  percentage: number;
}

export interface AdherenceSummary {
  todayPercentage: number;
  todayScheduled: number;
  todayTaken: number;
  weeklyData: DailyAdherence[];
}

export async function calculateAdherence(
  medications: Medication[],
  doseLogs: DoseLog[],
  startDate: Date,
  endDate: Date
): Promise<DailyAdherence[]> {
  const days: DailyAdherence[] = [];
  const currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  // Create a map for quick lookup of taken doses
  const takenMap = new Map<string, Set<string>>();
  for (const log of doseLogs) {
    if (log.taken_at) {
      const dateKey = format(new Date(log.scheduled_time), 'yyyy-MM-dd');
      if (!takenMap.has(dateKey)) {
        takenMap.set(dateKey, new Set());
      }
      takenMap.get(dateKey)!.add(log.scheduled_time);
    }
  }
  
  while (currentDate <= end) {
    const dayStart = startOfDay(currentDate);
    const dayEnd = endOfDay(currentDate);
    let scheduledCount = 0;
    
    for (const med of medications) {
      const slots = generateDoseSlotsForDateRange(
        med,
        dayStart,
        dayEnd
      );
      scheduledCount += slots.length;
    }
    
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const takenCount = takenMap.get(dateKey)?.size || 0;
    
    days.push({
      date: new Date(currentDate),
      scheduled: scheduledCount,
      taken: Math.min(takenCount, scheduledCount),
      percentage: scheduledCount > 0 ? (takenCount / scheduledCount) * 100 : 100,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
}

export async function getAdherenceSummary(
  medications: Medication[],
  doseLogs: DoseLog[]
): Promise<AdherenceSummary> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  
  // Today's adherence
  let todayScheduled = 0;
  let todayTaken = 0;
  
  for (const med of medications) {
    const slots = generateDoseSlotsForDateRange(med, todayStart, todayEnd);
    todayScheduled += slots.length;
  }
  
  for (const log of doseLogs) {
    const logDate = new Date(log.scheduled_time);
    if (logDate >= todayStart && logDate <= todayEnd && log.taken_at) {
      todayTaken++;
    }
  }
  
  const todayPercentage = todayScheduled > 0 ? (todayTaken / todayScheduled) * 100 : 100;
  
  // Last 7 days adherence
  const weeklyData = await calculateAdherence(medications, doseLogs, weekStart, now);
  
  return {
    todayPercentage,
    todayScheduled,
    todayTaken,
    weeklyData,
  };
}