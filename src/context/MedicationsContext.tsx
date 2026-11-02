// src/context/MedicationsContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  Medication, DoseLog, MedicationInsert, MedicationUpdate,
  AdherenceSummary, DoseStatus, EditMark,
} from '../types';
import {
  scheduleMedicationNotifications,
  cancelMedicationNotifications,
  startAutoMissWorker,
} from '../services/notificationService';
import { getTodayStats } from '../services/scheduleGenerator';
import { calculateAdherence } from '../services/adherenceCalculator';

interface MedicationsContextType {
  medications: Medication[];
  doseLogs: DoseLog[];
  isLoading: boolean;
  adherenceSummary: AdherenceSummary | null;
  todayStats: { taken: number; missed: number; pending: number; total: number };
  addMedication: (medication: Omit<MedicationInsert, 'user_id'>) => Promise<void>;
  updateMedication: (id: string, updates: MedicationUpdate) => Promise<void>;
  deleteMedication: (id: string, keepHistory?: boolean) => Promise<void>;
  logDose: (medicationId: string, scheduledTime: Date) => Promise<void>;
  markMissed: (medicationId: string, scheduledTime: Date) => Promise<void>;
  updateDoseStatus: (logId: string, status: 'taken' | 'missed', editMark?: 'auto' | 'manual') => Promise<void>;
  refetch: () => Promise<void>;
}

const MedicationsContext = createContext<MedicationsContextType | undefined>(undefined);

export function MedicationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adherenceSummary, setAdherenceSummary] = useState<AdherenceSummary | null>(null);
  const [todayStats, setTodayStats] = useState({ taken: 0, missed: 0, pending: 0, total: 0 });

  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const notifScheduledKeyRef = useRef<string>('');

  // Функція оновлення статистики
  const updateStats = useCallback((meds: Medication[], logs: DoseLog[]) => {
    if (!mountedRef.current) return;
    const summary = calculateAdherence(meds, logs);
    setAdherenceSummary(summary);
    const stats = getTodayStats(meds, logs);
    setTodayStats(stats);
  }, []);

  // Функція завантаження даних
  const fetchData = useCallback(async (force = false) => {
    if (!user) {
      setMedications([]);
      setDoseLogs([]);
      setIsLoading(false);
      return;
    }
    
    if (isFetchingRef.current && !force) return;
    isFetchingRef.current = true;
    if (mountedRef.current) setIsLoading(true);

    try {
      console.log('[MedicationsContext] Fetching data for user:', user.id);
      
      const [medRes, logsRes] = await Promise.all([
        supabase
          .from('medications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('dose_logs')
          .select('*')
          .order('scheduled_time', { ascending: false }),
      ]);

      if (medRes.error) throw medRes.error;
      if (logsRes.error) throw logsRes.error;

      const meds = (medRes.data || []).map(convertDbMedicationToMedication);
      const logs = (logsRes.data || []).map(convertDbDoseLogToDoseLog);

      console.log('[MedicationsContext] Loaded medications:', meds.length);
      console.log('[MedicationsContext] Loaded dose logs:', logs.length);

      if (mountedRef.current) {
        setMedications(meds);
        setDoseLogs(logs);
        updateStats(meds, logs);
      }
    } catch (error) {
      console.error('[MedicationsContext] Fetch error:', error);
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [user, updateStats]);

  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Ініціалізація
  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      fetchData(true);
    } else {
      setMedications([]);
      setDoseLogs([]);
      setAdherenceSummary(null);
      setTodayStats({ taken: 0, missed: 0, pending: 0, total: 0 });
      setIsLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [user, fetchData]);

  // Планування сповіщень
  useEffect(() => {
    if (!medications.length) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeMeds = medications.filter(m => {
      if (!m.end_date) return true;
      const end = new Date(m.end_date);
      end.setHours(23, 59, 59, 999);
      return end >= today;
    });

    const scheduleKey = activeMeds
      .map(m => `${m.id}|${m.reminder_enabled}|${JSON.stringify(m.frequency)}|${m.start_date}|${m.end_date ?? ''}`)
      .join(';');

    if (scheduleKey === notifScheduledKeyRef.current) return;
    notifScheduledKeyRef.current = scheduleKey;
    
    if (activeMeds.length > 0) {
      scheduleMedicationNotifications(activeMeds);
    }
  }, [medications]);

  // AutoMiss worker
  useEffect(() => {
    if (!user || medications.length === 0) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeMeds = medications.filter(m => {
      if (!m.end_date) return true;
      const end = new Date(m.end_date);
      end.setHours(23, 59, 59, 999);
      return end >= today;
    });
    
    const stopAutoMiss = startAutoMissWorker(activeMeds, () => refetch());
    return () => stopAutoMiss();
  }, [user, medications.map(m => m.id).join(','), refetch]);

  // Realtime підписка
  useEffect(() => {
    if (!user) return;
    
    let isSubscribed = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isSubscribed) {
          console.log('[Realtime] Change detected, refetching...');
          fetchData(true);
        }
      }, 500);
    };

    const medSub = supabase
      .channel(`medications_${user.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'medications', 
        filter: `user_id=eq.${user.id}` 
      }, handleChange)
      .subscribe();

    const logsSub = supabase
      .channel(`dose_logs_${user.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'dose_logs' 
      }, handleChange)
      .subscribe();

    return () => {
      isSubscribed = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(medSub);
      supabase.removeChannel(logsSub);
    };
  }, [user, fetchData]);

  // ==================== CRUD ОПЕРАЦІЇ ====================

  const addMedication = async (medication: Omit<MedicationInsert, 'user_id'>) => {
    if (!user) throw new Error('Not authenticated');
    
    console.log('[addMedication] Adding medication:', medication);
    
    const newMed: MedicationInsert = { ...medication, user_id: user.id };

    try {
      const dbInsert = {
        ...newMed,
        dosage: newMed.dosage ?? null,
        notes: newMed.notes ?? null,
        end_date: newMed.end_date ?? null,
        stock_quantity: newMed.stock_quantity ?? null,
        stock_unit: newMed.stock_unit ?? null,
        dose_per_intake: newMed.dose_per_intake ?? null,
      };

      const { data, error } = await supabase
        .from('medications')
        .insert(dbInsert)
        .select()
        .single();
        
      if (error) throw error;
      
      console.log('[addMedication] Successfully added:', data);

      const realMed = convertDbMedicationToMedication(data);
      
      // Оновлюємо стан
      setMedications(prev => [realMed, ...prev]);
      updateStats([realMed, ...medications], doseLogs);
      
      // Плануємо сповіщення
      await scheduleMedicationNotifications([realMed]);
      
    } catch (error) {
      console.error('[addMedication] Error:', error);
      throw error;
    }
  };

  const updateMedication = async (id: string, updates: MedicationUpdate) => {
    console.log('[updateMedication] Updating medication:', id, updates);
    
    try {
      const dbUpdates: any = { ...updates };
      dbUpdates.dosage = updates.dosage ?? null;
      dbUpdates.notes = updates.notes ?? null;
      dbUpdates.end_date = updates.end_date ?? null;
      dbUpdates.stock_quantity = updates.stock_quantity ?? null;
      dbUpdates.stock_unit = updates.stock_unit ?? null;
      dbUpdates.dose_per_intake = updates.dose_per_intake ?? null;

      const { error } = await supabase
        .from('medications')
        .update(dbUpdates)
        .eq('id', id);
        
      if (error) throw error;

      // Оновлюємо локальний стан
      setMedications(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
      
      // Переплануємо сповіщення
      await cancelMedicationNotifications(id);
      const updatedMed = medications.find(m => m.id === id);
      if (updatedMed) {
        await scheduleMedicationNotifications([{ ...updatedMed, ...updates }]);
      }
      
    } catch (error) {
      console.error('[updateMedication] Error:', error);
      throw error;
    }
  };

  const deleteMedication = async (id: string, keepHistory: boolean = true) => {
    console.log('[deleteMedication] Deleting medication:', id, 'keepHistory:', keepHistory);
    
    try {
      await cancelMedicationNotifications(id);
      
      if (keepHistory) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const { error } = await supabase
          .from('medications')
          .update({ 
            end_date: yesterdayStr, 
            stock_quantity: null, 
            stock_unit: null, 
            dose_per_intake: null 
          })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('medications')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }

      // Оновлюємо локальний стан
      setMedications(prev => prev.filter(m => m.id !== id));
      
    } catch (error) {
      console.error('[deleteMedication] Error:', error);
      await fetchData(true);
      throw error;
    }
  };

  const logDose = async (medicationId: string, scheduledTime: Date) => {
    const isoTime = scheduledTime.toISOString();
    const nowISO = new Date().toISOString();

    console.log('[logDose] Logging dose:', medicationId, isoTime);

    try {
      const { error } = await supabase
        .from('dose_logs')
        .upsert(
          { 
            medication_id: medicationId, 
            scheduled_time: isoTime, 
            taken_at: nowISO, 
            status: 'taken', 
            edit_mark: null 
          },
          { onConflict: 'medication_id,scheduled_time' }
        );
      if (error) throw error;

      // Оновлюємо залишок
      const med = medications.find(m => m.id === medicationId);
      if (med?.stock_quantity != null && med?.dose_per_intake != null && med.dose_per_intake > 0) {
        const newStock = Math.max(0, med.stock_quantity - med.dose_per_intake);
        await supabase
          .from('medications')
          .update({ stock_quantity: newStock })
          .eq('id', medicationId);
          
        // Оновлюємо локально
        setMedications(prev => prev.map(m => 
          m.id === medicationId ? { ...m, stock_quantity: newStock } : m
        ));
      }

      // Оновлюємо дозу в локальному стані
      setDoseLogs(prev => {
        const existing = prev.find(l => l.medication_id === medicationId && l.scheduled_time === isoTime);
        if (existing) {
          return prev.map(l => l.id === existing.id 
            ? { ...l, taken_at: nowISO, status: 'taken', edit_mark: null }
            : l
          );
        } else {
          const newLog: DoseLog = {
            id: `temp_${Date.now()}`,
            medication_id: medicationId,
            scheduled_time: isoTime,
            taken_at: nowISO,
            status: 'taken',
            edit_mark: null,
            created_at: nowISO,
            updated_at: nowISO,
          };
          return [newLog, ...prev];
        }
      });
      
    } catch (error) {
      console.error('[logDose] Error:', error);
      throw error;
    }
  };

  const markMissed = async (medicationId: string, scheduledTime: Date) => {
    const isoTime = scheduledTime.toISOString();

    console.log('[markMissed] Marking missed:', medicationId, isoTime);

    try {
      const { error } = await supabase
        .from('dose_logs')
        .upsert(
          { 
            medication_id: medicationId, 
            scheduled_time: isoTime, 
            taken_at: null, 
            status: 'missed', 
            edit_mark: 'manual' 
          },
          { onConflict: 'medication_id,scheduled_time' }
        );
      if (error) throw error;

      // Оновлюємо локальний стан
      setDoseLogs(prev => {
        const existing = prev.find(l => l.medication_id === medicationId && l.scheduled_time === isoTime);
        if (existing) {
          return prev.map(l => l.id === existing.id 
            ? { ...l, status: 'missed', edit_mark: 'manual', taken_at: null }
            : l
          );
        } else {
          const newLog: DoseLog = {
            id: `temp_${Date.now()}`,
            medication_id: medicationId,
            scheduled_time: isoTime,
            taken_at: null,
            status: 'missed',
            edit_mark: 'manual',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return [newLog, ...prev];
        }
      });
      
    } catch (error) {
      console.error('[markMissed] Error:', error);
      await fetchData(true);
      throw error;
    }
  };

  const updateDoseStatus = async (logId: string, status: 'taken' | 'missed', editMark?: 'auto' | 'manual') => {
    const nowISO = new Date().toISOString();
    const updateData: Partial<DoseLog> = status === 'taken'
      ? { taken_at: nowISO, status: 'taken', edit_mark: (editMark || 'manual') as EditMark }
      : { taken_at: null, status: 'missed', edit_mark: (editMark || 'manual') as EditMark };

    console.log('[updateDoseStatus] Updating status:', logId, status);

    try {
      const { error } = await supabase
        .from('dose_logs')
        .update(updateData)
        .eq('id', logId);
      if (error) throw error;

      // Оновлюємо локальний стан
      setDoseLogs(prev => prev.map(l => l.id === logId ? { ...l, ...updateData } : l));
      
    } catch (error) {
      console.error('[updateDoseStatus] Error:', error);
      await fetchData(true);
      throw error;
    }
  };

  const value: MedicationsContextType = {
    medications,
    doseLogs,
    isLoading,
    adherenceSummary,
    todayStats,
    addMedication,
    updateMedication,
    deleteMedication,
    logDose,
    markMissed,
    updateDoseStatus,
    refetch,
  };

  return <MedicationsContext.Provider value={value}>{children}</MedicationsContext.Provider>;
}

export function useMedications() {
  const ctx = useContext(MedicationsContext);
  if (!ctx) throw new Error('useMedications must be used within MedicationsProvider');
  return ctx;
}

function convertDbMedicationToMedication(dbMed: any): Medication {
  return {
    id: dbMed.id,
    user_id: dbMed.user_id,
    name: dbMed.name,
    dosage: dbMed.dosage ?? undefined,
    frequency: dbMed.frequency,
    start_date: dbMed.start_date,
    end_date: dbMed.end_date ?? undefined,
    reminder_enabled: dbMed.reminder_enabled,
    meal_timing: dbMed.meal_timing,
    notes: dbMed.notes ?? undefined,
    stock_quantity: dbMed.stock_quantity ?? undefined,
    stock_unit: dbMed.stock_unit ?? undefined,
    dose_per_intake: dbMed.dose_per_intake ?? undefined,
    created_at: dbMed.created_at,
    updated_at: dbMed.updated_at,
  };
}

function convertDbDoseLogToDoseLog(dbLog: any): DoseLog {
  return {
    id: dbLog.id,
    medication_id: dbLog.medication_id,
    scheduled_time: new Date(dbLog.scheduled_time).toISOString(),
    taken_at: dbLog.taken_at ? new Date(dbLog.taken_at).toISOString() : null,
    status: dbLog.status,
    edit_mark: dbLog.edit_mark ?? null,
    created_at: dbLog.created_at,
    updated_at: dbLog.updated_at,
  };
}