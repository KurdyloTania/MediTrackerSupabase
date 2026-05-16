import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Medication, DoseLog, MedicationInsert, MedicationUpdate, DoseLogInsert, DoseLogUpdate } from '../types';
import { syncQueue } from '../services/syncQueue';
import { scheduleMedicationNotifications } from '../services/notificationService';

interface MedicationsContextType {
  medications: Medication[];
  doseLogs: DoseLog[];
  isLoading: boolean;
  addMedication: (medication: Omit<MedicationInsert, 'user_id'>) => Promise<void>;
  updateMedication: (id: string, updates: MedicationUpdate) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  logDose: (medicationId: string, scheduledTime: Date) => Promise<void>;
  skipDose: (logId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const MedicationsContext = createContext<MedicationsContextType | undefined>(undefined);

export function MedicationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    const [medsResult, logsResult] = await Promise.all([
      supabase.from('medications').select('*').eq('user_id', user.id),
      supabase.from('dose_logs').select('*').eq('medications.user_id', user.id),
    ]);
    
    if (medsResult.error) {
      console.error('Error fetching medications:', medsResult.error);
      return;
    }
    if (logsResult.error) {
      console.error('Error fetching dose logs:', logsResult.error);
      return;
    }
    
    setMedications(medsResult.data as Medication[] || []);
    setDoseLogs(logsResult.data as DoseLog[] || []);
  }, [user]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetchData();
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchData]);

  // Оновлюємо сповіщення коли змінюються медикаменти
  useEffect(() => {
    if (medications.length > 0) {
      scheduleMedicationNotifications(medications);
    }
  }, [medications]);

  useEffect(() => {
    if (user) {
      refetch();
    } else {
      setMedications([]);
      setDoseLogs([]);
      setIsLoading(false);
    }
  }, [user, refetch]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;
    
    const medicationsSubscription = supabase
      .channel('medications_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'medications', filter: `user_id=eq.${user.id}` }, 
        () => {
          fetchData();
        }
      )
      .subscribe();
    
    const doseLogsSubscription = supabase
      .channel('dose_logs_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'dose_logs' }, 
        () => {
          fetchData();
        }
      )
      .subscribe();
    
    return () => {
      medicationsSubscription.unsubscribe();
      doseLogsSubscription.unsubscribe();
    };
  }, [user, fetchData]);

  const addMedication = async (medication: Omit<MedicationInsert, 'user_id'>) => {
    if (!user) throw new Error('User not authenticated');
    
    const newMed: MedicationInsert = { 
      ...medication, 
      user_id: user.id 
    };
    
    // Optimistic update
    const tempId = `temp_${Date.now()}`;
    const optimisticMed: Medication = { 
      ...newMed, 
      id: tempId, 
      created_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    };
    setMedications(prev => [...prev, optimisticMed]);
    
    try {
      const { data, error } = await supabase
        .from('medications')
        .insert(newMed)
        .select()
        .single();
      
      if (error) throw error;
      
      if (data) {
        setMedications(prev => prev.map(m => m.id === tempId ? data as Medication : m));
      }
    } catch (error) {
      // Rollback optimistic update
      setMedications(prev => prev.filter(m => m.id !== tempId));
      // Queue for offline sync
      await syncQueue.enqueue({ type: 'ADD_MED', payload: newMed });
      throw error;
    }
  };

  const updateMedication = async (id: string, updates: MedicationUpdate) => {
    const originalMed = medications.find(m => m.id === id);
    if (!originalMed) return;
    
    // Optimistic update
    setMedications(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    
    try {
      const { error } = await supabase
        .from('medications')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      // Rollback
      setMedications(prev => prev.map(m => m.id === id ? originalMed : m));
      await syncQueue.enqueue({ type: 'UPDATE_MED', payload: { id, ...updates } });
      throw error;
    }
  };

  const deleteMedication = async (id: string) => {
    const originalMeds = [...medications];
    setMedications(prev => prev.filter(m => m.id !== id));
    
    try {
      const { error } = await supabase.from('medications').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      setMedications(originalMeds);
      await syncQueue.enqueue({ type: 'DELETE_MED', payload: { medicationId: id } });
      throw error;
    }
  };

  const logDose = async (medicationId: string, scheduledTime: Date) => {
    const newLog: DoseLogInsert = {
      medication_id: medicationId,
      scheduled_time: scheduledTime.toISOString(),
      taken_at: new Date().toISOString(),
      skipped: false,
    };
    
    // Optimistic update
    const tempLog: DoseLog = { 
      ...newLog, 
      id: `temp_${Date.now()}`, 
      created_at: new Date().toISOString() 
    };
    setDoseLogs(prev => [...prev, tempLog]);
    
    try {
      const { data, error } = await supabase
        .from('dose_logs')
        .insert(newLog)
        .select()
        .single();
      
      if (error) throw error;
      
      if (data) {
        setDoseLogs(prev => prev.map(l => l.id === tempLog.id ? data as DoseLog : l));
      }
    } catch (error) {
      setDoseLogs(prev => prev.filter(l => l.id !== tempLog.id));
      await syncQueue.enqueue({ type: 'LOG_DOSE', payload: newLog });
      throw error;
    }
  };

  const skipDose = async (logId: string) => {
    const originalLog = doseLogs.find(l => l.id === logId);
    if (!originalLog) return;
    
    const update: DoseLogUpdate = { skipped: true, taken_at: null };
    setDoseLogs(prev => prev.map(l => l.id === logId ? { ...l, ...update } : l));
    
    try {
      const { error } = await supabase
        .from('dose_logs')
        .update(update)
        .eq('id', logId);
      
      if (error) throw error;
    } catch (error) {
      setDoseLogs(prev => prev.map(l => l.id === logId ? originalLog : l));
      await syncQueue.enqueue({ type: 'SKIP_DOSE', payload: { logId } });
      throw error;
    }
  };

  return (
    <MedicationsContext.Provider value={{
      medications,
      doseLogs,
      isLoading,
      addMedication,
      updateMedication,
      deleteMedication,
      logDose,
      skipDose,
      refetch,
    }}>
      {children}
    </MedicationsContext.Provider>
  );
}

export function useMedications() {
  const context = useContext(MedicationsContext);
  if (context === undefined) {
    throw new Error('useMedications must be used within a MedicationsProvider');
  }
  return context;
}