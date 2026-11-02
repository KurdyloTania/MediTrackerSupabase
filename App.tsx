// src/App.tsx
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StatusBar, StyleSheet, Platform } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { MedicationsProvider } from './src/context/MedicationsContext';
import { requestNotificationPermissions, addNotificationResponseListener } from './src/services/notificationService';
import { COLORS } from './src/theme/colors';

// Screens - переконайтеся, що всі вони мають default export
import SplashScreen from './src/screens/SplashScreen';
import SignInScreen from './src/screens/Auth/SignInScreen';
import SignUpScreen from './src/screens/Auth/SignUpScreen';
import ForgotPasswordScreen from './src/screens/Auth/ForgotPasswordScreen';

// Якщо є помилки з імпортом, використовуйте require
const HomeScreen = require('./src/screens/HomeScreen').default;
const CalendarScreen = require('./src/screens/CalendarScreen').default;
const ReportsScreen = require('./src/screens/ReportsScreen').default;
const StockScreen = require('./src/screens/StockScreen').default;
const AddEditMedicationScreen = require('./src/screens/AddEditMedicationScreen').default;
const MedicationDetailScreen = require('./src/screens/MedicationDetailScreen').default;

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const C = COLORS;

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName: string;

          switch (route.name) {
            case 'Головна': iconName = focused ? 'home' : 'home-outline'; break;
            case 'Календар': iconName = focused ? 'calendar-month' : 'calendar-blank-outline'; break;
            case 'Звіти': iconName = focused ? 'chart-line' : 'chart-line'; break;
            case 'Залишки': iconName = focused ? 'archive' : 'archive-outline'; break;
            default: iconName = 'help-circle-outline';
          }

          return <Icon name={iconName} size={focused ? 26 : 24} color={color} />;
        },
        tabBarActiveTintColor: C.cream,
        tabBarInactiveTintColor: 'rgba(243,232,211,0.6)',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: false,
        tabBarShowLabel: true,
      })}
    >
      <Tab.Screen name="Головна" component={HomeScreen} />
      <Tab.Screen name="Календар" component={CalendarScreen} />
      <Tab.Screen name="Звіти" component={ReportsScreen} />
      <Tab.Screen name="Залишки" component={StockScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { session, isLoading } = useAuth();
  const [isSplashVisible, setIsSplashVisible] = React.useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsSplashVisible(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (isSplashVisible || isLoading) return <SplashScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <>
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen 
            name="AddEditMedication" 
            component={AddEditMedicationScreen}
            options={{ 
              headerShown: true, 
              headerTitle: '', 
              headerBackTitle: 'Назад', 
              headerStyle: { backgroundColor: C.darkGreen }, 
              headerTintColor: C.cream 
            }} 
          />
          <Stack.Screen 
            name="MedicationDetail" 
            component={MedicationDetailScreen}
            options={{ 
              headerShown: true, 
              headerTitle: '', 
              headerBackTitle: 'Назад', 
              headerStyle: { backgroundColor: C.darkGreen }, 
              headerTintColor: C.cream 
            }} 
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    const setupNotifications = async () => {
      await requestNotificationPermissions();
      const removeListener = addNotificationResponseListener(() => {
        console.log('Notification action handled');
      });
      return removeListener;
    };

    setupNotifications();
  }, []);

  return (
    <PaperProvider>
      <AuthProvider>
        <MedicationsProvider>
          <NavigationContainer>
            <StatusBar barStyle="light-content" />
            <AppNavigator />
          </NavigationContainer>
        </MedicationsProvider>
      </AuthProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: C.darkGreen,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 85 : 70,
    paddingBottom: Platform.OS === 'ios' ? 25 : 12,
    paddingTop: 8,
    shadowColor: C.darkGreen,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 3,
    color: C.cream,
  },
});
















