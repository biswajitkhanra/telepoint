// navigation/RootNavigator.tsx
// Root navigation linking IDFC + Jupiter custom bottom tabs, deep linking, and persistent role routing

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RoleSelectionScreen } from '../screens/RoleSelectionScreen';
import { WebPortalScreen } from '../screens/WebPortalScreen';
import { EmiDueReminder } from '../components/EmiDueReminder';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { EmiScheduleScreen } from '../screens/EmiScheduleScreen';
import { PaymentHistoryScreen } from '../screens/PaymentHistoryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { DeviceManagementScreen } from '../screens/DeviceManagementScreen';
import { DiagnosticScreen } from '../screens/DiagnosticScreen';
import { LockedScreen } from '../screens/LockedScreen';
import { AccessibilityGateScreen } from '../screens/AccessibilityGateScreen';
import { BottomTabBar } from '../components/BottomTabBar';
import { setupNotificationResponseListener } from '../services/notifications';
import { registerEMICheckTask } from '../services/emiCheckTask';
import { useDeviceCommands } from '../hooks/useDeviceCommands';
import { APP_VARIANT } from '../config';
import { Colors } from '../constants/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const CustomerStack = createNativeStackNavigator();

/**
 * Customer root once logged in. Mounts the device-command listener; when the
 * backend has CONFIRMED a lock, the locked EMI screen takes over the whole
 * customer surface. Otherwise the normal tabs + the Device Management screen.
 */
function CustomerRoot() {
  const { customer, emis } = useAuth();
  const dc = useDeviceCommands(customer?.id);
  // Accessibility is REQUIRED on a financed Device-Owner phone while the loan is
  // outstanding (customer-consented at the store, real system toggle). The gate
  // below blocks the customer surface until the live OS state confirms it is on;
  // it clears itself once enabled. It never gates a non-financed/complete loan.
  const [a11yGatePassed, setA11yGatePassed] = useState(false);
  const handleA11yGateDone = useCallback(() => setA11yGatePassed(true), []);
  const loanOutstanding = customer?.status === 'RUNNING' || customer?.status === 'NPA';

  // Re-arm the gate whenever the app returns to the foreground while the loan
  // is outstanding: if the service was turned off in Settings, the gate
  // re-engages immediately (it clears itself in a second when still enabled).
  useEffect(() => {
    if (APP_VARIANT !== 'customer' || !loanOutstanding) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setA11yGatePassed(false);
    });
    return () => sub.remove();
  }, [loanOutstanding]);

  if (dc.locked) {
    return (
      <LockedScreen
        emiAmount={dc.emiAmount}
        retailerName={dc.retailerName}
        retailerPhone={dc.retailerPhone}
        customerName={dc.customerName}
        onRefresh={dc.refresh}
        onUnlocked={dc.forceUnlock}
      />
    );
  }

  if (APP_VARIANT === 'customer' && loanOutstanding && !a11yGatePassed) {
    return (
      <AccessibilityGateScreen
        retailerName={dc.retailerName}
        retailerPhone={dc.retailerPhone}
        onDone={handleA11yGateDone}
      />
    );
  }

  return (
    <>
      <CustomerStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <CustomerStack.Screen name="MainTabs" component={MainTabs} />
        <CustomerStack.Screen name="DeviceManagement" component={DeviceManagementScreen} />
        {/* Hidden, owner-PIN-gated diagnostic panel (tap the version footer 7×). */}
        <CustomerStack.Screen name="Diagnostic" component={DiagnosticScreen} />
      </CustomerStack.Navigator>
      {/* Bilingual EMI-due popup: 10s if due within 5 days; 5×/day if due today
          or overdue, until paid. App-closed reminders are local notifications. */}
      <EmiDueReminder emis={emis} />
    </>
  );
}

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
  const { customer, deviceRole, isLoading } = useAuth();
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

  // Single-purpose builds: the customer APK only ever shows the customer login;
  // the retailer/admin APK only ever shows the staff login. The role-selection
  // screen is used only by the "combined" (dev) build. This is unlike the web,
  // where one deployment serves every role.
  const forcedRole: 'customer' | 'staff' | null =
    APP_VARIANT === 'customer' ? 'customer'
      : APP_VARIANT === 'retailer' ? 'staff'
        : deviceRole;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {forcedRole === null ? (
          // Combined build, first launch: ask Customer vs Staff (Admin/Retailer)
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
        ) : forcedRole === 'staff' ? (
          // Staff (admin/retailer) surface IS the web portal, loaded in a
          // WebView — identical to the web, every feature, no data-drift. Sign-in
          // happens on the web login page inside the WebView.
          <Stack.Screen name="WebPortal" component={WebPortalScreen} />
        ) : !customer ? (
          // Customer mode without active session
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // Customer mode with active persistent session
          <Stack.Screen name="CustomerRoot" component={CustomerRoot} />
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
