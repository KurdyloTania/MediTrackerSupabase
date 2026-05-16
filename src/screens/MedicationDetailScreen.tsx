import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, Button, Chip, ActivityIndicator, List, IconButton } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import { useMedications } from '../context/MedicationsContext';
import { generateDoseSlotsForDateRange, formatTime, startOfDay, endOfDay } from '../utils/dateHelpers';
import { format, isSameDay } from 'date-fns';
import { useFocusEffect } from '@react-navigation/native';

export default function MedicationDetailScreen({ route, navigation }: any) {
  const { medicationId } = route.params;
  const { medications, doseLogs, logDose, skipDose, refetch } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  
  const medication = medications.find(m => m.id === medicationId);
  
  useFocusEffect(
    React.useCallback(() => {
      if (medication) {
        navigation.setOptions({ title: medication.name });
      }
    }, [medication, navigation])
  );
  
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };
  
  const calendarMarkedDates = useMemo(() => {
    if (!medication) return {};
    
    const marks: any = {};
    const now = new Date();
    const startDate = new Date(medication.start_date);
    const endDate = medication.end_date ? new Date(medication.end_date) : now;
    const start = startDate < new Date(now.getFullYear(), now.getMonth() - 1, 1) 
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1) 
      : startDate;
    const end = endDate > new Date(now.getFullYear(), now.getMonth() + 2, 0) 
      ? new Date(now.getFullYear(), now.getMonth() + 2, 0) 
      : endDate;
    
    const scheduledSlots = generateDoseSlotsForDateRange(medication, start, end);
    const scheduledByDay = new Map<string, number>();
    scheduledSlots.forEach(slot => {
      const dayKey = format(slot, 'yyyy-MM-dd');
      scheduledByDay.set(dayKey, (scheduledByDay.get(dayKey) || 0) + 1);
    });
    
    const takenByDay = new Map<string, number>();
    const logsForMed = doseLogs.filter(log => log.medication_id === medicationId);
    logsForMed.forEach(log => {
      if (log.taken_at) {
        const dayKey = format(new Date(log.scheduled_time), 'yyyy-MM-dd');
        takenByDay.set(dayKey, (takenByDay.get(dayKey) || 0) + 1);
      }
    });
    
    for (const [dayKey, scheduled] of scheduledByDay) {
      const taken = takenByDay.get(dayKey) || 0;
      if (taken === scheduled && scheduled > 0) {
        marks[dayKey] = { selected: true, selectedColor: '#4caf50' };
      } else if (taken < scheduled && scheduled > 0) {
        marks[dayKey] = { selected: true, selectedColor: '#f44336' };
      }
    }
    
    return marks;
  }, [medication, doseLogs, medicationId]);
  
  const upcomingDoses = useMemo(() => {
    if (!medication) return [];
    const now = new Date();
    const startDate = new Date(medication.start_date);
    const endDate = medication.end_date ? new Date(medication.end_date) : null;
    const doses = generateDoseSlotsForDateRange(medication, now, endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
    const takenLogs = doseLogs.filter(log => log.medication_id === medicationId && log.taken_at);
    const takenTimes = new Set(takenLogs.map(log => new Date(log.scheduled_time).getTime()));
    
    return doses.filter(dose => !takenTimes.has(dose.getTime())).slice(0, 10);
  }, [medication, doseLogs, medicationId]);
  
  const handleTake = async (scheduledTime: Date) => {
    await logDose(medicationId, scheduledTime);
  };
  
  const handleSkip = async (logId: string) => {
    await skipDose(logId);
  };
  
  if (!medication) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  const getFrequencyText = () => {
    const freq = medication.frequency;
    switch (freq.type) {
      case 'daily':
        return `Every day at ${freq.time}`;
      case 'interval':
        return `Every ${freq.hours} hours`;
      case 'custom':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const selected = freq.weekdays.map(d => days[d]).join(', ');
        return `${selected} at ${freq.time}`;
    }
  };
  
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">{medication.name}</Text>
          {medication.dosage && <Text variant="bodyMedium" style={styles.dosage}>Dosage: {medication.dosage}</Text>}
          <Chip icon="clock" style={styles.chip}>{getFrequencyText()}</Chip>
          {medication.notes && <Text variant="bodySmall" style={styles.notes}>{medication.notes}</Text>}
          <View style={styles.dates}>
            <Text variant="bodySmall">Start: {format(new Date(medication.start_date), 'MMM dd, yyyy')}</Text>
            {medication.end_date && (
              <Text variant="bodySmall">End: {format(new Date(medication.end_date), 'MMM dd, yyyy')}</Text>
            )}
          </View>
        </Card.Content>
      </Card>
      
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>Upcoming Doses</Text>
          {upcomingDoses.map((dose, index) => (
            <View key={index} style={styles.doseItem}>
              <Text>{format(dose, 'MMM dd, h:mm a')}</Text>
              <Button mode="contained" compact onPress={() => handleTake(dose)}>
                Take
              </Button>
            </View>
          ))}
          {upcomingDoses.length === 0 && (
            <Text style={styles.emptyText}>No upcoming doses scheduled</Text>
          )}
        </Card.Content>
      </Card>
      
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>Adherence History</Text>
          <Calendar
            markedDates={calendarMarkedDates}
            theme={{
              selectedDayBackgroundColor: '#4caf50',
              todayTextColor: '#2196f3',
              arrowColor: '#2196f3',
            }}
            style={styles.calendar}
          />
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#4caf50' }]} />
              <Text>All doses taken</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: '#f44336' }]} />
              <Text>Missed doses</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    marginBottom: 8,
  },
  dosage: {
    marginTop: 4,
    opacity: 0.7,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  notes: {
    marginTop: 8,
    fontStyle: 'italic',
  },
  dates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  doseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  emptyText: {
    textAlign: 'center',
    padding: 16,
    opacity: 0.5,
  },
  calendar: {
    borderRadius: 8,
    marginBottom: 16,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});