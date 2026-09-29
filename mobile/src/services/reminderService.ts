import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config';
import type { EMIScheduleItem } from '../types';
import { addDaysIST, midnightIST, toISTDateString } from '../utils/ist';
import {
  computeReminderPlan,
  nextUnpaidEmi,
  OVERDUE_INTERVAL_MS,
  type ReminderConfig,
  type ReminderOccurrence,
} from './reminderScheduler';
import { localizedReminderCopy, manualReminderCopy } from './reminderCopy';
import * as Notifications from 'expo-notifications';
import {
  applyPlan,
  cancelAll,
  getExactAlarmStatus,
  isSupported as remindersSupported,
  requestExactAlarmPermission,
  speakNow,
  type NativeReminderOccurrence,
  type OverdueChaining,
} from 'expo-telepoint-reminders';

/**
 * Orchestrates the OFFLINE EMI reminder engine: reads the locally-cached EMIs +
 * reminder config + customer photo, computes the deterministic plan (pure,
 * unit-tested scheduler), localizes the copy, and hands the whole plan to the
 * native AlarmManager module. This never hits the network for automatic
 * reminders (Section 11) — the only network use is a one-time photo cache.
 *
 * Idempotent: safe to call on login, on every data refresh, on foreground and
 * after a resync. The native side reconciles to exactly this plan.
 */

const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_UNTIL_MS = 90 * DAY; // safety cap; cleared on payment / disable

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  reminderEnabled: true,
  overdueReminderEnabled: true,
  voiceEnabled: true,
  voiceLanguage: 'bn',
  voiceOnOverdue: false,
};

export async function loadReminderConfig(): Promise<ReminderConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_CONFIG);
    if (!raw) return DEFAULT_REMINDER_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_REMINDER_CONFIG, ...parsed };
  } catch {
    return DEFAULT_REMINDER_CONFIG;
  }
}

/** Persist config (from a server sync) and re-apply the schedule. */
export async function saveReminderConfig(cfg: Partial<ReminderConfig>): Promise<void> {
  const merged = { ...(await loadReminderConfig()), ...cfg };
  try { await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_CONFIG, JSON.stringify(merged)); } catch { /* ignore */ }
  await syncReminders();
}

export async function getCachedPhotoPath(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_PHOTO_META);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    return typeof meta?.path === 'string' ? meta.path : null;
  } catch {
    return null;
  }
}

/**
 * Download the customer photo to a local file ONCE (offline reminders show it
 * without a network call — Section 16). Re-downloads only when the URL changes.
 * Uses expo-file-system when available; degrades to null otherwise.
 */
export async function cacheCustomerPhoto(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let FS: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FS = require('expo-file-system');
  } catch {
    return null;
  }
  try {
    const dir: string | null = FS.cacheDirectory ?? null;
    if (!dir) return null;
    const target = `${dir}telepoint-customer-photo.jpg`;

    const metaRaw = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_PHOTO_META);
    const meta = metaRaw ? JSON.parse(metaRaw) : null;
    if (meta?.url === url && meta?.path) {
      try {
        const info = await FS.getInfoAsync(meta.path);
        if (info?.exists) return meta.path;
      } catch { /* re-download below */ }
    }

    const dl = await FS.downloadAsync(url, target);
    if (dl?.status === 200) {
      await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_PHOTO_META, JSON.stringify({ url, path: target }));
      return target;
    }
    return meta?.path ?? null;
  } catch {
    return null;
  }
}

interface SessionShape {
  customer?: { id?: string; customer_name?: string; customer_photo_url?: string | null } | null;
  emis?: EMIScheduleItem[];
}

async function readSession(): Promise<SessionShape | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
    return raw ? (JSON.parse(raw) as SessionShape) : null;
  } catch {
    return null;
  }
}

function enrich(
  o: ReminderOccurrence,
  customerName: string | null | undefined,
  photoPath: string | null,
): NativeReminderOccurrence {
  const copy = localizedReminderCopy({
    phase: o.phase,
    amount: o.amount,
    dueDate: o.dueDate,
    customerName,
    language: o.language,
  });
  return {
    id: o.id,
    phase: o.phase,
    fireAt: o.fireAt,
    voice: o.voice,
    language: o.language,
    title: copy.title,
    body: copy.body,
    speech: copy.speech,
    photoPath,
    emiId: o.emiId,
    amount: o.amount,
    dueDate: o.dueDate,
  };
}

/**
 * Recompute and apply the entire reminder plan from local data. Returns the
 * number of alarms scheduled (0 when unsupported, disabled, or all paid).
 */
export async function syncReminders(): Promise<{ scheduled: number }> {
  if (!remindersSupported()) return { scheduled: 0 };

  const session = await readSession();
  const emis = session?.emis ?? [];
  const customerName = session?.customer?.customer_name ?? null;

  const config = await loadReminderConfig();
  if (!config.reminderEnabled) {
    await cancelAll();
    return { scheduled: 0 };
  }

  const emi = nextUnpaidEmi(emis);
  if (!emi || !emi.due_date) {
    await cancelAll(); // everything paid → cancel all future reminders
    return { scheduled: 0 };
  }

  const photoPath = await getCachedPhotoPath();
  const now = Date.now();

  // Pre-due + due-day occurrences (the native OVERDUE chain handles the
  // every-5-minutes burst, so we exclude discrete OVERDUE items here).
  const plan = computeReminderPlan(emis, config, { now, horizonMs: 8 * DAY });
  const occurrences = plan
    .filter((o) => o.phase !== 'OVERDUE')
    .map((o) => enrich(o, customerName, photoPath));

  // Overdue chain (self-perpetuating on the device while enabled + unpaid).
  let overdue: OverdueChaining | null = null;
  const dueDate = toISTDateString(emi.due_date);
  const overdueStart = midnightIST(addDaysIST(dueDate, 1));
  if (config.overdueReminderEnabled && Number.isFinite(overdueStart)) {
    const copy = localizedReminderCopy({
      phase: 'OVERDUE',
      amount: typeof emi.amount === 'number' ? emi.amount : null,
      dueDate,
      customerName,
      language: config.voiceLanguage,
    });
    overdue = {
      enabled: true,
      startMs: overdueStart,
      intervalMs: OVERDUE_INTERVAL_MS,
      untilMs: overdueStart + OVERDUE_UNTIL_MS,
      voice: config.voiceEnabled === true && config.voiceOnOverdue === true,
      language: config.voiceLanguage,
      title: copy.title,
      body: copy.body,
      speech: copy.speech,
      photoPath,
      emiId: emi.id,
    };
  }

  return applyPlan({ occurrences, overdue });
}

export async function cancelAllReminders(): Promise<void> {
  if (!remindersSupported()) return;
  await cancelAll();
}

interface ServerReminderConfig {
  reminder_enabled: boolean;
  overdue_reminder_enabled: boolean;
  voice_enabled: boolean;
  voice_language: 'bn' | 'hi';
  voice_on_overdue: boolean;
  schedule_version: number;
}

/**
 * Apply reminder config synced from the server (via the device poll). Only
 * re-applies the alarm plan when the server's schedule_version changed, so the
 * routine 60s poll is cheap. First sync (no stored version) always applies.
 */
export async function syncReminderConfigFromServer(payload: ServerReminderConfig | null | undefined): Promise<void> {
  if (!payload) return;
  const cfg = {
    reminderEnabled: payload.reminder_enabled,
    overdueReminderEnabled: payload.overdue_reminder_enabled,
    voiceEnabled: payload.voice_enabled,
    voiceLanguage: payload.voice_language,
    voiceOnOverdue: payload.voice_on_overdue,
    _version: payload.schedule_version,
  };
  let lastVersion: number | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_CONFIG);
    if (raw) lastVersion = (JSON.parse(raw)?._version ?? null) as number | null;
  } catch { /* ignore */ }

  try { await AsyncStorage.setItem(STORAGE_KEYS.REMINDER_CONFIG, JSON.stringify(cfg)); } catch { /* ignore */ }

  if (lastVersion !== payload.schedule_version) {
    await syncReminders();
  }
}

/**
 * Present a MANUAL admin/retailer reminder immediately (Section 18): a heads-up
 * notification plus optional TTS in the configured language. Called when the app
 * receives an EMI_REMINDER command (foreground, or woken by the command push).
 */
export async function presentManualReminder(opts: {
  amount: number | null;
  dueDate: string | null | undefined;
  customerName: string | null | undefined;
  voice: boolean;
  language: 'bn' | 'hi';
}): Promise<void> {
  const copy = manualReminderCopy(opts.amount, opts.dueDate, opts.customerName, opts.language);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: { type: 'emi_reminder', screen: 'EmiSchedule' },
      },
      trigger: { seconds: 1, channelId: 'emi-reminders' } as Notifications.NotificationTriggerInput,
    });
  } catch { /* notifications unavailable */ }

  if (opts.voice) {
    try { await speakNow(copy.speech, opts.language); } catch { /* TTS unavailable */ }
  }
}

/** Exposed for the consent/status UI: whether exact alarms can be scheduled. */
export async function reminderExactAlarmStatus() {
  return getExactAlarmStatus();
}

/** Open the OS "Alarms & reminders" screen so the user can allow exact alarms. */
export async function requestReminderExactAlarmPermission(): Promise<void> {
  if (!remindersSupported()) return;
  await requestExactAlarmPermission();
}
