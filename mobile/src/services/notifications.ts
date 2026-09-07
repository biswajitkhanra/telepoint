import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure foreground notification presentation options
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register device for push notifications and get the Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    // Android 8.0+ notification channels
    await Notifications.setNotificationChannelAsync('emi-reminders', {
      name: 'EMI Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A6FD6',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('broadcasts', {
      name: 'Announcements',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#1A6FD6',
      sound: 'default',
    });

    // Compatibility aliases
    await Notifications.setNotificationChannelAsync('telepoint-reminders', {
      name: 'EMI Reminders (Telepoint)',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A6FD6',
      sound: 'default',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Failed to get push token: permission not granted');
      return null;
    }

    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: projectId || undefined,
      });
      token = tokenData.data;
      console.info('[Notifications] Obtained Expo push token:', token);
    } catch (e) {
      console.warn('[Notifications] Error fetching push token:', e);
    }
  } else {
    console.info('[Notifications] Running on simulator/emulator - remote push token simulated');
    // Simulated token for development testing
    token = `ExponentPushToken[SimulatedDevice_${Platform.OS}_${Date.now()}]`;
  }

  return token;
}

/**
 * Hook up notification tap listener for deep-linking.
 */
export function setupNotificationResponseListener(
  onNavigate: (type: 'emi_reminder' | 'broadcast', data: Record<string, unknown>) => void
) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as {
      type?: 'emi_reminder' | 'broadcast';
      [key: string]: unknown;
    };

    if (data?.type) {
      onNavigate(data.type, data);
    }
  });

  return subscription;
}
