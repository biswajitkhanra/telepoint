// services/emiCheckTask.ts
// Background EMI lookahead scheduler — checks if installment is due within 5 days and triggers local notifications

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { EMIScheduleItem } from '../types';
import { syncDeviceCommandsOnce } from './deviceSync';

export const EMI_CHECK_TASK = 'TELEPOINT_EMI_DUE_CHECK';

/**
 * Best-effort device-command delivery from the background-fetch window, so an
 * authorised LOCK/UNLOCK still reaches the device when the app is not open.
 * Foreground delivery is handled by useDeviceCommands; this is the closed-app
 * safety net (subject to Android's background-fetch throttling). Never throws.
 */
async function runDeviceCommandSync(): Promise<boolean> {
  try {
    const rawSession = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
    if (!rawSession) return false;
    const customerId = JSON.parse(rawSession)?.customer?.id;
    if (typeof customerId !== 'string' || !customerId) return false;
    const { lockedChangeTo } = await syncDeviceCommandsOnce(customerId);
    return lockedChangeTo !== undefined;
  } catch {
    return false;
  }
}

/** EMI due-date reminder pass. Returns true if a notification was scheduled. */
async function runEmiReminder(): Promise<boolean> {
  const rawSession = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
  if (!rawSession) return false;

  const parsed = JSON.parse(rawSession);
  const emis: EMIScheduleItem[] = parsed.emis || [];

  // Find next unpaid EMI
  const unpaid = emis.find(
    e => e.status === 'pending' || e.status === 'UNPAID' || (e.status !== 'collected' && e.status !== 'APPROVED')
  );

  if (!unpaid || !unpaid.due_date) return false;

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
    return true;
  }
  return false;
}

TaskManager.defineTask(EMI_CHECK_TASK, async () => {
  try {
    // Deliver any authorised device LOCK/UNLOCK first (closed-app safety net),
    // then run the EMI reminder. Both are independent and best-effort.
    const didDeviceWork = await runDeviceCommandSync();
    const didNotify = await runEmiReminder();

    return (didDeviceWork || didNotify)
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
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
        // 15 min is Android's practical floor; the OS throttles further based on
        // usage. Kept short (was 8h) so an authorised device lock/unlock reaches
        // a closed app within a reasonable window, not hours later.
        minimumInterval: 15 * 60,
        stopOnTerminate: false,        // Survive app termination
        startOnBoot: true,             // Resume after reboot
      });
    }
  } catch (err) {
    console.warn('[registerEMICheckTask] Registration failed:', err);
  }
}
