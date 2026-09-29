import { Platform } from 'react-native';
import type {
  ApplyPlanInput,
  ExactAlarmStatus,
  VoiceLanguage,
} from './src/ExpoTelepointReminders.types';

export * from './src/ExpoTelepointReminders.types';

/**
 * TelePoint offline reminder engine bridge.
 *
 * The JS scheduler decides WHEN each reminder fires; this native module makes
 * it actually happen when the app is closed, using ONLY documented Android
 * APIs:
 *   • AlarmManager.setExactAndAllowWhileIdle (exact, survives Doze)
 *   • a BroadcastReceiver that posts the notification (+ optional TextToSpeech)
 *   • BOOT_COMPLETED rescheduling from a persisted plan
 *
 * No root, no hidden APIs, no fake system UI. On non-Android / Expo Go (native
 * module absent) every call degrades to a safe no-op so the JS app still runs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let native: any = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('ExpoTelepointReminders');
  }
} catch {
  native = null;
}

export function isSupported(): boolean {
  return Platform.OS === 'android' && native != null;
}

/** Android 12+ requires SCHEDULE_EXACT_ALARM for exact alarms; report honestly. */
export async function getExactAlarmStatus(): Promise<ExactAlarmStatus> {
  if (!isSupported()) return { canScheduleExactAlarms: false, sdkInt: 0 };
  try { return await native.getExactAlarmStatus(); } catch { return { canScheduleExactAlarms: false, sdkInt: 0 }; }
}

/** Opens the OS "Alarms & reminders" screen so the user can allow exact alarms. */
export async function requestExactAlarmPermission(): Promise<void> {
  if (!isSupported()) return;
  try { await native.requestExactAlarmPermission(); } catch { /* noop */ }
}

/**
 * Replace the entire scheduled reminder set with `input`. Idempotent: the native
 * side cancels the alarms it previously owned and schedules exactly this plan,
 * so repeated calls (foreground poll, resync, boot) never duplicate reminders.
 * Returns the number of alarms actually scheduled.
 */
export async function applyPlan(input: ApplyPlanInput): Promise<{ scheduled: number }> {
  if (!isSupported()) return { scheduled: 0 };
  try {
    return await native.applyPlan(JSON.stringify(input));
  } catch {
    return { scheduled: 0 };
  }
}

/** Cancel every TelePoint reminder alarm and clear the persisted plan. */
export async function cancelAll(): Promise<void> {
  if (!isSupported()) return;
  try { await native.cancelAll(); } catch { /* noop */ }
}

/** The ids currently scheduled (for diagnostics / tests on device). */
export async function getScheduledIds(): Promise<string[]> {
  if (!isSupported()) return [];
  try { return await native.getScheduledIds(); } catch { return []; }
}

/** Speak text immediately (used for the in-app due-day voice / a test button). */
export async function speakNow(text: string, language: VoiceLanguage): Promise<boolean> {
  if (!isSupported()) return false;
  try { return await native.speakNow(text, language); } catch { return false; }
}
