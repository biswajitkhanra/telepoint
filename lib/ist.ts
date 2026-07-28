/**
 * IST (Asia/Kolkata, UTC+5:30) timezone helpers.
 *
 * Vercel + Node default to UTC. All time-sensitive math in this portal —
 * the 30-day fine grace, the 7-day weekly compounding, the monthly
 * collection window — MUST evaluate against the IST calendar so the
 * midnight rollover matches Indian standard operations.
 *
 * Every public helper here works in IST. Callers should not do timezone
 * math themselves; pull from here so behaviour is uniform across server
 * routes, RPCs, and client components.
 */

export const IST_OFFSET_MINUTES = 5 * 60 + 30;
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Now, expressed as "wall clock IST" inside a Date whose UTC fields are IST. */
function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Today's IST calendar date as YYYY-MM-DD (string only — no time component). */
export function todayIST(): string {
  const n = istNow();
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
}

/** Treat the given ISO string / date as a calendar date in IST and return YYYY-MM-DD. */
export function toISTDateString(value: string | Date | null | undefined): string {
  if (!value) return '';
  const raw = typeof value === 'string' ? value : value.toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** Calendar-day difference in IST: positive if `a` is after `b`. */
export function diffDaysIST(a: string | Date, b: string | Date): number {
  const ad = midnightIST(a);
  const bd = midnightIST(b);
  return Math.floor((ad - bd) / MS_PER_DAY);
}

/** UTC timestamp ms for IST midnight at the start of the given calendar date. */
export function midnightIST(value: string | Date): number {
  const s = toISTDateString(value);
  if (!s) return Number.NaN;
  const [y, m, d] = s.split('-').map(Number);
  // IST midnight in UTC = (Y-M-D 00:00 IST) → subtract IST offset
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

/** Add N calendar days to an IST date and return YYYY-MM-DD. */
export function addDaysIST(value: string | Date, days: number): string {
  const base = midnightIST(value);
  if (!Number.isFinite(base)) return '';
  const next = new Date(base + days * MS_PER_DAY + IST_OFFSET_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** UTC range [start, end] for an IST month (1-12). */
export function istMonthRange(year: number, month1to12: number): { startUtc: string; endUtc: string } {
  // IST start of month-1st 00:00:00 → in UTC = month-start - offset
  const start = Date.UTC(year, month1to12 - 1, 1) - IST_OFFSET_MS;
  // IST end is last millisecond of last day of month
  const end = Date.UTC(year, month1to12, 0, 23, 59, 59, 999) - IST_OFFSET_MS;
  return { startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() };
}

/** Format an ISO timestamp as DD-Mon-YY in IST. */
export function formatShortDateIST(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const day = pad(ist.getUTCDate());
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ist.getUTCMonth()];
  const yr = String(ist.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

/** Format an ISO timestamp as DD.MM.YY in IST (payment-receipt style). */
export function formatPaymentDateIST(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCDate())}.${pad(ist.getUTCMonth() + 1)}.${String(ist.getUTCFullYear()).slice(-2)}`;
}

/** Yesterday's IST calendar date as YYYY-MM-DD. */
export function yesterdayIST(): string {
  return addDaysIST(todayIST(), -1);
}

/** N days ago in IST as YYYY-MM-DD. */
export function daysAgoIST(n: number): string {
  return addDaysIST(todayIST(), -n);
}

/** First day of the current IST month as YYYY-MM-DD. */
export function firstOfMonthIST(): string {
  const n = istNow();
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-01`;
}

/** First day of last IST month as YYYY-MM-DD. */
export function firstOfLastMonthIST(): string {
  const n = istNow();
  let y = n.getUTCFullYear();
  let m = n.getUTCMonth(); // 0-indexed, so "last month"
  if (m < 0) { m = 11; y -= 1; }
  return `${y}-${pad(m + 1)}-01`;
}

/** Last day of last IST month as YYYY-MM-DD. */
export function lastOfLastMonthIST(): string {
  const n = istNow();
  // Day 0 of current month = last day of previous month
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

/** Date range preset keys used by the filter bar. */
export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom';

/** Resolve a preset to a concrete IST date range { from, to }. */
export function istDateRange(preset: DateRangePreset): { from: string; to: string } {
  const today = todayIST();
  switch (preset) {
    case 'today':        return { from: today, to: today };
    case 'yesterday':    { const y = yesterdayIST(); return { from: y, to: y }; }
    case 'last_7_days':  return { from: daysAgoIST(6), to: today };
    case 'last_30_days': return { from: daysAgoIST(29), to: today };
    case 'this_month':   return { from: firstOfMonthIST(), to: today };
    case 'last_month':   return { from: firstOfLastMonthIST(), to: lastOfLastMonthIST() };
    case 'custom':       return { from: today, to: today };
    default:             return { from: today, to: today };
  }
}

/**
 * Validate that a YYYY-MM-DD date is a valid past or present date in IST.
 * Returns an error message, or null if valid.
 */
export function validatePaymentDate(value: string | null | undefined): string | null {
  if (!value) return 'Payment date is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Invalid date format (expected YYYY-MM-DD)';
  const [y, m, d] = value.split('-').map(Number);
  // Basic calendar validation
  const testDate = new Date(Date.UTC(y, m - 1, d));
  if (testDate.getUTCFullYear() !== y || testDate.getUTCMonth() !== m - 1 || testDate.getUTCDate() !== d) {
    return 'Invalid calendar date';
  }
  // Must not be in the future (IST)
  const today = todayIST();
  if (value > today) return 'Payment date cannot be in the future';
  return null;
}

/**
 * Convert a YYYY-MM-DD payment date to an ISO timestamp at IST midnight.
 * Used when APIs need to store a timestamp but the user only picks a date.
 */
export function paymentDateToISO(dateStr: string): string {
  const ms = midnightIST(dateStr);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function pad(n: number) { return String(n).padStart(2, '0'); }
