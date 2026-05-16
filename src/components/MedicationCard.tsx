import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Chip, useTheme } from 'react-native-paper';
import { format } from 'date-fns';
import { Medication } from '../types';
import { isDoseDue, isDoseUpcoming } from '../utils/dateHelpers';

interface MedicationCardProps {
  medication: Medication;
  nextDoseTime: Date | null;
  onTake: () => void;
  onPress: () => void;
  onDelete: () => void;
}

export default function MedicationCard({ medication, nextDoseTime, onTake, onPress, onDelete }: MedicationCardProps) {
  const theme = useTheme();
  
  const getFrequencyText = () => {
    const freq = medication.frequency;
    switch (freq.type) {
      case 'daily':
        return `Daily at ${freq.time}`;
      case 'interval':
        return `Every ${freq.hours} hours`;
      case 'custom':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const selected = freq.weekdays.map(d => days[d]).join(', ');
        return `${selected} at ${freq.time}`;
      default:
        return '';
    }
  };
  
  const isTakeEnabled = nextDoseTime ? isDoseDue(nextDoseTime) : false;
  const isUpcoming = nextDoseTime ? isDoseUpcoming(nextDoseTime) : false;
  
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleLarge" style={styles.name}>{medication.name}</Text>
          <Chip icon="clock" style={styles.chip}>{getFrequencyText()}</Chip>
        </View>
        
        {medication.dosage && (
          <Text variant="bodyMedium" style={styles.dosage}>Dosage: {medication.dosage}</Text>
        )}
        
        {nextDoseTime && (
          <View style={styles.nextDose}>
            <Text variant="bodySmall" style={{ color: isTakeEnabled ? theme.colors.error : isUpcoming ? theme.colors.primary : theme.colors.outline }}>
              Next dose: {format(nextDoseTime, 'MMM dd, h:mm a')}
              {isTakeEnabled && ' (Due now)'}
              {isUpcoming && !isTakeEnabled && ' (Upcoming)'}
            </Text>
          </View>
        )}
        
        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={onTake}
            disabled={!isTakeEnabled}
            style={styles.takeButton}
          >
            ✓ Taken
          </Button>
          <Button mode="outlined" onPress={onDelete} textColor={theme.colors.error}>
            Delete
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  name: {
    flex: 1,
    marginRight: 8,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  dosage: {
    marginBottom: 4,
    opacity: 0.7,
  },
  nextDose: {
    marginTop: 8,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  takeButton: {
    flex: 1,
    marginRight: 8,
  },
});