import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Medication, DoseLog } from '../types';
import { getNextDoseTimes, isDoseDue } from '../utils/dateHelpers';
import { supabase } from '../lib/supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    return false;
  }
  
  // Set up Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medications', {
      name: 'Medication Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
    });
  }
  
  return true;
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleMedicationNotifications(
  medications: Medication[]
): Promise<void> {
  await cancelAllNotifications();
  
  const now = new Date();
  const maxFutureDays = 7; // Schedule for next 7 days to avoid too many notifications
  
  for (const med of medications) {
    if (!med.reminder_enabled) continue;
    
    const startDate = new Date(med.start_date);
    const endDate = med.end_date ? new Date(med.end_date) : null;
    const scheduleEnd = endDate && endDate < new Date(now.getTime() + maxFutureDays * 24 * 60 * 60 * 1000)
      ? endDate
      : new Date(now.getTime() + maxFutureDays * 24 * 60 * 60 * 1000);
    
    const doseTimes = getNextDoseTimes(
      med.frequency,
      startDate,
      endDate,
      now,
      50 // Limit per medication
    ).filter(dose => dose <= scheduleEnd);
    
    // Get already taken doses to avoid duplicate notifications
    const { data: takenLogs } = await supabase
      .from('dose_logs')
      .select('scheduled_time')
      .eq('medication_id', med.id)
      .not('taken_at', 'is', null);
    
    const takenTimes = new Set(
      takenLogs?.map(log => new Date(log.scheduled_time).getTime()) || []
    );
    
    for (const doseTime of doseTimes) {
      // Don't schedule for past doses or already taken ones
      if (doseTime <= now) continue;
      if (takenTimes.has(doseTime.getTime())) continue;
      
      // Schedule notification 5 minutes before dose time
      const triggerTime = new Date(doseTime.getTime() - 5 * 60 * 1000);
      if (triggerTime <= now) continue;
      
      // Для Android вказуємо channelId в тригері
      const trigger: Notifications.NotificationTriggerInput = Platform.OS === 'android'
        ? { 
            date: triggerTime,
            channelId: 'medications'
          }
        : { date: triggerTime };
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💊 Medication Reminder",
          body: `Time to take ${med.name}${med.dosage ? ` (${med.dosage})` : ''}`,
          data: { medicationId: med.id, scheduledTime: doseTime.toISOString() },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger,
      });
    }
  }
}

export function addNotificationResponseListener(
  callback: (medicationId: string) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const medicationId = response.notification.request.content.data?.medicationId;
    if (medicationId) {
      callback(medicationId);
    }
  });
  return () => subscription.remove();
}