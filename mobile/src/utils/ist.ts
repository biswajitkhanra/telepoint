/**
 * IST (Asia/Kolkata, UTC+5:30) timezone helpers for Mobile.
 *
 * Matches lib/ist.ts in the web application so that 30-day grace,
 * weekly compounding, and upcoming EMI day counts are 100% accurate
 * and match server-side evaluation.
 */

export const IST_OFFSET_MINUTES = 5 * 60 + 30;
export const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

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

/** UTC timestamp ms for IST midnight at the start of the given calendar date. */
export function midnightIST(value: string | Date): number {
  const s = toISTDateString(value);
  if (!s) return Number.NaN;
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
}

/** Calendar-day difference in IST: positive if `a` is after `b`. */
export function diffDaysIST(a: string | Date, b: string | Date): number {
  const ad = midnightIST(a);
  const bd = midnightIST(b);
  return Math.floor((ad - bd) / MS_PER_DAY);
}

/** Add N calendar days to an IST date and return YYYY-MM-DD. */
export function addDaysIST(value: string | Date, days: number): string {
  const base = midnightIST(value);
  if (!Number.isFinite(base)) return '';
  const next = new Date(base + days * MS_PER_DAY + IST_OFFSET_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Format an ISO timestamp as DD-Mon-YY in IST. */
export function formatShortDateIST(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const day = pad(ist.getUTCDate());
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][ist.getUTCMonth()];
  const yr = String(ist.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}
