
// src\screens\MedicationDetailScreen.tsx
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, StatusBar, Platform } from 'react-native';
import { ActivityIndicator, Portal, Dialog } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, isFuture, isToday, differenceInMinutes } from 'date-fns';
import { uk } from 'date-fns/locale';
import { useFocusEffect } from '@react-navigation/native';
import { useMedications } from '../context/MedicationsContext';
import { generateScheduleForDateRange, endOfDay, canEditDose, isPastEditWindow, parseEndDate, startOfDay } from '../utils/dateHelpers';
import { MEAL_TIMING_LABELS, MEAL_TIMING_ICONS } from '../types';
import { COLORS } from '../theme/colors';
import { supabase } from '../lib/supabase'; // Додано імпорт supabase

const C = COLORS;

const MED_COLORS = [C.softGreen, C.midGreen, C.darkGreen2, '#4CAF50', '#66BB6A', '#81C784'];
function getMedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return MED_COLORS[Math.abs(h) % MED_COLORS.length];
}

function getFrequencyText(frequency: any): string {
  switch (frequency.type) {
    case 'daily': return `Щодня о ${frequency.time}`;
    case 'interval': return `Кожні ${frequency.hours} год (початок о ${frequency.startTime})`;
    case 'custom': {
      const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      return `${frequency.weekdays.map((d: number) => days[d]).join(', ')} · ${frequency.time}`;
    }
    default: return '';
  }
}

export default function MedicationDetailScreen({ route, navigation }: any) {
  const { medicationId } = route.params;
  const { medications, doseLogs, updateDoseStatus, markMissed, deleteMedication, refetch } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [editDialog, setEditDialog] = useState<{
    visible: boolean;
    logId?: string;
    medId?: string;
    scheduledTime?: Date;
    currentStatus?: string;
    editMark?: string
  }>({ visible: false });
  const [deleteDialog, setDeleteDialog] = useState(false);

  const medication = medications.find(m => m.id === medicationId);
  const accentColor = medication ? getMedColor(medication.id) : C.softGreen;

  useFocusEffect(useCallback(() => {
    if (medication) {
      navigation.setOptions({
        title: medication.name,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('AddEditMedication', { medication })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="pencil-outline" size={20} color={C.cream} />
          </TouchableOpacity>
        ),
      });
    }
  }, [medication, navigation]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const { upcomingDoses, adherenceToday } = useMemo(() => {
    if (!medication) return { upcomingDoses: [], adherenceToday: { taken: 0, total: 0 } };

    const now = new Date();
    let end: Date;
    if (medication.end_date) end = parseEndDate(medication.end_date) || endOfDay(new Date(medication.end_date));
    else end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const searchFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Показуємо за 7 днів назад

    const allSlots = generateScheduleForDateRange(
      medication.frequency,
      new Date(medication.start_date),
      medication.end_date ? new Date(medication.end_date) : null,
      searchFrom,
      end
    );

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const todaySlots = generateScheduleForDateRange(
      medication.frequency,
      new Date(medication.start_date),
      medication.end_date ? new Date(medication.end_date) : null,
      todayStart,
      todayEnd
    );

    const todayTaken = doseLogs.filter(l =>
      l.medication_id === medicationId &&
      l.status === 'taken' &&
      new Date(l.scheduled_time) >= todayStart &&
      new Date(l.scheduled_time) <= todayEnd
    ).length;

    return {
      upcomingDoses: allSlots,
      adherenceToday: { taken: todayTaken, total: todaySlots.length }
    };
  }, [medication, doseLogs, medicationId]);

  const visibleDoses = showAll ? upcomingDoses : upcomingDoses.slice(0, 6);

  const handleOpenEdit = (scheduledTime: Date) => {
    const now = new Date();
    if (isPastEditWindow(scheduledTime, now)) {
      Alert.alert('Не можна редагувати', 'Редагування доступне лише протягом 24 годин після запланованого часу.');
      return;
    }
    if (isFuture(scheduledTime)) {
      Alert.alert('Не можна редагувати', 'Прийом ще не настав.');
      return;
    }

    const isoTime = scheduledTime.toISOString();
    const log = doseLogs.find(l => l.medication_id === medicationId && l.scheduled_time === isoTime);
    setEditDialog({
      visible: true,
      logId: log?.id,
      medId: medicationId,
      scheduledTime,
      currentStatus: log?.status,
      editMark: log?.edit_mark || undefined
    });
  };

  const handleEditStatus = async (status: 'taken' | 'missed') => {
    try {
      const now = new Date();
      const scheduledTime = editDialog.scheduledTime!;
      const diffMins = differenceInMinutes(now, scheduledTime);
      const editMark = diffMins <= 30 ? undefined : 'manual';

      if (editDialog.logId) {
        await updateDoseStatus(editDialog.logId, status, editMark);
      } else if (editDialog.scheduledTime) {
        if (status === 'taken') {
          // Використовуємо markMissed для створення запису
          await markMissed(medicationId, editDialog.scheduledTime);
          // Потім оновлюємо статус
          const { data: newLog } = await supabase
            .from('dose_logs')
            .select('id')
            .eq('medication_id', medicationId)
            .eq('scheduled_time', editDialog.scheduledTime.toISOString())
            .single();
          if (newLog) await updateDoseStatus(newLog.id, status, editMark);
        } else {
          await markMissed(medicationId, editDialog.scheduledTime);
        }
      }
      await refetch();
    } catch (e) {
      console.error(e);
      Alert.alert('Помилка', 'Не вдалося змінити статус');
    }
    setEditDialog({ visible: false });
  };

  const handleDelete = async () => {
    setDeleteDialog(false);
    try {
      await deleteMedication(medicationId, true);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося видалити препарат');
    }
  };

  if (!medication) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={C.softGreen} />
      </View>
    );
  }

  const mealTiming = medication.meal_timing || 'any_time';
  const freqText = getFrequencyText(medication.frequency);

  const getDoseState = (dose: Date): {
    label: string;
    color: string;
    icon: string;
    canEdit: boolean;
    editMark?: string;
    isMissed: boolean;
  } => {
    const now = new Date();
    const isoTime = dose.toISOString();
    const log = doseLogs.find(l => l.medication_id === medicationId && l.scheduled_time === isoTime);

    if (log?.status === 'taken') {
      const mark = log.edit_mark === 'manual' ? ' (виправлено)' : '';
      return {
        label: `Прийнято${mark}`,
        color: C.taken,
        icon: 'check-circle',
        canEdit: canEditDose(dose, now),
        isMissed: false
      };
    }

    if (log?.status === 'missed') {
      const mark = log.edit_mark === 'manual' ? ' (виправлено)' : log.edit_mark === 'auto' ? ' (авто)' : '';
      return {
        label: `Пропущено${mark}`,
        color: C.missed,
        icon: 'close-circle',
        canEdit: canEditDose(dose, now),
        isMissed: true
      };
    }

    // Перевіряємо чи доза мала бути прийнята і час минув
    const diffHours = (now.getTime() - dose.getTime()) / (60 * 60 * 1000);
    if (diffHours > 0 && diffHours < 24) {
      return {
        label: 'Очікує підтвердження',
        color: C.warn,
        icon: 'clock-alert-outline',
        canEdit: canEditDose(dose, now),
        isMissed: false
      };
    }

    if (diffHours >= 24) {
      return {
        label: 'Пропущено (авто)',
        color: C.missed,
        icon: 'close-circle',
        canEdit: false,
        isMissed: true
      };
    }

    if (isFuture(dose)) {
      return {
        label: format(dose, 'HH:mm'),
        color: C.textSub,
        icon: 'clock-outline',
        canEdit: false,
        isMissed: false
      };
    }

    return {
      label: 'Заплановано',
      color: C.textSub,
      icon: 'clock-outline',
      canEdit: false,
      isMissed: false
    };
  };

  const getDoseDateLabel = (dose: Date): string => {
    const now = new Date();
    const doseDate = startOfDay(dose);
    const today = startOfDay(now);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    if (doseDate.getTime() === today.getTime()) return 'Сьогодні';
    if (doseDate.getTime() === yesterday.getTime()) return 'Вчора';
    if (doseDate.getTime() === tomorrow.getTime()) return 'Завтра';
    return format(dose, 'EEE, d MMM', { locale: uk });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.softGreen}
            colors={[C.softGreen]}
          />
        }
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={[styles.heroAccent, { backgroundColor: accentColor }]} />

          <View style={styles.heroContent}>
            <View style={[styles.heroAvatar, { backgroundColor: accentColor + '20' }]}>
              <Icon name="pill" size={28} color={accentColor} />
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{medication.name}</Text>
              {medication.dosage && (
                <View style={[styles.dosagePill, { backgroundColor: accentColor + '20' }]}>
                  <Text style={[styles.dosagePillText, { color: accentColor }]}>{medication.dosage}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Icon name="clock-outline" size={13} color={C.darkGreen} />
              <Text style={styles.chipText}>{freqText}</Text>
            </View>
            <View style={styles.chip}>
              <Icon name={MEAL_TIMING_ICONS[mealTiming]} size={13} color={C.darkGreen} />
              <Text style={styles.chipText}>{MEAL_TIMING_LABELS[mealTiming]}</Text>
            </View>
          </View>

          <View style={styles.datesRow}>
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Початок</Text>
              <Text style={styles.dateValue}>
                {format(new Date(medication.start_date), 'd MMM yyyy', { locale: uk })}
              </Text>
            </View>
            {medication.end_date ? (
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>Кінець</Text>
                <Text style={styles.dateValue}>
                  {format(new Date(medication.end_date), 'd MMM yyyy', { locale: uk })}
                </Text>
              </View>
            ) : (
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>Тривалість</Text>
                <Text style={styles.dateValue}>Постійно</Text>
              </View>
            )}
            <View style={styles.dateBlock}>
              <Text style={styles.dateLabel}>Сьогодні</Text>
              <Text style={[styles.dateValue, { color: C.taken }]}>
                {adherenceToday.taken}/{adherenceToday.total} доз
              </Text>
            </View>
          </View>

          {medication.notes && (
            <View style={styles.notesBlock}>
              <Icon name="note-text-outline" size={14} color={C.textSub} />
              <Text style={styles.notesText}>{medication.notes}</Text>
            </View>
          )}

          {medication.stock_quantity != null && (
            <View style={styles.stockBlock}>
              <Icon name="package-variant" size={16} color={C.darkGreen} />
              <Text style={styles.stockText}>
                Запас: {medication.stock_quantity} {medication.stock_unit}
              </Text>
            </View>
          )}
        </View>

        {/* Doses Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: C.softGreen + '20' }]}>
              <Icon name="calendar-clock" size={15} color={C.softGreen} />
            </View>
            <Text style={styles.sectionTitle}>Історія прийомів</Text>
            {upcomingDoses.length > 0 && (
              <View style={[styles.countBubble, { backgroundColor: C.softGreen }]}>
                <Text style={styles.countText}>{upcomingDoses.length}</Text>
              </View>
            )}
          </View>

          {visibleDoses.length === 0 ? (
            <View style={styles.emptySection}>
              <Icon name="calendar-check" size={36} color={C.borderLight} />
              <Text style={styles.emptySectionText}>Немає запланованих прийомів</Text>
            </View>
          ) : (
            visibleDoses.map((dose: Date, i: number) => {
              const state = getDoseState(dose);
              const isLast = i === visibleDoses.length - 1;

              return (
                <View key={`${dose.getTime()}-${i}`} style={[styles.doseRow, isLast && { borderBottomWidth: 0 }]}>
                  <View style={styles.doseLeft}>
                    <Text style={styles.doseDate}>{getDoseDateLabel(dose)}</Text>
                    <Text style={[styles.doseTime, { color: state.color }]}>
                      {format(dose, 'HH:mm')}
                    </Text>
                  </View>

                  <View style={styles.doseRight}>
                    <View style={[styles.doseStateBadge, { backgroundColor: state.color + '18' }]}>
                      <Icon name={state.icon} size={13} color={state.color} />
                      <Text style={[styles.doseStateText, { color: state.color }]}>
                        {state.label}
                      </Text>
                    </View>

                    {state.canEdit && (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => handleOpenEdit(dose)}
                        activeOpacity={0.7}
                      >
                        <Icon name="pencil-outline" size={14} color={C.textSub} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {upcomingDoses.length > 6 && (
            <TouchableOpacity style={styles.showMoreBtn} onPress={() => setShowAll(v => !v)}>
              <Text style={styles.showMoreText}>
                {showAll ? 'Згорнути' : `Ще ${upcomingDoses.length - 6} прийомів`}
              </Text>
              <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={C.darkGreen} />
            </TouchableOpacity>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.editMedBtn}
            onPress={() => navigation.navigate('AddEditMedication', { medication })}
          >
            <Icon name="pencil-outline" size={18} color={C.darkGreen} />
            <Text style={styles.editMedBtnText}>Редагувати</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteDialog(true)}>
            <Icon name="trash-can-outline" size={18} color={C.missed} />
            <Text style={styles.deleteBtnText}>Видалити</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Dialog */}
      <Portal>
        <Dialog visible={editDialog.visible} onDismiss={() => setEditDialog({ visible: false })} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Змінити статус</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogSub}>Оберіть правильний статус прийому</Text>
            {editDialog.scheduledTime && (
              <Text style={[styles.dialogSub, { color: C.warn, marginBottom: 12 }]}>
                ⚠️ Редагування позначається як "виправлено вручну"
              </Text>
            )}

            <TouchableOpacity
              style={styles.editOptionTaken}
              onPress={() => handleEditStatus('taken')}
            >
              <Icon name="check-circle" size={22} color={C.taken} />
              <Text style={[styles.editOptionText, { color: C.taken }]}>Прийнято</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editOptionMissed}
              onPress={() => handleEditStatus('missed')}
            >
              <Icon name="close-circle" size={22} color={C.missed} />
              <Text style={[styles.editOptionText, { color: C.missed }]}>Пропущено</Text>
            </TouchableOpacity>
          </Dialog.Content>
          <Dialog.Actions>
            <TouchableOpacity onPress={() => setEditDialog({ visible: false })}>
              <Text style={styles.dialogCancel}>Скасувати</Text>
            </TouchableOpacity>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog visible={deleteDialog} onDismiss={() => setDeleteDialog(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Видалити препарат?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogSub}>
              Оберіть спосіб видалення. Залишки видаляються в обох випадках.
            </Text>

            <TouchableOpacity style={[styles.deleteOption, { marginTop: 8 }]} onPress={handleDelete}>
              <Icon name="archive-off" size={20} color={C.warn} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteOptionText}>Видалити препарат і залишки</Text>
                <Text style={styles.deleteOptionSub}>
                  Історія в календарі та звітах збережеться
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteOption, styles.deleteOptionCancel]}
              onPress={() => setDeleteDialog(false)}
            >
              <Icon name="close-circle-outline" size={20} color={C.textSub} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.deleteOptionText, { color: C.textSub }]}>Скасувати</Text>
                <Text style={[styles.deleteOptionSub, { color: C.textTertiary }]}>
                  Залишити препарат в списку
                </Text>
              </View>
            </TouchableOpacity>
          </Dialog.Content>
          <Dialog.Actions>
            <TouchableOpacity onPress={() => setDeleteDialog(false)}>
              <Text style={styles.dialogCancel}>Скасувати</Text>
            </TouchableOpacity>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.creamLight },

  heroCard: {
    backgroundColor: C.surface,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3
  },
  heroAccent: { height: 5 },
  heroContent: { flexDirection: 'row', alignItems: 'center', padding: 18, paddingBottom: 12, gap: 14 },
  heroAvatar: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  dosagePill: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  dosagePillText: { fontSize: 13, fontWeight: '700' },

  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.softGreen + '18', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  chipText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },

  datesRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 12, gap: 10 },
  dateBlock: { flex: 1 },
  dateLabel: { fontSize: 10, fontWeight: '700', color: C.textSub, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateValue: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 4 },

  notesBlock: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 12, alignItems: 'flex-start' },
  notesText: { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 19 },

  stockBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 12, backgroundColor: C.softGreen + '0F' },
  stockText: { fontSize: 13, fontWeight: '600', color: C.darkGreen },

  section: { backgroundColor: C.surface, borderRadius: 24, marginBottom: 14, padding: 16, shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  countBubble: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontWeight: '800', fontSize: 11, color: C.white },

  emptySection: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptySectionText: { fontSize: 14, color: C.textSub },

  doseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  doseLeft: { flex: 1 },
  doseDate: { fontSize: 14, fontWeight: '600', color: C.text },
  doseTime: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  doseRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doseStateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  doseStateText: { fontSize: 11, fontWeight: '700' },
  editBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.creamLight, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, paddingVertical: 10 },
  showMoreText: { fontSize: 14, fontWeight: '700', color: C.darkGreen },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  editMedBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.darkGreen + '40' },
  editMedBtnText: { fontSize: 15, fontWeight: '700', color: C.darkGreen },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 18, backgroundColor: C.missedBg, borderWidth: 1.5, borderColor: C.missed + '40' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: C.missed },

  dialog: { backgroundColor: C.surface, borderRadius: 24, padding: 4 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  dialogSub: { fontSize: 13, color: C.textSub, marginBottom: 8 },
  editOptionTaken: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.takenBg, padding: 14, borderRadius: 14, marginBottom: 10 },
  editOptionMissed: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.missedBg, padding: 14, borderRadius: 14 },
  editOptionText: { fontSize: 16, fontWeight: '700' },
  dialogCancel: { color: C.textSub, fontWeight: '600', fontSize: 14, paddingHorizontal: 8, paddingVertical: 4 },

  deleteOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.warnBg, marginBottom: 10 },
  deleteOptionCancel: { backgroundColor: C.borderLight },
  deleteOptionText: { fontSize: 14, fontWeight: '600', color: C.warn },
  deleteOptionSub: { fontSize: 11, color: C.warn + 'aa', marginTop: 2 },
});











