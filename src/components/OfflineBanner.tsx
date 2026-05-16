import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Banner } from 'react-native-paper';
import { syncQueue } from '../services/syncQueue';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [hasPending, setHasPending] = useState(false);
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const checkQueue = async () => {
      const queue = await syncQueue.getQueue();
      setHasPending(queue.length > 0);
    };
    
    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);
  
  if (!isOffline && !hasPending) return null;
  
  return (
    <View style={styles.container}>
      <Banner
        visible={true}
        actions={isOffline ? [] : [{ label: 'Sync Now', onPress: () => syncQueue.processQueue() }]}
        icon={isOffline ? 'wifi-off' : 'sync-alert'}
      >
        {isOffline ? 'You are offline. Changes will sync when connection is restored.' : 'Pending changes awaiting sync.'}
      </Banner>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
});