// src\screens\AddEditMedicationScreen.tsx
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Switch, StatusBar, Platform, KeyboardAvoidingView, Modal,
} from 'react-native';
import { TextInput, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  format, parseISO, isBefore, isToday, addDays, isAfter, startOfDay, isSameDay,
} from 'date-fns';
import { uk } from 'date-fns/locale';
import { useMedications } from '../context/MedicationsContext';
import {
  MedicationFrequency, MealTiming, MEAL_TIMING_LABELS, MEAL_TIMING_ICONS,
  STOCK_UNITS, StockUnit,
} from '../types';
import { COLORS } from '../theme/colors';

const C = COLORS;
const WEEKDAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function SectionCard({
  title, icon, children,
}: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionCardHeader}>
        <View style={styles.sectionCardIcon}>
          <Icon name={icon} size={16} color={C.softGreen} />
        </View>
        <Text style={styles.sectionCardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ThemedInput({ label, keyboardType = 'default', ...props }: any) {
  return (
    <TextInput
      label={label}
      mode="outlined"
      outlineColor={C.border}
      activeOutlineColor={C.darkGreen}
      textColor={C.text}
      style={styles.input}
      contentStyle={styles.inputContent}
      keyboardType={keyboardType}
      {...props}
    />
  );
}

export default function AddEditMedicationScreen({ route, navigation }: any) {
  const { medication } = route.params || {};
  const { addMedication, updateMedication, medications } = useMedications();
  const isEditing = !!medication;

  const [name, setName] = useState(medication?.name ?? '');
  const [dosage, setDosage] = useState(medication?.dosage ?? '');
  const [notes, setNotes] = useState(medication?.notes ?? '');
  const [reminderEnabled, setReminderEnabled] = useState(medication?.reminder_enabled ?? true);
  const [mealTiming, setMealTiming] = useState<MealTiming>(medication?.meal_timing ?? 'any_time');
  // Дати з БД ("YYYY-MM-DD") читаємо як МІСЦЕВІ (parseISO), а не як UTC (new Date)
  const [startDate, setStartDate] = useState<Date>(
    medication?.start_date ? parseISO(medication.start_date) : new Date(),
  );
  const [endDate, setEndDate] = useState<Date | null>(
    medication?.end_date ? parseISO(medication.end_date) : new Date(),
  );
  const [noEndDate, setNoEndDate] = useState(!medication?.end_date);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const initFreq = medication?.frequency ?? { type: 'daily', time: '09:00' };
  const [freqType, setFreqType] = useState<'daily' | 'interval' | 'custom'>(initFreq.type);
  const [dailyTime, setDailyTime] = useState(
    initFreq.type === 'daily' ? initFreq.time : '09:00',
  );
  const [intervalHours, setIntervalHours] = useState(
    initFreq.type === 'interval' ? String(initFreq.hours) : '8',
  );
  const [intervalStart, setIntervalStart] = useState(
    initFreq.type === 'interval' ? initFreq.startTime : '09:00',
  );
  const [customWeekdays, setCustomWeekdays] = useState<number[]>(
    initFreq.type === 'custom' ? initFreq.weekdays : [1, 2, 3, 4, 5],
  );
  const [customTime, setCustomTime] = useState(
    initFreq.type === 'custom' ? initFreq.time : '09:00',
  );

  const [showTimePicker, setShowTimePicker] = useState<string | null>(null);
  const [pickerTime, setPickerTime] = useState<Date>(new Date());

  const [trackStock, setTrackStock] = useState(medication?.stock_quantity != null);
  const [stockQty, setStockQty] = useState(
    medication?.stock_quantity != null ? String(medication.stock_quantity) : '',
  );
  const [stockUnit, setStockUnit] = useState<StockUnit>(medication?.stock_unit ?? 'таблетки');
  const [dosePerIntake, setDosePerIntake] = useState(
    medication?.dose_per_intake != null ? String(medication.dose_per_intake) : '1',
  );

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getCurrentDoseTime = useCallback((): string => {
    if (freqType === 'daily') return dailyTime;
    if (freqType === 'interval') return intervalStart;
    return customTime;
  }, [freqType, dailyTime, intervalStart, customTime]);

  const isTimePassedToday = useMemo(() => {
    if (isEditing) return false;
    const now = new Date();
    const todayStart = startOfDay(now);
    const startDateDay = startOfDay(startDate);
    if (!isSameDay(startDateDay, todayStart)) return false;
    const timeStr = getCurrentDoseTime();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const doseTime = new Date();
    doseTime.setHours(hours, minutes, 0, 0);
    return isBefore(doseTime, now);
  }, [startDate, freqType, dailyTime, intervalStart, customTime, isEditing, getCurrentDoseTime]);

  // Перевірка на дублювання ТІЛЬКИ серед активних препаратів
  const validate = useCallback(() => {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = 'Введіть назву препарату';
    }

    // Перевірка дублікатів тільки серед активних препаратів
    if (!isEditing && name.trim()) {
      const trimmedName = name.trim().toLowerCase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Знаходимо активний препарат з такою ж назвою
      const activeDuplicate = medications.find(med => {
        if (med.name.trim().toLowerCase() !== trimmedName) return false;

        // Препарат активний, якщо:
        // 1. Немає дати кінця, АБО
        // 2. Дата кінця >= сьогодні
        if (!med.end_date) return true;
        const endDateObj = parseISO(med.end_date);
        endDateObj.setHours(23, 59, 59, 999);
        return endDateObj >= today;
      });

      if (activeDuplicate) {
        errs.name = `Препарат "${activeDuplicate.name}" вже є в активних ліках`;
      }
    }

    if (freqType === 'interval') {
      const h = parseInt(intervalHours, 10);
      if (isNaN(h) || h < 1 || h > 24) {
        errs.interval = 'Введіть коректний інтервал (1–24 год)';
      }
    }

    if (freqType === 'custom' && customWeekdays.length === 0) {
      errs.weekdays = 'Оберіть хоча б один день тижня';
    }

    if (!noEndDate && endDate && isBefore(endDate, startOfDay(startDate))) {
      errs.endDate = 'Дата кінця не може бути раніше за дату початку';
    }

    if (trackStock) {
      const qty = Number(stockQty);
      if (!stockQty || isNaN(qty) || qty < 0) {
        errs.stock = 'Введіть коректну кількість (≥0)';
      }
      const dpi = Number(dosePerIntake);
      if (isNaN(dpi) || dpi <= 0) {
        errs.dosePerIntake = 'Доза за прийом має бути > 0';
      }
    }

    setErrors(errs);
    const hasErrors = Object.keys(errs).length > 0;

    let warningMessage: string | undefined;
    if (!isEditing && isTimePassedToday && !hasErrors) {
      warningMessage = `Увага! Час прийому (${getCurrentDoseTime()}) вже минув сьогодні.\n\nПрепарат буде додано з сьогоднішньою датою, але перший прийом вважатиметься пропущеним.\n\nБажаєте продовжити?`;
    }

    return { valid: !hasErrors, warningMessage };
  }, [
    name, freqType, intervalHours, customWeekdays, noEndDate, endDate, startDate,
    trackStock, stockQty, dosePerIntake, isTimePassedToday, isEditing,
    getCurrentDoseTime, medications,
  ]);

  const buildFrequency = useCallback((): MedicationFrequency => {
    switch (freqType) {
      case 'daily':
        return { type: 'daily', time: dailyTime };
      case 'interval':
        return {
          type: 'interval',
          hours: parseInt(intervalHours, 10) || 8,
          startTime: intervalStart,
        };
      case 'custom':
        return {
          type: 'custom',
          weekdays: [...customWeekdays].sort((a, b) => a - b),
          time: customTime,
        };
    }
  }, [freqType, dailyTime, intervalHours, intervalStart, customWeekdays, customTime]);

  // Дату зберігаємо за МІСЦЕВИМ календарем (format), а не за UTC (toISOString):
  // після опівночі за Києвом UTC-дата ще "вчорашня".
  const getStartDateString = useCallback((): string => {
    if (isEditing) return format(startDate, 'yyyy-MM-dd');
    if (isToday(startDate) && isTimePassedToday) {
      return format(addDays(startDate, 1), 'yyyy-MM-dd');
    }
    return format(startDate, 'yyyy-MM-dd');
  }, [startDate, isTimePassedToday, isEditing]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Main');
  }, [navigation]);

  const performSave = async () => {
    setLoading(true);
    const stockQuantityValue = trackStock && stockQty !== '' ? Number(stockQty) : null;
    const dosePerIntakeValue = trackStock && dosePerIntake !== '' ? Number(dosePerIntake) : null;

    const payload = {
      name: name.trim(),
      dosage: dosage.trim() || undefined,
      notes: notes.trim() || null,
      frequency: buildFrequency(),
      start_date: getStartDateString(),
      end_date: noEndDate ? null : (endDate ? format(endDate, 'yyyy-MM-dd') : null),
      reminder_enabled: reminderEnabled,
      meal_timing: mealTiming,
      stock_quantity: stockQuantityValue,
      stock_unit: trackStock ? stockUnit : null,
      dose_per_intake: dosePerIntakeValue,
    };

    try {
      if (isEditing) {
        await updateMedication(medication.id, payload);
        Alert.alert('Збережено', 'Дані препарату оновлено.');
      } else {
        await addMedication(payload);
        Alert.alert('Додано', 'Препарат успішно додано.');
      }
      goBack();
    } catch (error: any) {
      Alert.alert('Помилка', `Не вдалося зберегти: ${error?.message ?? 'Невідома помилка'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const result = validate();
    if (!result.valid) return;

    if (result.warningMessage) {
      Alert.alert(
        'Увага',
        result.warningMessage,
        [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Продовжити', onPress: () => performSave() },
        ],
      );
      return;
    }

    performSave();
  };

  const toggleWeekday = (day: number) =>
    setCustomWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );

  const openTimePicker = (key: string, currentTime: string) => {
    const [h, m] = currentTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    setPickerTime(d);
    setShowTimePicker(key);
  };

  const applyTimeFromPicker = (date: Date) => {
    const str = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (showTimePicker === 'daily') setDailyTime(str);
    else if (showTimePicker === 'intervalStart') setIntervalStart(str);
    else if (showTimePicker === 'custom') setCustomTime(str);
  };

  const onTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(null);
      if (event.type === 'set' && selectedDate) applyTimeFromPicker(selectedDate);
    } else {
      if (selectedDate) {
        setPickerTime(selectedDate);
        applyTimeFromPicker(selectedDate);
      }
    }
  };

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && selectedDate) setStartDate(selectedDate);
    } else {
      if (selectedDate) setStartDate(selectedDate);
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && selectedDate) setEndDate(selectedDate);
    } else {
      if (selectedDate) setEndDate(selectedDate);
    }
  };

  const showTimeWarning = (isTimePassedToday && !isEditing);

  // ========== ОБРОБНИКИ ДЛЯ ЧИСЛОВИХ ПОЛІВ ==========

  const handleDosageChange = (text: string) => {
    // Дозволяємо: цифри, крапку, пробіл
    // Якщо потрібні тільки цифри та крапка:
    let cleaned = text.replace(/[^0-9.]/g, '');
    // Запобігаємо множинним крапкам
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    setDosage(cleaned);
  };

  const handleStockQtyChange = (text: string) => {
    // Тільки цифри
    const numeric = text.replace(/[^0-9]/g, '');
    setStockQty(numeric);
  };

  const handleDosePerIntakeChange = (text: string) => {
    // Цифри та крапка (для десяткових доз)
    let cleaned = text.replace(/[^0-9.]/g, '');
    // Запобігаємо множинним крапкам
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    setDosePerIntake(cleaned);
  };

  const handleIntervalHoursChange = (text: string) => {
    // Тільки цифри
    const numeric = text.replace(/[^0-9]/g, '');
    setIntervalHours(numeric);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >

        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ──  інформація ── */}
          <SectionCard title=" інформація" icon="pill">
            <ThemedInput
              label="Назва препарату *"
              value={name}
              onChangeText={setName}
              error={!!errors.name}
              autoCapitalize="words"
            />
            {errors.name && <Text style={styles.errText}>{errors.name}</Text>}

            <ThemedInput
              label="Дозування (напр. 500)"
              value={dosage}
              onChangeText={handleDosageChange}
              keyboardType="numeric"
              placeholder="500"
            />

            <ThemedInput
              label="Нотатки"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </SectionCard>

          {/* ── Розклад прийому ── */}
          <SectionCard title="Розклад прийому" icon="clock-outline">
            <View style={styles.tabRow}>
              {(['daily', 'interval', 'custom'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.tab, freqType === type && styles.tabActive]}
                  onPress={() => setFreqType(type)}
                >
                  <Text style={[styles.tabText, freqType === type && styles.tabTextActive]}>
                    {type === 'daily' ? 'Щодня' : type === 'interval' ? 'Інтервал' : 'По днях'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {freqType === 'daily' && (
              <TouchableOpacity
                style={[styles.timePicker, showTimeWarning && styles.timePickerWarning]}
                onPress={() => openTimePicker('daily', dailyTime)}
              >
                <Icon name="clock-outline" size={20} color={showTimeWarning ? C.warn : C.darkGreen} />
                <Text style={[styles.timePickerText, showTimeWarning && { color: C.warn }]}>
                  Час прийому: {dailyTime}{showTimeWarning && ' ⚠️ (сьогодні вже минув)'}
                </Text>
                <Icon name="chevron-right" size={18} color={C.textSub} />
              </TouchableOpacity>
            )}

            {freqType === 'interval' && (
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <ThemedInput
                    label="Інтервал (год)"
                    value={intervalHours}
                    onChangeText={handleIntervalHoursChange}
                    keyboardType="numeric"
                    error={!!errors.interval}
                  />
                  {errors.interval && <Text style={styles.errText}>{errors.interval}</Text>}
                </View>
                <TouchableOpacity
                  style={[
                    styles.timePicker,
                    { flex: 1, marginTop: 0 },
                    showTimeWarning && styles.timePickerWarning,
                  ]}
                  onPress={() => openTimePicker('intervalStart', intervalStart)}
                >
                  <Icon name="clock-start" size={18} color={showTimeWarning ? C.warn : C.darkGreen} />
                  <Text style={[styles.timePickerSmall, showTimeWarning && { color: C.warn }]}>
                    Початок: {intervalStart}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {freqType === 'custom' && (
              <>
                <View style={styles.weekdaysRow}>
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.weekdayBtn,
                        customWeekdays.includes(idx) && styles.weekdayBtnActive,
                      ]}
                      onPress={() => toggleWeekday(idx)}
                    >
                      <Text style={[
                        styles.weekdayText,
                        customWeekdays.includes(idx) && styles.weekdayTextActive,
                      ]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.weekdays && <Text style={styles.errText}>{errors.weekdays}</Text>}
                <TouchableOpacity
                  style={[styles.timePicker, showTimeWarning && styles.timePickerWarning]}
                  onPress={() => openTimePicker('custom', customTime)}
                >
                  <Icon name="clock-outline" size={20} color={showTimeWarning ? C.warn : C.darkGreen} />
                  <Text style={[styles.timePickerText, showTimeWarning && { color: C.warn }]}>
                    Час: {customTime}{showTimeWarning && ' ⚠️ (сьогодні вже минув)'}
                  </Text>
                  <Icon name="chevron-right" size={18} color={C.textSub} />
                </TouchableOpacity>
              </>
            )}
          </SectionCard>

          {/* ── Терміни лікування ── */}
          <SectionCard title="Терміни лікування" icon="calendar-range">
            <TouchableOpacity style={styles.datePicker} onPress={() => setShowStartPicker(true)}>
              <Icon name="calendar-start" size={20} color={C.darkGreen} />
              <Text style={styles.datePickerText}>
                Початок: {format(startDate, 'd MMMM yyyy', { locale: uk })}
              </Text>
              <Icon name="chevron-right" size={18} color={C.textSub} />
            </TouchableOpacity>

            <View style={styles.endDateRow}>
              <View style={styles.endDateSwitch}>
                <Text style={styles.endDateLabel}>Кінцева дата</Text>
                <Switch
                  value={!noEndDate}
                  onValueChange={val => {
                    setNoEndDate(!val);
                    if (val) setEndDate(startDate);
                  }}
                  trackColor={{ false: C.borderLight, true: C.softGreen }}
                  thumbColor={!noEndDate ? C.darkGreen : C.textTertiary}
                />
              </View>

              {!noEndDate && (
                <>
                  <TouchableOpacity style={styles.datePicker} onPress={() => setShowEndPicker(true)}>
                    <Icon name="calendar-end" size={20} color={C.darkGreen} />
                    <Text style={styles.datePickerText}>
                      {endDate
                        ? format(endDate, 'd MMMM yyyy', { locale: uk })
                        : format(startDate, 'd MMMM yyyy', { locale: uk })}
                    </Text>
                    <Icon name="chevron-right" size={18} color={C.textSub} />
                  </TouchableOpacity>
                  {errors.endDate && <Text style={styles.errText}>{errors.endDate}</Text>}
                </>
              )}
            </View>
          </SectionCard>

          {/* ── Вживання відносно їжі ── */}
          <SectionCard title="Вживання відносно їжі" icon="food">
            <View style={styles.mealTimingRow}>
              {(['before_meal', 'with_meal', 'after_meal', 'any_time'] as MealTiming[]).map(mt => (
                <TouchableOpacity
                  key={mt}
                  style={[styles.mealBtn, mealTiming === mt && styles.mealBtnActive]}
                  onPress={() => setMealTiming(mt)}
                >
                  <Icon
                    name={MEAL_TIMING_ICONS[mt]}
                    size={18}
                    color={mealTiming === mt ? C.cream : C.textSub}
                  />
                  <Text style={[styles.mealBtnText, mealTiming === mt && styles.mealBtnTextActive]}>
                    {MEAL_TIMING_LABELS[mt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SectionCard>

          {/* ── Відстеження залишків ── */}
          <SectionCard title="Відстеження залишків" icon="archive-arrow-down-outline">
            <View style={styles.trackStockRow}>
              <Text style={styles.trackStockLabel}>Відстежувати залишки</Text>
              <Switch
                value={trackStock}
                onValueChange={setTrackStock}
                trackColor={{ false: C.borderLight, true: C.softGreen }}
                thumbColor={trackStock ? C.darkGreen : C.textTertiary}
              />
            </View>

            {trackStock && (
              <>
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <ThemedInput
                      label="Кількість"
                      value={stockQty}
                      onChangeText={handleStockQtyChange}
                      keyboardType="numeric"
                      placeholder="напр. 30"
                      error={!!errors.stock}
                    />
                    {errors.stock && <Text style={styles.errText}>{errors.stock}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedInput
                      label="Доза/прийом"
                      value={dosePerIntake}
                      onChangeText={handleDosePerIntakeChange}
                      keyboardType="numeric"
                      placeholder="напр. 1"
                      error={!!errors.dosePerIntake}
                    />
                    {errors.dosePerIntake && (
                      <Text style={styles.errText}>{errors.dosePerIntake}</Text>
                    )}
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.unitRow}>
                    {STOCK_UNITS.map(unit => (
                      <TouchableOpacity
                        key={unit}
                        style={[styles.unitBtn, stockUnit === unit && styles.unitBtnActive]}
                        onPress={() => setStockUnit(unit)}
                      >
                        <Text style={[styles.unitBtnText, stockUnit === unit && styles.unitBtnTextActive]}>
                          {unit}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={styles.stockInfoText}>
                  * Залишок автоматично зменшується після підтвердження прийому
                </Text>
              </>
            )}
          </SectionCard>

          {/* ── Нагадування ── */}
          <SectionCard title="Нагадування" icon="bell-outline">
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Push-нагадування</Text>
                <Text style={styles.switchSub}>
                  З кнопками «Підтвердити» та «Відхилити» прямо у сповіщенні
                </Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: C.borderLight, true: C.softGreen }}
                thumbColor={reminderEnabled ? C.darkGreen : C.textTertiary}
              />
            </View>
          </SectionCard>

          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.saveBtnLoading]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.cream} />
            ) : (
              <>
                <Icon name={isEditing ? 'content-save' : 'plus-circle'} size={20} color={C.cream} />
                <Text style={styles.saveBtnText}>
                  {isEditing ? 'Зберегти зміни' : 'Додати ліки'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Time pickers ── */}
      {showTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerTime}
          mode="time"
          is24Hour
          display="spinner"
          locale="uk"
          onChange={onTimeChange}
        />
      )}
      {showTimePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(null)}>
                  <Text style={styles.modalCancel}>Скасувати</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Оберіть час</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(null)}>
                  <Text style={styles.modalDone}>Готово</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerTime}
                mode="time"
                is24Hour
                display="spinner"
                locale="uk"
                onChange={onTimeChange}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* ── Start date pickers ── */}
      {showStartPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="spinner"
          locale="uk"
          onChange={onStartDateChange}
        />
      )}
      {showStartPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                  <Text style={styles.modalCancel}>Скасувати</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Дата початку</Text>
                <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                  <Text style={styles.modalDone}>Готово</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                locale="uk"
                onChange={onStartDateChange}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* ── End date pickers ── */}
      {showEndPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={endDate ?? startDate}
          mode="date"
          display="spinner"
          locale="uk"
          minimumDate={startDate}
          onChange={onEndDateChange}
        />
      )}
      {showEndPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                  <Text style={styles.modalCancel}>Скасувати</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Дата кінця</Text>
                <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                  <Text style={styles.modalDone}>Готово</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={endDate ?? startDate}
                mode="date"
                display="spinner"
                locale="uk"
                minimumDate={startDate}
                onChange={onEndDateChange}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },
  scrollContent: { padding: 16, paddingBottom: 50 },

  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  sectionCardIcon: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: C.softGreen + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: C.text },

  input: { backgroundColor: C.creamLight, marginBottom: 10, fontSize: 15 },
  inputContent: { paddingTop: 6 },

  errText: {
    color: C.missed,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 6,
    marginLeft: 4,
    fontWeight: '600',
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: C.creamLight,
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 2,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabActive: { backgroundColor: C.darkGreen },
  tabText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  tabTextActive: { color: C.cream, fontWeight: '700' },

  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.creamLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  timePickerWarning: { borderColor: C.warn, backgroundColor: C.warnBg },
  timePickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  timePickerSmall: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },

  rowInputs: { flexDirection: 'row', gap: 10 },

  weekdaysRow: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  weekdayBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.creamLight,
    borderWidth: 1, borderColor: C.border,
  },
  weekdayBtnActive: { backgroundColor: C.darkGreen, borderColor: C.darkGreen },
  weekdayText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  weekdayTextActive: { color: C.cream },

  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.creamLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  datePickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },

  endDateRow: { marginBottom: 6 },
  endDateSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  endDateLabel: { fontSize: 14, fontWeight: '500', color: C.text },

  mealTimingRow: { gap: 8 },
  mealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: C.creamLight,
    borderWidth: 1,
    borderColor: C.border,
  },
  mealBtnActive: { backgroundColor: C.darkGreen, borderColor: C.darkGreen },
  mealBtnText: { fontSize: 14, fontWeight: '600', color: C.textSub },
  mealBtnTextActive: { color: C.cream },

  trackStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  trackStockLabel: { fontSize: 15, fontWeight: '600', color: C.text },

  unitRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, marginTop: 8 },
  unitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: C.creamLight,
    borderWidth: 1,
    borderColor: C.border,
  },
  unitBtnActive: { backgroundColor: C.darkGreen, borderColor: C.darkGreen },
  unitBtnText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  unitBtnTextActive: { color: C.cream },

  stockInfoText: {
    fontSize: 11,
    color: C.textSub,
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 3 },
  switchSub: { fontSize: 12, color: C.textSub, lineHeight: 17 },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.darkGreen,
    paddingVertical: 17,
    borderRadius: 22,
    gap: 10,
    marginTop: 6,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  saveBtnLoading: { opacity: 0.7 },
  saveBtnText: { color: C.cream, fontSize: 17, fontWeight: '800' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  modalCancel: { fontSize: 16, color: C.missed, fontWeight: '600' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalDone: { fontSize: 16, color: C.darkGreen, fontWeight: '700' },
});