import type { EMIScheduleItem } from '../types';
import { diffDaysIST } from './ist';

/**
 * Shared EMI-due reminder logic + bilingual (English + Bengali) copy, used by
 * the in-app popup, the Locked screen, and the background local notifications so
 * every surface says the same thing. Amounts/dates come from the same schedule
 * the rest of the app uses; this only decides WHEN and WHAT to remind.
 */

export interface EmiDueInfo {
  /** Whole IST-calendar days until the next unpaid EMI (negative = overdue). */
  daysUntilDue: number | null;
  dueToday: boolean;
  overdue: boolean;
  /** True when a reminder should be surfaced (due within 5 days or overdue). */
  shouldRemind: boolean;
  amount: number | null;
  dueDate: string | null;
}

const PAID = new Set(['collected', 'APPROVED', 'PAID', 'paid']);

/** The next unpaid EMI in a schedule, or null if all are paid. */
export function nextUnpaidEmi(emis: EMIScheduleItem[] | null | undefined): EMIScheduleItem | null {
  if (!emis || emis.length === 0) return null;
  const unpaid = emis
    .filter((e) => e.due_date && !PAID.has(String(e.status)))
    .sort((a, b) => Date.parse(a.due_date) - Date.parse(b.due_date));
  return unpaid[0] ?? null;
}

export function computeEmiDue(emis: EMIScheduleItem[] | null | undefined): EmiDueInfo {
  const e = nextUnpaidEmi(emis);
  if (!e || !e.due_date) {
    return { daysUntilDue: null, dueToday: false, overdue: false, shouldRemind: false, amount: null, dueDate: null };
  }
  const days = diffDaysIST(e.due_date, new Date()); // positive = due_date is in the future
  const dueToday = days === 0;
  const overdue = days < 0;
  return {
    daysUntilDue: days,
    dueToday,
    overdue,
    shouldRemind: days <= 5, // within 5 days OR overdue
    amount: typeof e.amount === 'number' ? e.amount : null,
    dueDate: e.due_date,
  };
}

/** Bilingual reminder copy for a given due state. */
export function reminderCopy(info: EmiDueInfo): { title: string; titleBn: string; body: string; bodyBn: string } {
  const amt = info.amount != null ? `₹${Math.round(info.amount).toLocaleString('en-IN')}` : '';
  if (info.dueToday || info.overdue) {
    return {
      title: 'EMI Due — Please Pay Today',
      titleBn: 'ইএমআই বকেয়া — আজই পরিশোধ করুন',
      body: `Your EMI ${amt} is due. Please pay today to avoid a device lock.`.replace('  ', ' '),
      bodyBn: `আপনার ইএমআই ${amt} বকেয়া। ডিভাইস লক এড়াতে আজই পরিশোধ করুন।`.replace('  ', ' '),
    };
  }
  const n = info.daysUntilDue ?? 0;
  return {
    title: `EMI due in ${n} day${n === 1 ? '' : 's'}`,
    titleBn: `আপনার ইএমআই ${n} দিনে বকেয়া`,
    body: `Your EMI ${amt} is due in ${n} day${n === 1 ? '' : 's'}. Please pay on time.`.replace('  ', ' '),
    bodyBn: `আপনার ইএমআই ${amt} ${n} দিনে বকেয়া। অনুগ্রহ করে সময়মতো পরিশোধ করুন।`.replace('  ', ' '),
  };
}
