// src/screens/HomeScreen.tsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  Alert, StatusBar, Platform,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, startOfDay, isAfter, isBefore, addDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import { useFocusEffect } from '@react-navigation/native';
import { useMedications } from '../context/MedicationsContext';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme/colors';
import { generateScheduleForDateRange } from '../utils/dateHelpers';
import { isLowStock, Medication, DoseLog } from '../types';
import SettingsModal from '../components/SettingsModal';

const C = COLORS;

interface DoseInfo {
  dose: Date | null;
  isDue: boolean;
  isTaken: boolean;
  minutesUntil: number;
}

interface MedicationWithDose {
  medication: Medication;
  nextDose: Date | null;
  isDue: boolean;
  isTaken: boolean;
  stockLow: boolean;
  hasDoseToday: boolean;
  futureDose: Date | null;
  minutesUntil: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Доброго ранку';
  if (h < 17) return 'Добрий день';
  if (h < 22) return 'Добрий вечір';
  return 'Доброї ночі';
}

function isDoseDue(doseTime: Date, now: Date): boolean {
  const diffMinutes = (now.getTime() - doseTime.getTime()) / (60 * 1000);
  return diffMinutes >= 0 && diffMinutes <= 60;
}

function getMinutesUntil(doseTime: Date, now: Date): number {
  return Math.round((doseTime.getTime() - now.getTime()) / (60 * 1000));
}

function getNextDose(
  medication: Medication,
  doseLogs: DoseLog[],
  fromDate: Date,
  toDate: Date
): DoseInfo {
  const now = new Date();
  const doses = generateScheduleForDateRange(
    medication.frequency,
    new Date(medication.start_date),
    medication.end_date ? new Date(medication.end_date) : null,
    fromDate,
    toDate
  );

  for (const dose of doses) {
    const isoTime = dose.toISOString();
    const existing = doseLogs.find(
      l => l.medication_id === medication.id && l.scheduled_time === isoTime
    );
    if (existing?.status === 'taken') continue;
    if (existing?.status === 'missed') continue;

    const due = isDoseDue(dose, now);
    const minutesUntil = getMinutesUntil(dose, now);

    if (isAfter(dose, now) || due) {
      return { dose, isDue: due, isTaken: false, minutesUntil };
    }
  }
  return { dose: null, isDue: false, isTaken: false, minutesUntil: 0 };
}

function getFutureDose(
  medication: Medication,
  doseLogs: DoseLog[],
  fromDate: Date,
  toDate: Date
): Date | null {
  const doses = generateScheduleForDateRange(
    medication.frequency,
    new Date(medication.start_date),
    medication.end_date ? new Date(medication.end_date) : null,
    fromDate,
    toDate
  );
  for (const dose of doses) {
    const isoTime = dose.toISOString();
    const existing = doseLogs.find(
      l => l.medication_id === medication.id && l.scheduled_time === isoTime
    );
    if (existing?.status === 'taken') continue;
    if (existing?.status === 'missed') continue;
    return dose;
  }
  return null;
}

function getMealIcon(mealTiming: string): string {
  switch (mealTiming) {
    case 'before_meal': return 'silverware-fork-knife';
    case 'with_meal': return 'food';
    case 'after_meal': return 'food-apple';
    default: return 'clock-outline';
  }
}

function getMealText(mealTiming: string): string {
  switch (mealTiming) {
    case 'before_meal': return 'До їжі';
    case 'with_meal': return 'Під час їжі';
    case 'after_meal': return 'Після їжі';
    default: return 'Без прив\'язки';
  }
}

function getWaitText(minutesUntil: number): string {
  if (minutesUntil <= 0) return 'Зараз!';
  if (minutesUntil < 60) return `Через ${minutesUntil} хв`;
  const hours = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  if (mins === 0) return `Через ${hours} год`;
  return `Через ${hours} год ${mins} хв`;
}

function getUserFirstName(user: any): string {
  const fullName: string =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    '';
  return fullName.split(' ')[0] || 'Користувач';
}

export default function HomeScreen({ navigation }: any) {
  const { medications, doseLogs, logDose, refetch } = useMedications();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [takingMap, setTakingMap] = useState<Record<string, boolean>>({});
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const activeMedications = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    return medications.filter(med => {
      if (!med.end_date) return true;
      const end = new Date(med.end_date);
      end.setHours(23, 59, 59, 999);
      return end >= todayStart;
    });
  }, [medications]);

  const { todayMeds, futureMeds } = useMemo(() => {
    void tick;

    const now = new Date();
    const todayStart = startOfDay(now);
    const futureStart = startOfDay(addDays(now, 1));
    const futureEnd = startOfDay(addDays(now, 7));

    const todayResult: MedicationWithDose[] = [];
    const futureResult: MedicationWithDose[] = [];

    for (const med of activeMedications) {
      const { dose, isDue, isTaken, minutesUntil } = getNextDose(
        med, doseLogs, todayStart, futureEnd
      );
      const futureDose = getFutureDose(med, doseLogs, futureStart, futureEnd);

      const medWithDose: MedicationWithDose = {
        medication: med,
        nextDose: dose,
        isDue,
        isTaken,
        stockLow: isLowStock(med),
        hasDoseToday: !!dose,
        futureDose,
        minutesUntil,
      };

      if (dose && isAfter(dose, todayStart) && isBefore(dose, futureStart)) {
        todayResult.push(medWithDose);
      } else if (futureDose) {
        futureResult.push(medWithDose);
      }
    }

    todayResult.sort((a, b) =>
      (a.nextDose?.getTime() ?? 0) - (b.nextDose?.getTime() ?? 0)
    );
    futureResult.sort((a, b) =>
      (a.futureDose?.getTime() ?? 0) - (b.futureDose?.getTime() ?? 0)
    );

    return { todayMeds: todayResult, futureMeds: futureResult };
  }, [activeMedications, doseLogs, tick]);

  const handleTake = async (medicationId: string, scheduledTime: Date) => {
    const key = `${medicationId}-${scheduledTime.getTime()}`;
    if (takingMap[key]) return;

    const now = new Date();
    const diffMinutes = (now.getTime() - scheduledTime.getTime()) / (60 * 1000);

    if (diffMinutes < 0) {
      const mins = Math.ceil(-diffMinutes);
      Alert.alert('Ще не час', `До прийому залишилось ${mins} хв.`);
      return;
    }

    if (diffMinutes > 60) {
      Alert.alert('Пропущено', 'Час прийому минув. Доза вважається пропущеною.');
      return;
    }

    setTakingMap(prev => ({ ...prev, [key]: true }));
    try {
      await logDose(medicationId, scheduledTime);
    } catch (error: any) {
      Alert.alert('Помилка', error?.message || 'Не вдалося записати прийом');
    } finally {
      setTakingMap(prev => {
        const m = { ...prev };
        delete m[key];
        return m;
      });
    }
  };

  const pendingCount = useMemo(
    () => todayMeds.filter(m => m.isDue && !m.isTaken).length,
    [todayMeds]
  );

  const firstName = getUserFirstName(user);
  const todayDateStr = format(new Date(), 'EEEE, d MMMM', { locale: uk });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.headerTitle}>{firstName}</Text>
            <Text style={styles.headerDate}>{todayDateStr}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setSettingsVisible(true)}
          >
            <Icon name="cog-outline" size={24} color={C.cream} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[C.softGreen]}
            tintColor={C.softGreen}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeMedications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Icon name="pill" size={44} color={C.softGreen} />
            </View>
            <Text style={styles.emptyStateTitle}>Немає ліків</Text>
            <Text style={styles.emptyStateText}>
              Додайте свої перші ліки, натиснувши кнопку «+» внизу
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => navigation.navigate('AddEditMedication')}
            >
              <Icon name="plus" size={18} color={C.white} />
              <Text style={styles.emptyAddBtnText}>Додати ліки</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {todayMeds.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Icon name="calendar-today" size={16} color={C.softGreen} />
                  </View>
                  <Text style={styles.sectionTitle}>Сьогодні</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{todayMeds.length}</Text>
                  </View>
                </View>

                {todayMeds.map(item => {
                  const med = item.medication;
                  const cardKey = `${med.id}-${item.nextDose?.getTime() ?? 'no'}`;
                  const isTaking = item.nextDose
                    ? !!takingMap[`${med.id}-${item.nextDose.getTime()}`]
                    : false;
                  const timeStr = item.nextDose
                    ? format(item.nextDose, 'HH:mm')
                    : null;

                  const isWaiting = !item.isDue && !item.isTaken && item.nextDose !== null;
                  const isDueNow = item.isDue && !item.isTaken;
                  
                  const minutesOverdue = item.isDue && item.nextDose
                    ? Math.floor((new Date().getTime() - item.nextDose.getTime()) / (60 * 1000))
                    : 0;
                  
                  const isLate = minutesOverdue > 15;

                  return (
                    <TouchableOpacity
                      key={cardKey}
                      style={[
                        styles.card,
                        isLate && styles.cardLate,
                        isWaiting && styles.cardWaiting,
                        isDueNow && styles.cardUrgent,
                      ]}
                      onPress={() =>
                        navigation.navigate('MedicationDetail', { medicationId: med.id })
                      }
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.cardAccent,
                          {
                            backgroundColor: isDueNow 
                              ? (isLate ? C.missed : C.warn)
                              : isLate
                              ? C.missed
                              : isWaiting
                              ? C.lightGreen
                              : C.softGreen,
                          },
                        ]}
                      />

                      <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                          <View style={styles.medInfo}>
                            <Text style={styles.medName} numberOfLines={1}>
                              {med.name}
                            </Text>
                            {med.dosage && (
                              <View style={styles.dosageBadge}>
                                <Text style={styles.dosageText}>{med.dosage}</Text>
                              </View>
                            )}
                          </View>
                          {item.stockLow && (
                            <Icon name="alert-circle" size={18} color={C.warn} />
                          )}
                        </View>

                        <View style={styles.doseInfo}>
                          <View style={styles.mealBadge}>
                            <Icon
                              name={getMealIcon(med.meal_timing || 'any_time')}
                              size={12}
                              color={isDueNow ? C.warn : (isLate ? C.missed : C.darkGreen)}
                            />
                            <Text
                              style={[
                                styles.mealText,
                                isDueNow && { color: C.warn },
                                isLate && { color: C.missed },
                              ]}
                            >
                              {getMealText(med.meal_timing || 'any_time')}
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.timeText,
                              isDueNow && styles.timeTextUrgent,
                              isLate && styles.timeTextLate,
                              isWaiting && styles.timeTextWaiting,
                            ]}
                          >
                            {timeStr}
                          </Text>

                          {isDueNow && (
                            <View style={styles.nowBadge}>
                              <Icon name="bell-ring" size={12} color={C.warn} />
                              <Text style={styles.nowBadgeText}>ЗАРАЗ</Text>
                            </View>
                          )}

                          {isLate && !isDueNow && (
                            <View style={styles.lateBadge}>
                              <Icon name="alert" size={10} color={C.missed} />
                              <Text style={styles.lateBadgeText}>Запізнення</Text>
                            </View>
                          )}
                        </View>

                        {item.isTaken && (
                          <View style={styles.statusBadge}>
                            <Icon name="check-circle" size={16} color={C.taken} />
                            <Text style={styles.statusText}>Виконано</Text>
                          </View>
                        )}

                        {isWaiting && (
                          <TouchableOpacity
                            style={styles.waitButton}
                            disabled
                            activeOpacity={1}
                          >
                            <Icon name="clock-time-four-outline" size={16} color={C.midGreen} />
                            <Text style={styles.waitButtonText}>
                              {getWaitText(item.minutesUntil)}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {isDueNow && (
                          <TouchableOpacity
                            style={[
                              styles.takeButton,
                              isLate ? styles.takeButtonLate : styles.takeButtonUrgent,
                            ]}
                            onPress={() => handleTake(med.id, item.nextDose!)}
                            disabled={isTaking}
                            activeOpacity={0.8}
                          >
                            {isTaking ? (
                              <ActivityIndicator size="small" color={C.white} />
                            ) : (
                              <>
                                <Icon name="alarm" size={20} color={C.white} />
                                <Text style={styles.takeButtonText}>
                                  {isLate 
                                    ? `Прийняти (запізнення ${minutesOverdue} хв)` 
                                    : minutesOverdue === 0 
                                    ? 'ПРИЙНЯТИ ЗАРАЗ' 
                                    : `Прийняти (${minutesOverdue} хв тому)`}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {futureMeds.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Icon name="calendar-week" size={16} color={C.softGreen} />
                  </View>
                  <Text style={styles.sectionTitle}>Найближчі дні</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{futureMeds.length}</Text>
                  </View>
                </View>

                {futureMeds.map(item => {
                  const med = item.medication;
                  const dateStr = item.futureDose
                    ? format(item.futureDose, 'EEEE, HH:mm', { locale: uk })
                    : '';

                  return (
                    <TouchableOpacity
                      key={`${med.id}-future`}
                      style={[styles.card, styles.cardFuture]}
                      onPress={() =>
                        navigation.navigate('MedicationDetail', { medicationId: med.id })
                      }
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.cardAccent,
                          { backgroundColor: C.lightGreen },
                        ]}
                      />
                      <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                          <View style={styles.medInfo}>
                            <Text style={styles.medName} numberOfLines={1}>
                              {med.name}
                            </Text>
                            {med.dosage && (
                              <View style={styles.dosageBadge}>
                                <Text style={styles.dosageText}>{med.dosage}</Text>
                              </View>
                            )}
                          </View>
                          {item.stockLow && (
                            <Icon name="alert-circle" size={18} color={C.warn} />
                          )}
                        </View>

                        <View style={styles.doseInfo}>
                          <View style={styles.mealBadge}>
                            <Icon
                              name={getMealIcon(med.meal_timing || 'any_time')}
                              size={12}
                              color={C.darkGreen}
                            />
                            <Text style={styles.mealText}>
                              {getMealText(med.meal_timing || 'any_time')}
                            </Text>
                          </View>
                          <View style={styles.futureDateBadge}>
                            <Icon name="calendar" size={12} color={C.textSub} />
                            <Text style={styles.futureDateText}>{dateStr}</Text>
                          </View>
                        </View>

                        <View style={styles.futureStatusBadge}>
                          <Icon name="clock-time-four" size={14} color={C.midGreen} />
                          <Text style={styles.futureStatusText}>Заплановано</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {todayMeds.length === 0 && futureMeds.length === 0 && activeMedications.length > 0 && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="calendar-check" size={44} color={C.softGreen} />
                </View>
                <Text style={styles.emptyStateTitle}>Все виконано!</Text>
                <Text style={styles.emptyStateText}>
                  На найближчі 7 днів немає запланованих прийомів
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.calendarButton}
              onPress={() => navigation.navigate('Календар')}
            >
              <Icon name="calendar-month" size={20} color={C.darkGreen} />
              <Text style={styles.calendarButtonText}>Повний розклад</Text>
              <Icon name="chevron-right" size={18} color={C.darkGreen} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddEditMedication')}
        activeOpacity={0.8}
      >
        <Icon name="plus" size={28} color={C.white} />
      </TouchableOpacity>

      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.creamLight },

  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 58 : 36,
    paddingBottom: 18,
    backgroundColor: C.darkGreen,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greeting: { fontSize: 13, color: C.cream + 'bb', marginBottom: 2 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: C.cream, letterSpacing: -0.5, marginBottom: 2 },
  headerDate: { fontSize: 13, color: C.cream + '99', textTransform: 'capitalize' },
  settingsButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },

  scrollContent: { padding: 16, paddingBottom: 100 },

  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12, paddingHorizontal: 2,
  },
  sectionIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: C.softGreen + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: C.text, flex: 1 },
  sectionBadge: {
    backgroundColor: C.darkGreen + '15', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 12,
  },
  sectionBadgeText: { fontSize: 12, fontWeight: '700', color: C.darkGreen },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 32,
    backgroundColor: C.softGreen + '18',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: C.softGreen + '30',
  },
  emptyStateTitle: {
    fontSize: 22, fontWeight: '800', color: C.text,
    letterSpacing: -0.3,
  },
  emptyStateText: {
    fontSize: 14, color: C.textSub, textAlign: 'center',
    paddingHorizontal: 20, lineHeight: 21,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.darkGreen,
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 18, marginTop: 6,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  emptyAddBtnText: { color: C.cream, fontWeight: '700', fontSize: 15 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardUrgent: { 
    borderWidth: 2, 
    borderColor: C.warn,
    backgroundColor: C.warnBg,
  },
  cardLate: { borderWidth: 1, borderColor: C.missed + '66', backgroundColor: C.missedBg },
  cardWaiting: { opacity: 0.85 },
  cardFuture: { opacity: 0.82 },
  cardAccent: { width: 6 },
  cardContent: { flex: 1, padding: 14 },

  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  medInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  medName: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  dosageBadge: {
    backgroundColor: C.softGreen + '22', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 8,
  },
  dosageText: { fontSize: 11, fontWeight: '700', color: C.midGreen },

  doseInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12, flexWrap: 'wrap',
  },
  mealBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.softGreen + '15', paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 8,
  },
  mealText: { fontSize: 11, fontWeight: '600', color: C.darkGreen },
  timeText: { fontSize: 16, fontWeight: '800', color: C.text },
  timeTextUrgent: { fontSize: 18, fontWeight: '900', color: C.warn },
  timeTextLate: { color: C.missed, textDecorationLine: 'line-through' },
  timeTextWaiting: { color: C.midGreen },
  
  nowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.warnBg, paddingHorizontal: 8, 
    paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: C.warn,
  },
  nowBadgeText: { fontSize: 10, fontWeight: '900', color: C.warn },
  
  lateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.missedBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  lateBadgeText: { fontSize: 10, fontWeight: '700', color: C.missed },

  takeButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  takeButtonUrgent: { 
    backgroundColor: C.warn,
    borderWidth: 1, borderColor: C.white + '30',
  },
  takeButtonLate: { backgroundColor: C.missed, opacity: 0.9 },
  takeButtonText: { fontSize: 13, fontWeight: '700', color: C.white, letterSpacing: 0.3 },

  waitButton: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 8,
    backgroundColor: C.softGreen + '18',
    paddingVertical: 11, 
    borderRadius: 14,
    borderWidth: 1.5, 
    borderColor: C.softGreen + '55',
  },
  waitButtonText: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: C.midGreen,
  },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, backgroundColor: C.takenBg, borderRadius: 14,
  },
  statusText: { fontSize: 13, fontWeight: '700', color: C.taken },

  futureDateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.borderLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  futureDateText: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  futureStatusBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, backgroundColor: C.softGreen + '12', borderRadius: 12,
  },
  futureStatusText: { fontSize: 12, fontWeight: '700', color: C.midGreen },

  calendarButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.surface, paddingVertical: 14, borderRadius: 14, marginTop: 6,
    borderWidth: 1, borderColor: C.border,
  },
  calendarButtonText: { fontSize: 14, fontWeight: '600', color: C.darkGreen },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: C.softGreen,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.darkGreen, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },
});