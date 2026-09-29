/**
 * Types for the native offline reminder engine bridge. The JS reminder service
 * computes the schedule (see mobile/src/services/reminderScheduler.ts), enriches
 * each occurrence with the localized copy + cached photo path, and hands the
 * whole plan to the native side, which schedules exact alarms.
 */

export type ReminderPhase = 'PRE_DUE' | 'DUE_DAY' | 'OVERDUE';
export type VoiceLanguage = 'bn' | 'hi';

/** One reminder the native side will fire, fully render-ready. */
export interface NativeReminderOccurrence {
  /** Stable id from the scheduler; also the alarm key. */
  id: string;
  phase: ReminderPhase;
  /** Absolute fire instant, epoch ms (UTC). */
  fireAt: number;
  /** Whether TTS should speak this reminder. */
  voice: boolean;
  language: VoiceLanguage;
  /** Notification title (already localized). */
  title: string;
  /** Notification body (already localized). */
  body: string;
  /** Spoken text (already localized); may equal body. */
  speech?: string;
  /** Absolute local file path to the cached customer photo, if available. */
  photoPath?: string | null;
  /** For deep-linking the notification tap into the app. */
  emiId?: string;
  amount?: number | null;
  dueDate?: string;
}

/** Overdue chaining config the native receiver reads to keep firing app-closed. */
export interface OverdueChaining {
  enabled: boolean;
  /** Epoch ms of the first possible overdue tick (00:00 the day after due). */
  startMs: number;
  intervalMs: number;
  /** Epoch ms when overdue chaining should stop (e.g. far future / paid). */
  untilMs: number;
  voice: boolean;
  language: VoiceLanguage;
  title: string;
  body: string;
  speech?: string;
  photoPath?: string | null;
  emiId?: string;
}

export interface ApplyPlanInput {
  occurrences: NativeReminderOccurrence[];
  overdue?: OverdueChaining | null;
}

export interface ExactAlarmStatus {
  /** Android 12+ (API 31): whether SCHEDULE_EXACT_ALARM is granted. Older: true. */
  canScheduleExactAlarms: boolean;
  sdkInt: number;
}
