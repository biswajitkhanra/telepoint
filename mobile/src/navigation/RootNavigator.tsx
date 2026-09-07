// navigation/RootNavigator.tsx
// Root navigation linking IDFC + Jupiter custom bottom tabs, deep linking, and persistent role routing

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RoleSelectionScreen } from '../screens/RoleSelectionScreen';
import { StaffLoginScreen } from '../screens/StaffLoginScreen';
import { StaffPortalScreen } from '../screens/StaffPortalScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EmiScheduleScreen } from '../screens/EmiScheduleScreen';
import { PaymentHistoryScreen } from '../screens/PaymentHistoryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { BottomTabBar } from '../components/BottomTabBar';
import { setupNotificationResponseListener } from '../services/notifications';
import { registerEMICheckTask } from '../services/emiCheckTask';
import { Colors } from '../constants/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="EmiSchedule"
        component={EmiScheduleScreen}
        options={{
          tabBarLabel: 'Schedule',
        }}
      />
      <Tab.Screen
        name="History"
        component={PaymentHistoryScreen}
        options={{
          tabBarLabel: 'History',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

export const RootNavigator = () => {
  const { customer, deviceRole, staffRole, isLoading } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Background EMI check scheduler & notification tap listener
  useEffect(() => {
    registerEMICheckTask();

    const sub = setupNotificationResponseListener((type, data) => {
      if (!navigationRef.current) return;

      if (type === 'emi_reminder') {
        navigationRef.current.navigate('EmiSchedule');
      } else if (type === 'broadcast') {
        navigationRef.current.navigate('Dashboard');
      }
    });

    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {deviceRole === null ? (
          // First-time launch: ask user if Customer vs Staff (Admin/Retailer)
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        ) : deviceRole === 'staff' ? (
          !staffRole ? (
            // Dedicated Staff Login with Admin vs Retailer dual tabs
            <Stack.Screen name="StaffLogin" component={StaffLoginScreen} />
          ) : (
            // Staff mode: Admin / Retailer webview portal with quick switcher
            <Stack.Screen name="StaffPortal" component={StaffPortalScreen} />
          )
        ) : !customer ? (
          // Customer mode without active session
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // Customer mode with active persistent session
          <Stack.Screen name="MainTabs" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F5F8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
