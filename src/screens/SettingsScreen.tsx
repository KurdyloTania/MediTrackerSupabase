import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { List, Divider, Button, Dialog, Portal, Text, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useMedications } from '../context/MedicationsContext';
import { requestNotificationPermissions } from '../services/notificationService';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ navigation }: any) {
  const { signOut, deleteAccount, user } = useAuth();
  const { refetch } = useMedications();
  const [logoutDialog, setLogoutDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  
  const handleLogout = async () => {
    setLoading(true);
    try {
      await signOut();
      setLogoutDialog(false);
    } catch (error) {
      setSnackbar({ visible: true, message: 'Failed to logout' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      await deleteAccount();
      setDeleteDialog(false);
    } catch (error) {
      setSnackbar({ visible: true, message: 'Failed to delete account' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearLocalData = async () => {
    Alert.alert(
      'Clear Local Data',
      'This will remove all locally cached data. Your data in the cloud will remain safe. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              await SecureStore.deleteItemAsync('supabase.auth.token');
              await refetch();
              setSnackbar({ visible: true, message: 'Local data cleared' });
            } catch (error) {
              setSnackbar({ visible: true, message: 'Failed to clear data' });
            }
          },
        },
      ]
    );
  };
  
  const handleSetupNotifications = async () => {
    const granted = await requestNotificationPermissions();
    if (granted) {
      setSnackbar({ visible: true, message: 'Notifications enabled' });
    } else {
      Alert.alert('Permission Denied', 'Please enable notifications in device settings');
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      <List.Section>
        <List.Subheader>Account</List.Subheader>
        <List.Item
          title="Email"
          description={user?.email}
          left={props => <List.Icon {...props} icon="email" />}
        />
        <Divider />
        
        <List.Subheader>Preferences</List.Subheader>
        <List.Item
          title="Notifications"
          description="Enable medication reminders"
          left={props => <List.Icon {...props} icon="bell" />}
          onPress={handleSetupNotifications}
        />
        <Divider />
        
        <List.Subheader>Data</List.Subheader>
        <List.Item
          title="Clear Local Cache"
          description="Remove all locally stored data"
          left={props => <List.Icon {...props} icon="database-remove" />}
          onPress={handleClearLocalData}
        />
        <Divider />
        
        <List.Subheader>Danger Zone</List.Subheader>
        <List.Item
          title="Sign Out"
          description="Logout from your account"
          left={props => <List.Icon {...props} icon="logout" color="#f44336" />}
          onPress={() => setLogoutDialog(true)}
          titleStyle={{ color: '#f44336' }}
        />
        <List.Item
          title="Delete Account"
          description="Permanently delete all your data"
          left={props => <List.Icon {...props} icon="delete-forever" color="#f44336" />}
          onPress={() => setDeleteDialog(true)}
          titleStyle={{ color: '#f44336' }}
        />
      </List.Section>
      
      <View style={styles.version}>
        <Text variant="bodySmall">MediTracker v1.0.0</Text>
        <Text variant="bodySmall">© 2024</Text>
      </View>
      
      <Portal>
        <Dialog visible={logoutDialog} onDismiss={() => setLogoutDialog(false)}>
          <Dialog.Title>Sign Out</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to sign out?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialog(false)}>Cancel</Button>
            <Button onPress={handleLogout} textColor="#f44336">Sign Out</Button>
          </Dialog.Actions>
        </Dialog>
        
        <Dialog visible={deleteDialog} onDismiss={() => setDeleteDialog(false)}>
          <Dialog.Title>Delete Account</Dialog.Title>
          <Dialog.Content>
            <Text>This action is irreversible. All your medications, logs, and profile data will be permanently deleted. Are you sure?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDeleteAccount} textColor="#f44336">Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" />
        </View>
      )}
      
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
    backgroundColor: '#fff',
  },
  version: {
    alignItems: 'center',
    padding: 24,
    opacity: 0.5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});