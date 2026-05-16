import { format, parse, addHours, addDays, isWithinInterval, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Frequency, IntervalFrequency, CustomFrequency } from '../types';

// Re-export date-fns functions for convenience
export { startOfDay, endOfDay };

export const formatTime = (date: Date): string => {
  return format(date, 'HH:mm');
};

export const parseTimeString = (timeStr: string): Date => {
  return parse(timeStr, 'HH:mm', new Date());
};

export const getNextDoseTimes = (
  frequency: Frequency,
  startDate: Date,
  endDate: Date | null,
  fromDate: Date = new Date(),
  limit: number = 10
): Date[] => {
  const doses: Date[] = [];
  let currentDate = new Date(fromDate);
  const end = endDate ? new Date(endDate) : null;
  
  if (currentDate < startDate) currentDate = new Date(startDate);
  
  const maxIterations = 100; // Prevent infinite loops
  let iterations = 0;
  
  while (doses.length < limit && iterations < maxIterations) {
    let nextDose: Date | null = null;
    
    if (frequency.type === 'daily') {
      const [hours, minutes] = frequency.time.split(':').map(Number);
      const candidate = new Date(currentDate);
      candidate.setHours(hours, minutes, 0, 0);
      
      if (candidate < currentDate) {
        candidate.setDate(candidate.getDate() + 1);
      }
      nextDose = candidate;
      currentDate = new Date(nextDose);
      currentDate.setDate(currentDate.getDate() + 1);
    } 
    else if (frequency.type === 'interval') {
      const intervalHours = (frequency as IntervalFrequency).hours;
      const baseDate = doses.length === 0 ? currentDate : new Date(doses[doses.length - 1]);
      nextDose = addHours(baseDate, intervalHours);
      currentDate = new Date(nextDose);
    } 
    else if (frequency.type === 'custom') {
      const customFreq = frequency as CustomFrequency;
      const [hours, minutes] = customFreq.time.split(':').map(Number);
      let found = false;
      let tempDate = new Date(currentDate);
      
      for (let i = 0; i < 7 && !found; i++) {
        const dayOfWeek = tempDate.getDay();
        if (customFreq.weekdays.includes(dayOfWeek)) {
          const candidate = new Date(tempDate);
          candidate.setHours(hours, minutes, 0, 0);
          if (candidate >= currentDate) {
            nextDose = candidate;
            found = true;
          }
        }
        if (!found) {
          tempDate.setDate(tempDate.getDate() + 1);
        }
      }
      
      if (nextDose) {
        currentDate = new Date(nextDose);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
    
    if (nextDose && (!end || nextDose <= end)) {
      doses.push(nextDose);
    } else if (nextDose && end && nextDose > end) {
      break;
    } else {
      break;
    }
    
    iterations++;
  }
  
  return doses;
};

export const generateDoseSlotsForDateRange = (
  medication: { frequency: Frequency; start_date: string; end_date: string | null },
  startDate: Date,
  endDate: Date
): Date[] => {
  const doses: Date[] = [];
  const medStart = new Date(medication.start_date);
  const medEnd = medication.end_date ? new Date(medication.end_date) : null;
  const rangeStart = startDate > medStart ? startDate : medStart;
  const rangeEnd = endDate < (medEnd || endDate) ? endDate : (medEnd || endDate);
  
  if (rangeStart > rangeEnd) return [];
  
  let current = new Date(rangeStart);
  while (current <= rangeEnd) {
    const dayDoses = getNextDoseTimes(
      medication.frequency,
      medStart,
      medEnd,
      current,
      100
    ).filter(dose => 
      dose >= startOfDay(rangeStart) && 
      dose <= endOfDay(rangeEnd)
    );
    doses.push(...dayDoses);
    
    // Move to next day to avoid infinite loop
    current.setDate(current.getDate() + 1);
  }
  
  return doses.sort((a, b) => a.getTime() - b.getTime());
};

export const isDoseDue = (scheduledTime: Date): boolean => {
  const now = new Date();
  return scheduledTime <= now && differenceInMinutes(now, scheduledTime) < 30; // Due within last 30 minutes
};

export const isDoseUpcoming = (scheduledTime: Date): boolean => {
  const now = new Date();
  return scheduledTime > now && differenceInMinutes(scheduledTime, now) <= 60;
};