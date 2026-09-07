import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LayoutDashboard, CalendarDays, Megaphone, User } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { RoleSelectionScreen } from '../screens/RoleSelectionScreen';
import { StaffPortalScreen } from '../screens/StaffPortalScreen';
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
        tabBarActiveTintColor: THEME.accent.primary, // #2563EB
        tabBarInactiveTintColor: THEME.text.muted, // #64748B
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
          tabBarBadgeStyle: { backgroundColor: '#F59E0B', color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
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
  const { customer, deviceRole, isLoading } = useAuth();
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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME.accent.primary} />
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
          // Staff mode: Admin / Retailer webview portal with quick switcher
          <Stack.Screen name="StaffPortal" component={StaffPortalScreen} />
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
    backgroundColor: THEME.bg.darkest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    height: Platform.OS === 'ios' ? 86 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
