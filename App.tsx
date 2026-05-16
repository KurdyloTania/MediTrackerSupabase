import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MedicationsProvider } from './src/context/MedicationsContext';
import { scheduleMedicationNotifications, addNotificationResponseListener } from './src/services/notificationService';
import { useMedications } from './src/context/MedicationsContext';
import OfflineBanner from './src/components/OfflineBanner';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from './src/services/notificationService';

// Screens
import SignInScreen from './src/screens/Auth/SignInScreen';
import SignUpScreen from './src/screens/Auth/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddEditMedicationScreen from './src/screens/AddEditMedicationScreen';
import MedicationDetailScreen from './src/screens/MedicationDetailScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { medications } = useMedications();
  
  useEffect(() => {
    scheduleMedicationNotifications(medications);
  }, [medications]);
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Reports') iconName = focused ? 'chart-line' : 'chart-line-variant';
          else if (route.name === 'Settings') iconName = focused ? 'cog' : 'cog-outline';
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2196f3',
        tabBarInactiveTintColor: 'gray',
        headerShown: true,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Medications' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return null;
  }
  
  return (
    <Stack.Navigator>
      {!user ? (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
          <Stack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: false }} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="AddEditMedication" component={AddEditMedicationScreen} options={{ title: 'Add Medication' }} />
          <Stack.Screen name="MedicationDetail" component={MedicationDetailScreen} options={{ title: 'Medication Details' }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const navigationRef = useRef<any>(null);
  
  useEffect(() => {
    requestNotificationPermissions();
    
    const unsubscribe = addNotificationResponseListener((medicationId) => {
      if (navigationRef.current) {
        navigationRef.current.navigate('Main', {
          screen: 'Home',
        });
        setTimeout(() => {
          navigationRef.current.navigate('MedicationDetail', { medicationId });
        }, 100);
      }
    });
    
    return unsubscribe;
  }, []);
  
  return (
    <PaperProvider>
      <AuthProvider>
        <MedicationsProvider>
          <NavigationContainer ref={navigationRef}>
            <OfflineBanner />
            <AppNavigator />
          </NavigationContainer>
        </MedicationsProvider>
      </AuthProvider>
    </PaperProvider>
  );
}