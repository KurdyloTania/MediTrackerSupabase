import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Share, Alert } from 'react-native';
import { Text, Card, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useMedications } from '../context/MedicationsContext';
import AdherenceChart from '../components/AdherenceChart';
import { getAdherenceSummary } from '../services/adherenceCalculator';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';

export default function ReportsScreen() {
  const { medications, doseLogs, refetch, isLoading } = useMedications();
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  
  const loadSummary = useCallback(async () => {
    if (medications.length === 0) return;
    const result = await getAdherenceSummary(medications, doseLogs);
    setSummary(result);
  }, [medications, doseLogs]);
  
  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    await loadSummary();
    setRefreshing(false);
  };
  
  const exportData = async () => {
    if (!Sharing.isAvailableAsync()) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }
    
    setExporting(true);
    try {
      const data = {
        medications,
        doseLogs,
        exportDate: new Date().toISOString(),
      };
      const jsonString = JSON.stringify(data, null, 2);
      const fileName = `meditracker_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
      
      await Sharing.shareAsync(fileName, {
        mimeType: 'application/json',
        dialogTitle: 'Export Medication Data',
      });
      
      setSnackbar({ visible: true, message: 'Export ready to share' });
    } catch (error) {
      Alert.alert('Export Failed', 'Could not export data');
    } finally {
      setExporting(false);
    }
  };
  
  if (isLoading && medications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  if (medications.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge">Add medications to see adherence reports</Text>
      </View>
    );
  }
  
  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {summary && (
        <>
          <AdherenceChart
            weeklyData={summary.weeklyData}
            todayPercentage={summary.todayPercentage}
          />
          
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.statsTitle}>Today's Summary</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text variant="displaySmall">{summary.todayTaken}</Text>
                  <Text variant="bodySmall">Taken</Text>
                </View>
                <View style={styles.stat}>
                  <Text variant="displaySmall">{summary.todayScheduled}</Text>
                  <Text variant="bodySmall">Scheduled</Text>
                </View>
                <View style={styles.stat}>
                  <Text variant="displaySmall">{Math.round(summary.todayPercentage)}%</Text>
                  <Text variant="bodySmall">Adherence</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
          
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.statsTitle}>Last 7 Days Overview</Text>
              {summary.weeklyData.map((day: any, index: number) => (
                <View key={index} style={styles.dayRow}>
                  <Text style={styles.dayLabel}>{format(day.date, 'EEEE, MMM dd')}</Text>
                  <View style={styles.dayStats}>
                    <Text>{day.taken}/{day.scheduled}</Text>
                    <Text style={[styles.percent, { color: day.percentage >= 80 ? '#4caf50' : day.percentage >= 50 ? '#ff9800' : '#f44336' }]}>
                      {Math.round(day.percentage)}%
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        </>
      )}
      
      <Button
        mode="contained"
        onPress={exportData}
        loading={exporting}
        icon="export"
        style={styles.exportButton}
      >
        Export Data (JSON)
      </Button>
      
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
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
    padding: 32,
  },
  card: {
    margin: 16,
    marginBottom: 8,
  },
  statsTitle: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dayLabel: {
    flex: 2,
    fontSize: 14,
  },
  dayStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percent: {
    fontWeight: 'bold',
    marginLeft: 8,
  },
  exportButton: {
    margin: 16,
    marginTop: 24,
    paddingVertical: 8,
  },
});