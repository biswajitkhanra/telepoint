// services/emiCheckTask.ts
// Background EMI lookahead scheduler — checks if installment is due within 5 days and triggers local notifications

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { EMIScheduleItem } from '../types';

export const EMI_CHECK_TASK = 'TELEPOINT_EMI_DUE_CHECK';

TaskManager.defineTask(EMI_CHECK_TASK, async () => {
  try {
    const rawSession = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
    if (!rawSession) return BackgroundFetch.BackgroundFetchResult.NoData;

    const parsed = JSON.parse(rawSession);
    const emis: EMIScheduleItem[] = parsed.emis || [];

    // Find next unpaid EMI
    const unpaid = emis.find(
      e => e.status === 'pending' || e.status === 'UNPAID' || (e.status !== 'collected' && e.status !== 'APPROVED')
    );

    if (!unpaid || !unpaid.due_date) return BackgroundFetch.BackgroundFetchResult.NoData;

    const due = new Date(unpaid.due_date);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft >= 0 && daysLeft <= 5) {
      const title =
        daysLeft === 0
          ? '⚠️ Telepoint EMI Due Today!'
          : `🔔 Telepoint EMI Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

      const body = `Your installment of ₹${unpaid.amount.toLocaleString(
        'en-IN'
      )} is due on ${unpaid.due_date}. Tap to view your schedule.`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { screen: 'EmiSchedule' },
          sound: 'default',
        },
        trigger: null, // fire immediately
      });

      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.warn('[emiCheckTask] Execution failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerEMICheckTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(EMI_CHECK_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(EMI_CHECK_TASK, {
        minimumInterval: 60 * 60 * 8, // Every 8 hours
        stopOnTerminate: false,        // Survive app termination
        startOnBoot: true,             // Resume after reboot
      });
    }
  } catch (err) {
    console.warn('[registerEMICheckTask] Registration failed:', err);
  }
}
