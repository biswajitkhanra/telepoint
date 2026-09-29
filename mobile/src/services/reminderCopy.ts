import { formatShortDateIST } from '../utils/ist';
import type { ReminderPhase, VoiceLanguage } from './reminderScheduler';

/**
 * Localized reminder copy (English + Bengali + Hindi). The notification body
 * shows English plus the customer's configured language; the spoken text is in
 * the configured language only. Kept here (not in the pure scheduler) so the
 * scheduler stays timing-only and testable.
 */

export interface CopyInput {
  phase: ReminderPhase;
  amount: number | null;
  dueDate: string; // YYYY-MM-DD (IST)
  customerName?: string | null;
  language: VoiceLanguage;
}

export interface ReminderCopy {
  title: string;
  body: string;
  speech: string;
}

function money(amount: number | null): string {
  if (amount == null) return '';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

const TITLE_EN: Record<ReminderPhase, string> = {
  PRE_DUE: 'EMI Reminder',
  DUE_DAY: 'EMI Due Today',
  OVERDUE: 'EMI Overdue',
};
const TITLE_BN: Record<ReminderPhase, string> = {
  PRE_DUE: 'ইএমআই রিমাইন্ডার',
  DUE_DAY: 'আজ ইএমআই বকেয়া',
  OVERDUE: 'ইএমআই বকেয়া',
};
const TITLE_HI: Record<ReminderPhase, string> = {
  PRE_DUE: 'ईएमआई रिमाइंडर',
  DUE_DAY: 'आज ईएमआई देय',
  OVERDUE: 'ईएमआई अतिदेय',
};

function bodyEn(i: CopyInput, dateLabel: string): string {
  const amt = money(i.amount);
  if (i.phase === 'PRE_DUE') return `Your EMI ${amt} is due on ${dateLabel}. Please pay on time.`.replace('  ', ' ');
  if (i.phase === 'DUE_DAY') return `Your EMI ${amt} is due today. Please pay to avoid a device lock.`.replace('  ', ' ');
  return `Your EMI ${amt} is overdue. Please pay now to avoid a device lock.`.replace('  ', ' ');
}

function bodyBn(i: CopyInput, dateLabel: string): string {
  const amt = money(i.amount);
  if (i.phase === 'PRE_DUE') return `আপনার ইএমআই ${amt} ${dateLabel} তারিখে বকেয়া। অনুগ্রহ করে সময়মতো পরিশোধ করুন।`.replace('  ', ' ');
  if (i.phase === 'DUE_DAY') return `আপনার ইএমআই ${amt} আজ বকেয়া। ডিভাইস লক এড়াতে আজই পরিশোধ করুন।`.replace('  ', ' ');
  return `আপনার ইএমআই ${amt} বকেয়া হয়ে গেছে। ডিভাইস লক এড়াতে এখনই পরিশোধ করুন।`.replace('  ', ' ');
}

function bodyHi(i: CopyInput, dateLabel: string): string {
  const amt = money(i.amount);
  if (i.phase === 'PRE_DUE') return `आपकी ईएमआई ${amt} ${dateLabel} को देय है। कृपया समय पर भुगतान करें।`.replace('  ', ' ');
  if (i.phase === 'DUE_DAY') return `आपकी ईएमआई ${amt} आज देय है। डिवाइस लॉक से बचने के लिए आज ही भुगतान करें।`.replace('  ', ' ');
  return `आपकी ईएमआई ${amt} अतिदेय है। डिवाइस लॉक से बचने के लिए अभी भुगतान करें।`.replace('  ', ' ');
}

export function localizedReminderCopy(input: CopyInput): ReminderCopy {
  const dateLabel = formatShortDateIST(input.dueDate) || input.dueDate;
  const name = input.customerName ? `${input.customerName}, ` : '';
  const native = input.language === 'hi' ? bodyHi : bodyBn;
  const nativeTitle = input.language === 'hi' ? TITLE_HI : TITLE_BN;

  const en = bodyEn(input, dateLabel);
  const loc = native(input, dateLabel);

  return {
    title: `${nativeTitle[input.phase]} · ${TITLE_EN[input.phase]}`,
    // Two lines: English then the customer's language, personalised by name.
    body: `${name}${en}\n${loc}`,
    // Spoken line in the configured language only, personalised by name.
    speech: `${name}${loc}`,
  };
}
