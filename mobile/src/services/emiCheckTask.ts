// services/emiCheckTask.ts
// Background EMI lookahead scheduler — checks if installment is due within 5 days and triggers local notifications

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import { EMIScheduleItem } from '../types';
import { syncDeviceCommandsOnce } from './deviceSync';
import { computeEmiDue, reminderCopy } from '../utils/emiReminder';

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

const NOTIF_DAILY_KEY = '@telepoint_emi_notif_daily'; // { date, count }

/**
 * EMI due-date reminder pass (fires even when the app is CLOSED, via the
 * background-fetch window). Bilingual (English + Bengali). Rate-limited per
 * calendar day so it does not spam: up to 5/day when due today or overdue,
 * 1/day when the EMI is due within the next 5 days. Returns true if a
 * notification was scheduled.
 */
async function runEmiReminder(): Promise<boolean> {
  const rawSession = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
  if (!rawSession) return false;

  const parsed = JSON.parse(rawSession);
  const emis: EMIScheduleItem[] = parsed.emis || [];

  const info = computeEmiDue(emis);
  if (!info.shouldRemind) return false;

  // Per-day cap.
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  try {
    const raw = await AsyncStorage.getItem(NOTIF_DAILY_KEY);
    const p = raw ? JSON.parse(raw) : null;
    count = p && p.date === today ? Number(p.count) || 0 : 0;
  } catch { /* storage unavailable */ }
  const max = info.dueToday || info.overdue ? 5 : 1;
  if (count >= max) return false;

  const copy = reminderCopy(info);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: `${copy.body}\n${copy.bodyBn}`,
      data: { screen: 'EmiSchedule', type: 'emi_reminder' },
      sound: 'default',
    },
    // ~immediate, on the HIGH-importance channel so it shows as a heads-up
    // banner on the screen even when the app is not open.
    trigger: { seconds: 1, channelId: 'emi-reminders' } as Notifications.NotificationTriggerInput,
  });

  try { await AsyncStorage.setItem(NOTIF_DAILY_KEY, JSON.stringify({ date: today, count: count + 1 })); } catch { /* ignore */ }
  return true;
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
