// services/emiCheckTask.ts
// Background-fetch SAFETY NET (not the reminder mechanism).
//
// IMPORTANT: EMI reminders fire from exact AlarmManager alarms scheduled by the
// native `expo-telepoint-reminders` module — NOT from this background-fetch
// window. Android throttles background-fetch and never guarantees a cadence, so
// it is used here only to:
//   1. deliver an authorised device LOCK/UNLOCK to a closed app (best-effort), and
//   2. RE-APPLY the reminder plan so the overdue window keeps rolling forward and
//      any EMI/config change since the last app open is reflected in the alarms.
// The reminders themselves do not depend on this task running on time.

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { syncDeviceCommandsOnce } from './deviceSync';
import { syncReminders } from './reminderService';

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

TaskManager.defineTask(EMI_CHECK_TASK, async () => {
  try {
    const didDeviceWork = await runDeviceCommandSync();

    // Re-apply the exact-alarm reminder plan (idempotent). This does NOT show a
    // reminder — it just keeps the scheduled alarms current so the AlarmManager
    // keeps firing them even after long closed periods / config changes.
    let reminderScheduled = 0;
    try { reminderScheduled = (await syncReminders()).scheduled; } catch { /* engine absent */ }

    return didDeviceWork || reminderScheduled > 0
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
        // 15 min is Android's practical floor. This only re-syncs commands + the
        // alarm plan; the reminders fire via exact alarms regardless of this.
        minimumInterval: 15 * 60,
        stopOnTerminate: false, // survive app termination
        startOnBoot: true,      // resume after reboot
      });
    }
  } catch (err) {
    console.warn('[registerEMICheckTask] Registration failed:', err);
  }
}
