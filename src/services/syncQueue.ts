import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { PendingAction } from '../types';

const QUEUE_KEY = '@meditracker_sync_queue';

class SyncQueue {
  private isProcessing = false;
  private listeners: Set<(isOnline: boolean) => void> = new Set();

  async enqueue(action: Omit<PendingAction, 'id' | 'timestamp'>): Promise<void> {
    const queue = await this.getQueue();
    const newAction: PendingAction = {
      ...action,
      id: Date.now().toString() + Math.random().toString(36),
      timestamp: Date.now(),
    };
    queue.push(newAction);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    
    // Try to process immediately if online
    if (navigator.onLine) {
      await this.processQueue();
    }
  }

  async getQueue(): Promise<PendingAction[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    const isOnline = navigator.onLine;
    this.notifyListeners(isOnline);
    
    if (!isOnline) return;
    
    this.isProcessing = true;
    const queue = await this.getQueue();
    
    if (queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    const failedActions: PendingAction[] = [];
    
    for (const action of queue) {
      try {
        await this.processAction(action);
      } catch (error) {
        console.error('Failed to process action:', action, error);
        failedActions.push(action);
      }
    }
    
    // Update queue with failed actions
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedActions));
    this.isProcessing = false;
    
    if (failedActions.length === 0) {
      this.notifyListeners(true);
    }
  }

  private async processAction(action: PendingAction): Promise<void> {
    switch (action.type) {
      case 'ADD_MED':
        const { data: medData, error: medError } = await supabase
          .from('medications')
          .insert(action.payload)
          .select()
          .single();
        if (medError) throw medError;
        break;
        
      case 'UPDATE_MED':
        const { error: updateError } = await supabase
          .from('medications')
          .update(action.payload)
          .eq('id', action.payload.id);
        if (updateError) throw updateError;
        break;
        
      case 'DELETE_MED':
        const { error: deleteError } = await supabase
          .from('medications')
          .delete()
          .eq('id', action.payload.medicationId);
        if (deleteError) throw deleteError;
        break;
        
      case 'LOG_DOSE':
        const { error: logError } = await supabase
          .from('dose_logs')
          .insert(action.payload);
        if (logError) throw logError;
        break;
        
      case 'SKIP_DOSE':
        const { error: skipError } = await supabase
          .from('dose_logs')
          .update({ skipped: true, taken_at: null })
          .eq('id', action.payload.logId);
        if (skipError) throw skipError;
        break;
    }
  }

  async retryFailed(): Promise<void> {
    await this.processQueue();
  }

  addListener(listener: (isOnline: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(isOnline: boolean): void {
    this.listeners.forEach(listener => listener(isOnline));
  }
}

export const syncQueue = new SyncQueue();

// Listen to network status
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncQueue.processQueue());
  window.addEventListener('focus', () => syncQueue.processQueue());
}