import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { FAB, Text, ActivityIndicator, Portal, Dialog, Button } from 'react-native-paper';
import { useMedications } from '../context/MedicationsContext';
import MedicationCard from '../components/MedicationCard';
import { getNextDoseTimes, isDoseDue, startOfDay } from '../utils/dateHelpers';
import { Medication, DoseLog } from '../types';

export default function HomeScreen({ navigation }: any) {
  const { medications, doseLogs, logDose, deleteMedication, refetch, isLoading } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ visible: boolean; medicationId?: string }>({ visible: false });
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);
  
  const getTakenLogsMap = useMemo(() => {
    const takenMap = new Map<string, boolean>();
    doseLogs.forEach(log => {
      if (log.taken_at) {
        takenMap.set(log.scheduled_time, true);
      }
    });
    return takenMap;
  }, [doseLogs]);
  
  const getNextDoseForMedication = (med: Medication): Date | null => {
    const now = new Date();
    const startDate = new Date(med.start_date);
    const endDate = med.end_date ? new Date(med.end_date) : null;
    const doses = getNextDoseTimes(med.frequency, startDate, endDate, now, 5);
    
    for (const dose of doses) {
      const doseKey = dose.toISOString();
      if (!getTakenLogsMap.has(doseKey)) {
        return dose;
      }
    }
    return null;
  };
  
  const handleTake = async (medication: Medication, nextDose: Date) => {
    await logDose(medication.id, nextDose);
  };
  
  const handleDelete = (medicationId: string) => {
    setDeleteDialog({ visible: true, medicationId });
  };
  
  const confirmDelete = async () => {
    if (deleteDialog.medicationId) {
      await deleteMedication(deleteDialog.medicationId);
    }
    setDeleteDialog({ visible: false });
  };
  
  const todayDoses = useMemo(() => {
    const today = startOfDay(new Date());
    const todayEnd = new Date(today);
    todayEnd.setDate(todayEnd.getDate() + 1);
    
    return medications.filter(med => {
      const nextDose = getNextDoseForMedication(med);
      return nextDose && nextDose >= today && nextDose < todayEnd;
    });
  }, [medications, getNextDoseForMedication]);
  
  const upcomingDoses = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    return medications.filter(med => {
      const nextDose = getNextDoseForMedication(med);
      return nextDose && nextDose >= tomorrow;
    });
  }, [medications, getNextDoseForMedication]);
  
  const renderSection = (title: string, meds: Medication[]) => {
    if (meds.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text variant="titleLarge" style={styles.sectionTitle}>{title}</Text>
        {meds.map(med => {
          const nextDose = getNextDoseForMedication(med);
          if (!nextDose) return null;
          
          return (
            <MedicationCard
              key={med.id}
              medication={med}
              nextDoseTime={nextDose}
              onTake={() => handleTake(med, nextDose)}
              onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
              onDelete={() => handleDelete(med.id)}
            />
          );
        })}
      </View>
    );
  };
  
  if (isLoading && medications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <>
            {renderSection("Today's Doses", todayDoses)}
            {renderSection('Upcoming Doses', upcomingDoses)}
            {medications.length === 0 && (
              <View style={styles.empty}>
                <Text variant="bodyLarge">No medications yet. Tap + to add your first medication.</Text>
              </View>
            )}
          </>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
      />
      
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddEditMedication')}
      />
      
      <Portal>
        <Dialog visible={deleteDialog.visible} onDismiss={() => setDeleteDialog({ visible: false })}>
          <Dialog.Title>Delete Medication</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete this medication? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialog({ visible: false })}>Cancel</Button>
            <Button onPress={confirmDelete} textColor="red">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
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
  listContent: {
    paddingBottom: 80,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    marginLeft: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});