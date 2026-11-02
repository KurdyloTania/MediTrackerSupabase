import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, isToday, isTomorrow } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Medication, isLowStock } from '../types';
import { isDoseDue } from '../utils/dateHelpers';
import { COLORS } from '../theme/colors';

const C = COLORS;

const MED_COLORS = [C.softGreen, C.midGreen, C.darkGreen2, '#4CAF50', '#66BB6A', '#81C784'];

function getMedColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return MED_COLORS[Math.abs(h) % MED_COLORS.length];
}

function formatDoseTime(d: Date): string {
  if (isToday(d)) return `Сьогодні · ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `Завтра · ${format(d, 'HH:mm')}`;
  return format(d, 'EEE d MMM · HH:mm', { locale: uk });
}

interface Props {
  medication: Medication;
  nextDoseTime: Date | null;
  isTaken: boolean;
  showTakeBtn?: boolean;
  onTake: () => Promise<void> | void;
  onPress: () => void;
  onDelete?: () => void;
}

export default function MedicationCard({
  medication,
  nextDoseTime,
  isTaken: initialIsTaken,
  showTakeBtn = true,
  onTake,
  onPress,
  onDelete,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const accentColor = getMedColor(medication.id);
  const stockLow = isLowStock(medication);
  
  const [isTaking, setIsTaking] = useState(false);
  const [isTaken, setIsTaken] = useState(initialIsTaken);

  useEffect(() => {
    setIsTaken(initialIsTaken);
  }, [initialIsTaken]);

  const now = new Date();
  const isDue = nextDoseTime ? isDoseDue(nextDoseTime, now) : false;
  const canTake = isDue && !isTaken && nextDoseTime !== null && !isTaking;

  const isFutureDose = nextDoseTime !== null && nextDoseTime.getTime() > now.getTime();
  const showDisabledBtn = showTakeBtn && !isTaken && !isDue && isFutureDose;
  const showActiveBtn = showTakeBtn && canTake;

  const onPressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  const handleTakePress = async (e: any) => {
    e.stopPropagation();
    if (isTaking || isTaken || !canTake) return;

    setIsTaking(true);
    setIsTaken(true); // Оптимістичне оновлення

    try {
      await onTake();
    } catch (error) {
      console.error('Take failed:', error);
      setIsTaken(false); // Відкат при помилці
    } finally {
      setIsTaking(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
    >
      <Animated.View style={[
        styles.card,
        isDue && !isTaken && styles.cardDue,
        isTaken && styles.cardTaken,
        { transform: [{ scale: scaleAnim }] },
      ]}>
        <View style={[styles.leftBar, { 
          backgroundColor: isTaken ? C.taken : isDue && !isTaken ? C.missed : accentColor 
        }]} />

        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={[styles.avatar, { backgroundColor: accentColor + '20' }]}>
              <Icon name="pill" size={20} color={accentColor} />
            </View>

            <View style={styles.mainInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{medication.name}</Text>
                {stockLow && (
                  <View style={styles.stockWarn}>
                    <Icon name="alert-circle" size={12} color={C.warn} />
                    <Text style={styles.stockWarnText}>Мало</Text>
                  </View>
                )}
              </View>

              {medication.dosage && (
                <View style={[styles.dosagePill, { backgroundColor: accentColor + '18' }]}>
                  <Text style={[styles.dosageText, { color: accentColor }]}>{medication.dosage}</Text>
                </View>
              )}
            </View>

            {onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="trash-can-outline" size={16} color={C.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.timeWrap}>
              {nextDoseTime ? (
                <>
                  <Icon
                    name={isDue && !isTaken ? 'alarm' : isFutureDose ? 'clock-outline' : 'clock-alert-outline'}
                    size={13}
                    color={isDue && !isTaken ? C.missed : isTaken ? C.taken : isFutureDose ? C.textSub : C.warn}
                  />
                  <Text style={[
                    styles.timeText,
                    isDue && !isTaken && { color: C.missed, fontWeight: '700' },
                    isTaken && { color: C.taken, fontWeight: '700' },
                    !isFutureDose && !isDue && !isTaken && { color: C.warn },
                  ]}>
                    {formatDoseTime(nextDoseTime)}
                    {!isFutureDose && !isDue && !isTaken ? ' · не підтверджено' : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Icon name="check-all" size={13} color={C.taken} />
                  <Text style={[styles.timeText, { color: C.taken }]}>Всі прийнято</Text>
                </>
              )}
            </View>

            {/* Активна кнопка */}
            {showActiveBtn && (
              <TouchableOpacity
                style={[styles.takeBtn, { backgroundColor: C.missed }]}
                onPress={handleTakePress}
                activeOpacity={0.82}
                disabled={isTaking}
              >
                {isTaking ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <>
                    <Icon name="check" size={15} color={C.white} />
                    <Text style={styles.takeBtnText}>Прийняти!</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Неактивна кнопка */}
            {showDisabledBtn && (
              <View style={[styles.takeBtn, styles.takeBtnDisabled]}>
                <Icon name="clock-outline" size={15} color={C.textTertiary} />
                <Text style={styles.takeBtnTextDisabled}>Прийняти</Text>
              </View>
            )}

            {isTaken && (
              <View style={styles.takenBadge}>
                <Icon name="check-circle" size={14} color={C.taken} />
                <Text style={styles.takenBadgeText}>Прийнято</Text>
              </View>
            )}
          </View>

          {stockLow && medication.stock_quantity != null && (
            <View style={styles.stockRow}>
              <Icon name="package-variant" size={12} color={C.warn} />
              <Text style={styles.stockText}>
                Залишок: {medication.stock_quantity} {medication.stock_unit}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    flexDirection: 'row',
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  cardDue: {
    borderColor: C.missed + '55',
    shadowColor: C.missed,
    shadowOpacity: 0.1,
  },
  cardTaken: {
    borderColor: C.taken + '44',
    opacity: 0.85,
  },
  leftBar: { width: 5 },
  body: { flex: 1, paddingHorizontal: 14, paddingVertical: 13 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  mainInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '700', color: C.text, flex: 1 },
  stockWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.warnBg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  stockWarnText: { fontSize: 10, fontWeight: '700', color: C.warn },
  dosagePill: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dosageText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: C.creamLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.borderLight,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  timeText: { fontSize: 12, color: C.textSub, fontWeight: '500' },
  takeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
  },
  takeBtnDisabled: {
    backgroundColor: C.borderLight,
  },
  takeBtnText: { fontSize: 12, fontWeight: '700', color: C.white },
  takeBtnTextDisabled: { fontSize: 12, fontWeight: '600', color: C.textTertiary },
  takenBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.takenBg, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 12,
  },
  takenBadgeText: { fontSize: 12, fontWeight: '700', color: C.taken },
  stockRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, backgroundColor: C.warnBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  stockText: { fontSize: 11, color: C.warn, fontWeight: '600' },
});


