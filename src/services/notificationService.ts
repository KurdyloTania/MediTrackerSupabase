// // src/services/notificationService.ts
// import * as Notifications from 'expo-notifications';
// import { Platform } from 'react-native';
// import { supabase } from '../lib/supabase';
// import { Medication, isLowStock } from '../types';
// import { generateScheduleForDateRange, shouldAutoMiss } from '../utils/dateHelpers';

// const ACTION_TAKE = 'TAKE';
// const ACTION_SNOOZE = 'SNOOZE';
// const CATEGORY_MEDICATION = 'medication_actions';

// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

// export async function requestNotificationPermissions(): Promise<boolean> {
//   try {
//     if (Platform.OS === 'android') {
//       await Notifications.setNotificationChannelAsync('reminders', {
//         name: 'Нагадування про ліки',
//         importance: Notifications.AndroidImportance.HIGH,
//         vibrationPattern: [0, 250, 250, 250],
//         lightColor: '#92B775',
//         sound: 'default',
//       });
//       await Notifications.setNotificationChannelAsync('warnings', {
//         name: 'Попередження',
//         importance: Notifications.AndroidImportance.DEFAULT,
//         vibrationPattern: [0, 100, 100, 100],
//         lightColor: '#D64045',
//       });
//       await Notifications.setNotificationChannelAsync('stock', {
//         name: 'Запас ліків',
//         importance: Notifications.AndroidImportance.HIGH,
//         vibrationPattern: [0, 300, 100, 300],
//         lightColor: '#C97B1A',
//         sound: 'default',
//       });
//     }

//     // ВИПРАВЛЕННЯ БАГ 3: реєструємо категорію з кнопками для inline-підтвердження
//     await Notifications.setNotificationCategoryAsync(CATEGORY_MEDICATION, [
//       {
//         identifier: ACTION_TAKE,
//         buttonTitle: '✅ Прийнято',
//         options: {
//           isDestructive: false,
//           // opensAppToForeground: false — дозволяє відповідати без відкриття додатку
//           opensAppToForeground: false,
//         },
//       },
//       {
//         identifier: ACTION_SNOOZE,
//         buttonTitle: '🔔 Нагадати через 15 хв',
//         options: {
//           isDestructive: false,
//           opensAppToForeground: false,
//         },
//       },
//     ]);

//     const { status: existing } = await Notifications.getPermissionsAsync();
//     if (existing === 'granted') return true;
//     const { status } = await Notifications.requestPermissionsAsync();
//     return status === 'granted';
//   } catch (error) {
//     console.error('Permission error:', error);
//     return false;
//   }
// }

// export async function cancelAllNotifications(): Promise<void> {
//   await Notifications.cancelAllScheduledNotificationsAsync();
// }

// export async function cancelMedicationNotifications(medicationId: string): Promise<void> {
//   const scheduled = await Notifications.getAllScheduledNotificationsAsync();
//   const toCancel = scheduled.filter(n => n.content.data?.medicationId === medicationId);
//   await Promise.all(toCancel.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
// }

// export async function scheduleMedicationNotifications(medications: Medication[]): Promise<void> {
//   try {
//     const { status } = await Notifications.getPermissionsAsync();
//     if (status !== 'granted') return;
//     await cancelAllNotifications();

//     const now = new Date();
//     const futureLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
//     let scheduledCount = 0;
//     const iOS_LIMIT = 60;

//     for (const med of medications) {
//       if (!med.reminder_enabled) continue;
//       const medStart = new Date(med.start_date);
//       const medEnd = med.end_date ? new Date(med.end_date) : null;
//       const doses = generateScheduleForDateRange(med.frequency, medStart, medEnd, now, futureLimit);

//       for (const doseTime of doses) {
//         if (Platform.OS === 'ios' && scheduledCount >= iOS_LIMIT) break;
//         const msUntil = doseTime.getTime() - now.getTime();
//         if (msUntil <= 0) continue;
//         try {
//           await Notifications.scheduleNotificationAsync({
//             content: {
//               title: `💊 ${med.name}`,
//               body: med.dosage ? `Час прийняти ${med.dosage}` : 'Час прийняти ліки',
//               data: {
//                 medicationId: med.id,
//                 scheduledTime: doseTime.toISOString(),
//                 type: 'reminder',
//                 medName: med.name,
//                 medDosage: med.dosage,
//               },
//               categoryIdentifier: CATEGORY_MEDICATION,
//               sound: 'default',
//               ...(Platform.OS === 'android' && { channelId: 'reminders' }),
//             },
//             trigger: {
//               date: doseTime,
//               type: Notifications.SchedulableTriggerInputTypes.DATE,
//             },
//           });
//           scheduledCount++;
//         } catch (err) {
//           console.warn('Schedule error:', err);
//         }
//       }
//       if (isLowStock(med)) await sendLowStockNotification(med);
//     }
//     console.log(`[Notifications] Scheduled ${scheduledCount} for ${medications.length} meds`);
//   } catch (error) {
//     console.error('scheduleMedicationNotifications error:', error);
//   }
// }

// async function scheduleSnoozeNotification(
//   medicationId: string,
//   scheduledTimeISO: string,
//   medName: string,
//   medDosage?: string
// ): Promise<void> {
//   try {
//     const snoozeTime = new Date(Date.now() + 15 * 60 * 1000);
//     await Notifications.scheduleNotificationAsync({
//       content: {
//         title: `⏰ Нагадування: ${medName}`,
//         body: medDosage ? `Не забудьте прийняти ${medDosage}!` : 'Не забудьте прийняти ліки!',
//         data: {
//           medicationId,
//           scheduledTime: scheduledTimeISO,
//           type: 'snooze_reminder',
//           medName,
//           medDosage,
//         },
//         categoryIdentifier: CATEGORY_MEDICATION,
//         sound: 'default',
//         ...(Platform.OS === 'android' && { channelId: 'warnings' }),
//       },
//       trigger: {
//         date: snoozeTime,
//         type: Notifications.SchedulableTriggerInputTypes.DATE,
//       },
//     });
//   } catch (error) {
//     console.warn('Snooze schedule error:', error);
//   }
// }

// export async function sendLowStockNotification(med: Medication): Promise<void> {
//   try {
//     await Notifications.scheduleNotificationAsync({
//       content: {
//         title: '⚠️ Низький запас ліків',
//         body: `${med.name}: залишилось ${med.stock_quantity} ${med.stock_unit || ''}. Поповніть запас.`,
//         data: { medicationId: med.id, type: 'stock_alert' },
//         sound: 'default',
//         ...(Platform.OS === 'android' && { channelId: 'stock' }),
//       },
//       trigger: null,
//     });
//   } catch (error) {
//     console.warn('Stock notification error:', error);
//   }
// }

// // ВИПРАВЛЕННЯ БАГ 3: handleTakeAction використовує upsert + оновлює stock
// async function handleTakeAction(medicationId: string, scheduledTimeISO: string): Promise<void> {
//   try {
//     const nowISO = new Date().toISOString();
//     const now = new Date();
//     const scheduledTime = new Date(scheduledTimeISO);
//     const diffHours = (now.getTime() - scheduledTime.getTime()) / (60 * 60 * 1000);

//     // Ігноруємо якщо доза занадто стара або майбутня
//     if (diffHours < 0 || diffHours >= 24) return;

//     // Перевіряємо чи вже прийнято
//     const { data: existing } = await supabase
//       .from('dose_logs')
//       .select('id, status')
//       .eq('medication_id', medicationId)
//       .eq('scheduled_time', scheduledTimeISO)
//       .maybeSingle();

//     if (existing?.status === 'taken') return;

//     const editMark = diffHours <= 0.5 ? null : 'manual';

//     // Upsert — єдина операція без race condition
//     const { error } = await supabase
//       .from('dose_logs')
//       .upsert(
//         {
//           medication_id: medicationId,
//           scheduled_time: scheduledTimeISO,
//           taken_at: nowISO,
//           status: 'taken',
//           edit_mark: editMark,
//         },
//         { onConflict: 'medication_id,scheduled_time' }
//       );

//     if (error) {
//       console.error('handleTakeAction upsert error:', error);
//       return;
//     }

//     // Оновлюємо залишок напряму в БД
//     const { data: med } = await supabase
//       .from('medications')
//       .select('stock_quantity, dose_per_intake')
//       .eq('id', medicationId)
//       .single();

//     if (med?.stock_quantity != null && med?.dose_per_intake != null && med.dose_per_intake > 0) {
//       const newStock = Math.max(0, med.stock_quantity - med.dose_per_intake);
//       await supabase.from('medications').update({ stock_quantity: newStock }).eq('id', medicationId);
//     }

//     console.log(`[Notification] Dose taken via notification: ${medicationId} at ${scheduledTimeISO}`);
//   } catch (error) {
//     console.error('handleTakeAction error:', error);
//   }
// }

// async function handleSnoozeAction(
//   medicationId: string,
//   scheduledTimeISO: string,
//   medName: string,
//   medDosage?: string
// ): Promise<void> {
//   try {
//     const { data: existing } = await supabase
//       .from('dose_logs')
//       .select('status')
//       .eq('medication_id', medicationId)
//       .eq('scheduled_time', scheduledTimeISO)
//       .maybeSingle();

//     if (existing?.status === 'taken') return;
//     await scheduleSnoozeNotification(medicationId, scheduledTimeISO, medName, medDosage);
//   } catch (error) {
//     console.error('handleSnoozeAction error:', error);
//   }
// }

// // ВИПРАВЛЕННЯ БАГ 3: обробляємо DEFAULT_ACTION_IDENTIFIER (tap по нотифікації)
// // — теж фіксуємо як "прийнято" і відкриваємо додаток
// export function addNotificationResponseListener(onUpdate?: () => void): () => void {
//   const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
//     const data = response.notification.request.content.data as any;
//     const { medicationId, scheduledTime, type, medName, medDosage } = data;
//     const actionId = response.actionIdentifier;

//     // Ігноруємо stock alerts
//     if (!medicationId || type === 'stock_alert') return;
//     if (!scheduledTime) return;

//     if (actionId === ACTION_TAKE) {
//       // Кнопка "Прийнято" — без відкриття додатку
//       await handleTakeAction(medicationId, scheduledTime);
//       onUpdate?.();
//     } else if (actionId === ACTION_SNOOZE) {
//       // Кнопка "Нагадати через 15 хв"
//       await handleSnoozeAction(medicationId, scheduledTime, medName || 'Ліки', medDosage);
//     } else if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
//       // ВИПРАВЛЕННЯ: тап по сповіщенню (без кнопки) — НЕ фіксуємо автоматично,
//       // просто відкриваємо додаток. Реалтайм-підписка підхопить зміни якщо
//       // юзер натисне Прийняти в UI.
//       // Нічого не робимо — додаток відкриється і useFocusEffect зробить refetch.
//     }
//   });

//   return () => subscription.remove();
// }

// export function startAutoMissWorker(medications: Medication[], onMiss?: () => void): () => void {
//   const checkMissed = async () => {
//     const now = new Date();
//     const checkWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//     for (const med of medications) {
//       if (!med.reminder_enabled) continue;
//       const medStart = new Date(med.start_date);
//       const medEnd = med.end_date ? new Date(med.end_date) : null;
//       const doses = generateScheduleForDateRange(med.frequency, medStart, medEnd, checkWindow, now);
//       for (const doseTime of doses) {
//         if (shouldAutoMiss(doseTime, now)) {
//           const isoTime = doseTime.toISOString();
//           const { data: existing } = await supabase
//             .from('dose_logs')
//             .select('id, status')
//             .eq('medication_id', med.id)
//             .eq('scheduled_time', isoTime)
//             .maybeSingle();

//           if (existing?.status === 'taken' || existing?.status === 'missed') continue;

//           await supabase
//             .from('dose_logs')
//             .upsert(
//               {
//                 medication_id: med.id,
//                 scheduled_time: isoTime,
//                 taken_at: null,
//                 status: 'missed',
//                 edit_mark: 'auto',
//               },
//               { onConflict: 'medication_id,scheduled_time' }
//             );

//           onMiss?.();
//         }
//       }
//     }
//   };

//   checkMissed();
//   const interval = setInterval(checkMissed, 5 * 60 * 1000);
//   return () => clearInterval(interval);
// }












// БЕЗ КНОПОК

// src/services/notificationService.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Medication, isLowStock } from '../types';
import { generateScheduleForDateRange, shouldAutoMiss } from '../utils/dateHelpers';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Нагадування про ліки',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#92B775',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('warnings', {
        name: 'Попередження',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#D64045',
      });
      await Notifications.setNotificationChannelAsync('stock', {
        name: 'Запас ліків',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 100, 300],
        lightColor: '#C97B1A',
        sound: 'default',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Permission error:', error);
    return false;
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelMedicationNotifications(medicationId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter(n => n.content.data?.medicationId === medicationId);
  await Promise.all(toCancel.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleMedicationNotifications(medications: Medication[]): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await cancelAllNotifications();

    const now = new Date();
    const futureLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let scheduledCount = 0;
    const iOS_LIMIT = 60;

    for (const med of medications) {
      if (!med.reminder_enabled) continue;
      const medStart = new Date(med.start_date);
      const medEnd = med.end_date ? new Date(med.end_date) : null;
      const doses = generateScheduleForDateRange(med.frequency, medStart, medEnd, now, futureLimit);

      for (const doseTime of doses) {
        if (Platform.OS === 'ios' && scheduledCount >= iOS_LIMIT) break;
        const msUntil = doseTime.getTime() - now.getTime();
        if (msUntil <= 0) continue;
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `💊 ${med.name}`,
              body: med.dosage ? `Час прийняти ${med.dosage}` : 'Час прийняти ліки',
              data: {
                medicationId: med.id,
                scheduledTime: doseTime.toISOString(),
                type: 'reminder',
              },
              sound: 'default',
              ...(Platform.OS === 'android' && { channelId: 'reminders' }),
            },
            trigger: {
              date: doseTime,
              type: Notifications.SchedulableTriggerInputTypes.DATE,
            },
          });
          scheduledCount++;
        } catch (err) {
          console.warn('Schedule error:', err);
        }
      }
      if (isLowStock(med)) await sendLowStockNotification(med);
    }
    console.log(`[Notifications] Scheduled ${scheduledCount} for ${medications.length} meds`);
  } catch (error) {
    console.error('scheduleMedicationNotifications error:', error);
  }
}

export async function sendLowStockNotification(med: Medication): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Низький запас ліків',
        body: `${med.name}: залишилось ${med.stock_quantity} ${med.stock_unit || ''}. Поповніть запас.`,
        data: { medicationId: med.id, type: 'stock_alert' },
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'stock' }),
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Stock notification error:', error);
  }
}

export function addNotificationResponseListener(onUpdate?: () => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as any;
    const { medicationId, scheduledTime, type } = data;

    // Ігноруємо stock alerts
    if (!medicationId || type === 'stock_alert') return;
    if (!scheduledTime) return;

    // При тапі на сповіщення відкриваємо додаток
    // Користувач сам відмітить прийом в UI
    console.log(`[Notification] App opened from notification: ${medicationId}`);
    onUpdate?.();
  });

  return () => subscription.remove();
}

export function startAutoMissWorker(medications: Medication[], onMiss?: () => void): () => void {
  const checkMissed = async () => {
    const now = new Date();
    const checkWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    for (const med of medications) {
      if (!med.reminder_enabled) continue;
      const medStart = new Date(med.start_date);
      const medEnd = med.end_date ? new Date(med.end_date) : null;
      const doses = generateScheduleForDateRange(med.frequency, medStart, medEnd, checkWindow, now);
      for (const doseTime of doses) {
        if (shouldAutoMiss(doseTime, now)) {
          const isoTime = doseTime.toISOString();
          const { data: existing } = await supabase
            .from('dose_logs')
            .select('id, status')
            .eq('medication_id', med.id)
            .eq('scheduled_time', isoTime)
            .maybeSingle();

          if (existing?.status === 'taken' || existing?.status === 'missed') continue;

          await supabase
            .from('dose_logs')
            .upsert(
              {
                medication_id: med.id,
                scheduled_time: isoTime,
                taken_at: null,
                status: 'missed',
                edit_mark: 'auto',
              },
              { onConflict: 'medication_id,scheduled_time' }
            );

          onMiss?.();
        }
      }
    }
  };

  checkMissed();
  const interval = setInterval(checkMissed, 5 * 60 * 1000);
  return () => clearInterval(interval);
}

