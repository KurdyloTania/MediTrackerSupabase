import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { TextInput, Button, Text, SegmentedButtons, Chip, HelperText, Portal, Dialog } from 'react-native-paper';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { medicationSchema, MedicationFormData } from '../utils/validation';
import { useMedications } from '../context/MedicationsContext';
import { Medication, MedicationInsert, MedicationUpdate } from '../types';
import { format } from 'date-fns';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AddEditMedicationScreen({ route, navigation }: any) {
  const medication = route.params?.medication as Medication | undefined;
  const { addMedication, updateMedication } = useMedications();
  const [frequencyType, setFrequencyType] = useState<'daily' | 'interval' | 'custom'>(medication?.frequency.type || 'daily');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState<'start' | 'end' | null>(null);
  const [selectedTime, setSelectedTime] = useState(() => {
    if (medication?.frequency.type === 'daily' || medication?.frequency.type === 'custom') {
      return (medication.frequency as any).time || '09:00';
    }
    return '09:00';
  });
  const [intervalHours, setIntervalHours] = useState(() => {
    if (medication?.frequency.type === 'interval') {
      return String((medication.frequency as any).hours);
    }
    return '8';
  });
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() => {
    if (medication?.frequency.type === 'custom') {
      return (medication.frequency as any).weekdays || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  
  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<MedicationFormData>({
    resolver: zodResolver(medicationSchema),
    defaultValues: {
      name: medication?.name || '',
      dosage: medication?.dosage || '',
      start_date: medication?.start_date ? new Date(medication.start_date) : new Date(),
      end_date: medication?.end_date ? new Date(medication.end_date) : null,
      notes: medication?.notes || '',
      reminder_enabled: medication?.reminder_enabled ?? true,
      frequency: medication?.frequency || { type: 'daily', time: '09:00' },
    },
  });
  
  const startDate = watch('start_date');
  const endDate = watch('end_date');
  
  useEffect(() => {
    if (frequencyType === 'daily') {
      setValue('frequency', { type: 'daily', time: selectedTime });
    } else if (frequencyType === 'interval') {
      const hours = parseInt(intervalHours) || 8;
      setValue('frequency', { type: 'interval', hours: Math.min(Math.max(hours, 1), 72) });
    } else if (frequencyType === 'custom') {
      setValue('frequency', { type: 'custom', weekdays: selectedWeekdays, time: selectedTime });
    }
  }, [frequencyType, selectedTime, intervalHours, selectedWeekdays, setValue]);
  
  const onSubmit = async (data: MedicationFormData) => {
    setLoading(true);
    try {
      // Підготовка даних для бази даних
      const medicationData: Omit<MedicationInsert, 'user_id'> = {
        name: data.name,
        dosage: data.dosage || null,
        frequency: data.frequency,
        start_date: format(data.start_date, 'yyyy-MM-dd'),
        end_date: data.end_date ? format(data.end_date, 'yyyy-MM-dd') : null,
        notes: data.notes || null,
        reminder_enabled: data.reminder_enabled,
      };
      
      if (medication) {
        // Оновлення існуючого медикаменту
        const updateData: MedicationUpdate = medicationData;
        await updateMedication(medication.id, updateData);
      } else {
        // Додавання нового медикаменту
        await addMedication(medicationData);
      }
      navigation.goBack();
    } catch (error: any) {
      console.error('Error saving medication:', error);
      // Тут можна показати повідомлення про помилку
    } finally {
      setLoading(false);
    }
  };
  
  const toggleWeekday = (day: number) => {
    if (selectedWeekdays.includes(day)) {
      setSelectedWeekdays(selectedWeekdays.filter(d => d !== day));
    } else {
      setSelectedWeekdays([...selectedWeekdays, day]);
    }
  };
  
  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (selectedDate && datePickerVisible === 'start') {
      setValue('start_date', selectedDate);
    } else if (selectedDate && datePickerVisible === 'end') {
      setValue('end_date', selectedDate);
    }
    setDatePickerVisible(null);
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Назва медикаменту */}
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Medication Name *"
              value={value}
              onChangeText={onChange}
              mode="outlined"
              style={styles.input}
              error={!!errors.name}
            />
          )}
        />
        <HelperText type="error" visible={!!errors.name}>{errors.name?.message}</HelperText>
        
        {/* Дозування */}
        <Controller
          control={control}
          name="dosage"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Dosage (e.g., 100mg)"
              value={value || ''}
              onChangeText={onChange}
              mode="outlined"
              style={styles.input}
            />
          )}
        />
        
        {/* Частота прийому */}
        <Text variant="titleMedium" style={styles.sectionTitle}>Frequency</Text>
        <SegmentedButtons
          value={frequencyType}
          onValueChange={(value) => setFrequencyType(value as any)}
          buttons={[
            { value: 'daily', label: 'Daily' },
            { value: 'interval', label: 'Interval' },
            { value: 'custom', label: 'Custom' },
          ]}
          style={styles.segmented}
        />
        
        {/* Daily frequency */}
        {frequencyType === 'daily' && (
          <Button mode="outlined" onPress={() => setTimePickerVisible(true)} style={styles.timeButton}>
            Time: {selectedTime}
          </Button>
        )}
        
        {/* Interval frequency */}
        {frequencyType === 'interval' && (
          <TextInput
            label="Every X hours (1-72)"
            value={intervalHours}
            onChangeText={setIntervalHours}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
        )}
        
        {/* Custom frequency */}
        {frequencyType === 'custom' && (
          <>
            <View style={styles.weekdaysContainer}>
              {weekdays.map((day, index) => (
                <Chip
                  key={day}
                  selected={selectedWeekdays.includes(index)}
                  onPress={() => toggleWeekday(index)}
                  style={styles.weekdayChip}
                  mode="outlined"
                  showSelectedCheck={true}
                >
                  {day}
                </Chip>
              ))}
            </View>
            <Button mode="outlined" onPress={() => setTimePickerVisible(true)} style={styles.timeButton}>
              Time: {selectedTime}
            </Button>
            <HelperText type="error" visible={selectedWeekdays.length === 0}>
              Select at least one day
            </HelperText>
          </>
        )}
        
        {/* Дата початку */}
        <Text variant="titleMedium" style={styles.sectionTitle}>Schedule</Text>
        <Button 
          mode="outlined" 
          onPress={() => setDatePickerVisible('start')} 
          style={styles.dateButton}
          icon="calendar"
        >
          Start Date: {format(startDate, 'MMM dd, yyyy')}
        </Button>
        
        {/* Дата закінчення (опціонально) */}
        <Button 
          mode="outlined" 
          onPress={() => setDatePickerVisible('end')} 
          style={styles.dateButton}
          icon="calendar"
        >
          End Date: {endDate ? format(endDate, 'MMM dd, yyyy') : 'No end date'}
        </Button>
        <HelperText type="info" visible={true}>
          Leave end date empty for ongoing medication
        </HelperText>
        
        {/* Нотатки */}
        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <TextInput
              label="Notes (optional)"
              value={value || ''}
              onChangeText={onChange}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
            />
          )}
        />
        
        {/* Увімкнення нагадувань */}
        <View style={styles.switchContainer}>
          <Text variant="bodyLarge">Enable Reminders</Text>
          <Controller
            control={control}
            name="reminder_enabled"
            render={({ field: { onChange, value } }) => (
              <Switch value={value} onValueChange={onChange} />
            )}
          />
        </View>
        
        {/* Кнопка збереження */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.submitButton}
        >
          {medication ? 'Update Medication' : 'Add Medication'}
        </Button>
      </View>
      
      {/* Time Picker для iOS */}
      {Platform.OS === 'ios' && (
        <Portal>
          <Dialog visible={timePickerVisible} onDismiss={() => setTimePickerVisible(false)}>
            <Dialog.Title>Select Time</Dialog.Title>
            <Dialog.Content>
              <DateTimePicker
                value={(() => {
                  const [hours, minutes] = selectedTime.split(':').map(Number);
                  const date = new Date();
                  date.setHours(hours, minutes, 0, 0);
                  return date;
                })()}
                mode="time"
                display="spinner"
                onChange={(event, date) => {
                  if (date) {
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    setSelectedTime(`${hours}:${minutes}`);
                  }
                  setTimePickerVisible(false);
                }}
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setTimePickerVisible(false)}>Done</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
      
      {/* Time Picker для Android */}
      {Platform.OS === 'android' && timePickerVisible && (
        <DateTimePicker
          value={(() => {
            const [hours, minutes] = selectedTime.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
          })()}
          mode="time"
          is24Hour={true}
          onChange={(event, date) => {
            if (date) {
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              setSelectedTime(`${hours}:${minutes}`);
            }
            setTimePickerVisible(false);
          }}
        />
      )}
      
      {/* Date Picker для iOS */}
      {Platform.OS === 'ios' && datePickerVisible && (
        <Portal>
          <Dialog visible={true} onDismiss={() => setDatePickerVisible(null)}>
            <Dialog.Title>{datePickerVisible === 'start' ? 'Start Date' : 'End Date'}</Dialog.Title>
            <Dialog.Content>
              <DateTimePicker
                value={datePickerVisible === 'start' ? startDate : endDate || startDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                minimumDate={datePickerVisible === 'end' ? startDate : undefined}
              />
            </Dialog.Content>
            <Dialog.Actions>
              {datePickerVisible === 'end' && (
                <Button onPress={() => {
                  setValue('end_date', null);
                  setDatePickerVisible(null);
                }}>
                  Clear
                </Button>
              )}
              <Button onPress={() => setDatePickerVisible(null)}>Cancel</Button>
              <Button onPress={() => {
                if (datePickerVisible === 'start' && endDate && endDate < startDate) {
                  setValue('end_date', null);
                }
                setDatePickerVisible(null);
              }}>
                Done
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      )}
      
      {/* Date Picker для Android */}
      {Platform.OS === 'android' && datePickerVisible && (
        <DateTimePicker
          value={datePickerVisible === 'start' ? startDate : endDate || startDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
          minimumDate={datePickerVisible === 'end' ? startDate : undefined}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  input: {
    marginBottom: 4,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  segmented: {
    marginBottom: 16,
  },
  timeButton: {
    marginVertical: 8,
  },
  dateButton: {
    marginVertical: 4,
  },
  weekdaysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 8,
    gap: 8,
  },
  weekdayChip: {
    margin: 0,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
    paddingVertical: 8,
  },
  submitButton: {
    marginTop: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
});