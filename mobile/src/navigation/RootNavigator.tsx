import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LayoutDashboard, CalendarDays, Megaphone, User } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EmiScheduleScreen } from '../screens/EmiScheduleScreen';
import { BroadcastsScreen } from '../screens/BroadcastsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { setupNotificationResponseListener } from '../services/notifications';
import { THEME } from '../config';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { broadcasts } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="EmiSchedule"
        component={EmiScheduleScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => <CalendarDays size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="Broadcasts"
        component={BroadcastsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarBadge: broadcasts.length > 0 ? broadcasts.length : undefined,
          tabBarBadgeStyle: { backgroundColor: '#F59E0B', color: '#000', fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Megaphone size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export const RootNavigator = () => {
  const { customer } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Deep-linking from notification taps
  useEffect(() => {
    const sub = setupNotificationResponseListener((type, data) => {
      if (!navigationRef.current) return;

      if (type === 'emi_reminder') {
        navigationRef.current.navigate('EmiSchedule');
      } else if (type === 'broadcast') {
        navigationRef.current.navigate('Broadcasts');
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!customer ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    height: Platform.OS === 'ios' ? 86 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 20,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
