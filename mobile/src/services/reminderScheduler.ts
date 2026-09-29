import type { EMIScheduleItem } from '../types';
import {
  IST_OFFSET_MS,
  addDaysIST,
  midnightIST,
  toISTDateString,
} from '../utils/ist';

/**
 * Deterministic, offline EMI reminder scheduler (pure logic — no I/O).
 *
 * This is the single source of truth for WHEN a reminder fires. It is consumed
 * by the native AlarmManager module (which schedules exact alarms from this
 * plan) and is fully unit-testable on its own. It never talks to the network:
 * given the locally-cached EMI + reminder config + "now", it returns the exact
 * set of future reminder occurrences within a horizon.
 *
 * Schedule (Sections 12–14, 20 of the brief), all in IST (Asia/Kolkata — the
 * timezone the whole app and the server use; India observes no DST, so an IST
 * wall-clock time maps to one fixed UTC instant):
 *
 *   PRE_DUE  : dueDate−5 … dueDate−1, at 10:00 and 18:00 each day.        (no voice)
 *   DUE_DAY  : the due date, every hour 00:00 … 23:00.                    (voice on)
 *   OVERDUE  : from 00:00 the day AFTER the due date, every 5 minutes,    (voice off
 *              while the overdue reminder is enabled.                       by default)
 *
 * Idempotency (Section 20): every occurrence has a STABLE id derived from the
 * EMI id + phase + exact fire instant, so recomputing after an app restart,
 * reboot, resync, timezone change or repeated login restoration yields the SAME
 * ids — the native side cancels ours that are no longer in the set and schedules
 * only the genuinely new ones, never duplicating.
 */

export type ReminderPhase = 'PRE_DUE' | 'DUE_DAY' | 'OVERDUE';
export type VoiceLanguage = 'bn' | 'hi';

export interface ReminderConfig {
  /** Master switch for all automatic local reminders. */
  reminderEnabled: boolean;
  /** Whether the every-5-minutes overdue burst runs (portal can turn OFF). */
  overdueReminderEnabled: boolean;
  /** Admin master switch for due-day voice. */
  voiceEnabled: boolean;
  /** Language for the spoken reminder. */
  voiceLanguage: VoiceLanguage;
  /**
   * Whether voice also plays on overdue reminders. Default false — the brief
   * says voice is due-day-only unless explicitly configured separately.
   */
  voiceOnOverdue?: boolean;
}

export interface ReminderOccurrence {
  /** Stable, deterministic id (safe to use as the AlarmManager request key). */
  id: string;
  emiId: string;
  emiNo: number;
  phase: ReminderPhase;
  /** Absolute fire instant, epoch ms (UTC). */
  fireAt: number;
  /** Human-readable IST wall-clock 'YYYY-MM-DD HH:mm' — for logs/tests only. */
  fireAtIST: string;
  /** Whether TTS should speak this reminder. */
  voice: boolean;
  language: VoiceLanguage;
  amount: number | null;
  /** Due date of the EMI this reminder is for, 'YYYY-MM-DD' (IST). */
  dueDate: string;
}

export interface PlanOptions {
  /** "Now" as epoch ms. Defaults to Date.now(). */
  now?: number;
  /**
   * How far ahead to materialise occurrences, ms. AlarmManager holds a finite
   * set, and the OVERDUE phase is infinite, so we only emit within this window
   * and the native side re-runs the planner on each fire / boot / foreground.
   * Default 26h — covers a full due day plus the pre-due 10:00/18:00 slots.
   */
  horizonMs?: number;
  /** Hard cap on emitted occurrences (safety valve). Default 400. */
  maxOccurrences?: number;
}

export const PRE_DUE_HOURS = [10, 18] as const;
export const PRE_DUE_DAY_OFFSETS = [-5, -4, -3, -2, -1] as const;
export const OVERDUE_INTERVAL_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_HORIZON_MS = 26 * HOUR_MS;
const DEFAULT_MAX = 400;

const PAID = new Set(['collected', 'APPROVED', 'PAID', 'paid']);

/** The next unpaid EMI in a schedule (earliest due), or null if all are paid. */
export function nextUnpaidEmi(emis: EMIScheduleItem[] | null | undefined): EMIScheduleItem | null {
  if (!emis || emis.length === 0) return null;
  const unpaid = emis
    .filter((e) => e.due_date && !PAID.has(String(e.status)))
    .sort((a, b) => midnightIST(a.due_date) - midnightIST(b.due_date));
  return unpaid[0] ?? null;
}

/** Epoch ms (UTC) for a given IST wall-clock date + hour + minute. */
function istWallToEpoch(dateStr: string, hour: number, minute: number): number {
  return midnightIST(dateStr) + (hour * 60 + minute) * 60 * 1000;
}

/** 'YYYY-MM-DD HH:mm' IST label for an epoch instant (logs/tests). */
function istLabel(epoch: number): string {
  const d = new Date(epoch + IST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function emiAmount(e: EMIScheduleItem): number | null {
  return typeof e.amount === 'number' ? e.amount : null;
}

/**
 * Compute the full set of future reminder occurrences for the account's next
 * unpaid EMI, within [now, now+horizon]. Deterministic and side-effect free.
 *
 * Returns an empty array when reminders are disabled, all EMIs are paid, or the
 * due date is unparseable — the caller then simply cancels everything.
 */
export function computeReminderPlan(
  emis: EMIScheduleItem[] | null | undefined,
  config: ReminderConfig,
  options: PlanOptions = {},
): ReminderOccurrence[] {
  if (!config.reminderEnabled) return [];

  const now = options.now ?? Date.now();
  const horizonMs = options.horizonMs ?? DEFAULT_HORIZON_MS;
  const maxOccurrences = options.maxOccurrences ?? DEFAULT_MAX;
  const windowEnd = now + horizonMs;

  const emi = nextUnpaidEmi(emis);
  if (!emi || !emi.due_date) return [];

  const dueDate = toISTDateString(emi.due_date);
  if (!dueDate) return [];

  const dueMidnight = midnightIST(dueDate);
  if (!Number.isFinite(dueMidnight)) return [];

  const amount = emiAmount(emi);
  const language = config.voiceLanguage;
  const out: ReminderOccurrence[] = [];

  const push = (phase: ReminderPhase, fireAt: number, voice: boolean) => {
    // Only future occurrences inside the horizon. Aligns exactly with what the
    // native module can actually schedule.
    if (fireAt <= now || fireAt > windowEnd) return;
    out.push({
      id: `emi:${emi.id}:${phase}:${fireAt}`,
      emiId: emi.id,
      emiNo: emi.emi_no,
      phase,
      fireAt,
      fireAtIST: istLabel(fireAt),
      voice,
      language,
      amount,
      dueDate,
    });
  };

  // PRE_DUE: dueDate−5 … dueDate−1 at 10:00 and 18:00. Never voice.
  for (const offset of PRE_DUE_DAY_OFFSETS) {
    const dayStr = addDaysIST(dueDate, offset);
    if (!dayStr) continue;
    for (const hour of PRE_DUE_HOURS) {
      push('PRE_DUE', istWallToEpoch(dayStr, hour, 0), false);
    }
  }

  // DUE_DAY: every hour 00:00 … 23:00. Voice on when the admin enabled it.
  const dueVoice = config.voiceEnabled === true;
  for (let hour = 0; hour < 24; hour += 1) {
    push('DUE_DAY', dueMidnight + hour * HOUR_MS, dueVoice);
  }

  // OVERDUE: every 5 min from 00:00 the day after the due date, while enabled.
  if (config.overdueReminderEnabled) {
    const overdueStart = midnightIST(addDaysIST(dueDate, 1));
    const overdueVoice = config.voiceEnabled === true && config.voiceOnOverdue === true;
    // First 5-minute slot at or after max(now, overdueStart), aligned to the grid.
    const from = Math.max(now, overdueStart);
    const k0 = Math.ceil((from - overdueStart) / OVERDUE_INTERVAL_MS);
    for (let k = Math.max(0, k0); ; k += 1) {
      const fireAt = overdueStart + k * OVERDUE_INTERVAL_MS;
      if (fireAt > windowEnd) break;
      if (fireAt <= now) continue;
      push('OVERDUE', fireAt, overdueVoice);
      if (out.length >= maxOccurrences) break;
    }
  }

  // Deterministic order (by fire instant) and hard cap.
  out.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  return out.length > maxOccurrences ? out.slice(0, maxOccurrences) : out;
}

/**
 * Diff a freshly computed plan against the currently-scheduled occurrence ids.
 * The native module uses this to schedule only genuinely-new alarms and cancel
 * ours that are no longer valid (e.g. after a payment) — the idempotent apply.
 */
export function diffPlan(
  next: ReminderOccurrence[],
  currentIds: readonly string[],
): { toSchedule: ReminderOccurrence[]; toCancel: string[] } {
  const current = new Set(currentIds);
  const nextIds = new Set(next.map((o) => o.id));
  return {
    toSchedule: next.filter((o) => !current.has(o.id)),
    toCancel: currentIds.filter((id) => !nextIds.has(id)),
  };
}
