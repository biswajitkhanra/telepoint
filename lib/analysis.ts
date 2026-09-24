// ─────────────────────────────────────────────────────────────────────────────
// Month-vs-same-month-last-year analysis, computed from the FULL database.
//
// Source of truth is emi_schedule (+ customers), NOT payment_requests: history
// imported from the Google sheets never had payment requests, so anything read
// from payment_requests shows ₹0 for every month before the portal went live.
// Every EMI is bucketed by its own collection date
//   collection_requested_at → paid_at → due_date
// in IST, which is the same rule as migration 023's get_emi_analysis().
//
// Pure function: callers load every row (paged past PostgREST's 1000-row cap)
// and pass them in, so the numbers never depend on which migrations were run.
// ─────────────────────────────────────────────────────────────────────────────
import { toISTDateString } from './ist';

export interface PeriodMetrics {
  loanGiven: number;
  collected: number;
  customers: number;
  dueEmis: number;
  bouncedEmis: number;
}
export interface LeaderRow { retailerId: string; name: string; value: number }
export interface AnalysisData {
  thisYear: PeriodMetrics;
  lastYear: PeriodMetrics;
  leadLeaderboard: LeaderRow[];
  collectionLeaderboard: LeaderRow[];
}

export type AnalysisCustomer = {
  id: string; retailer_id?: string | null; status?: string | null;
  purchase_date?: string | null; created_at?: string | null;
  purchase_value?: number | null; down_payment?: number | null; disburse_amount?: number | null;
  first_emi_charge_amount?: number | null; first_emi_charge_paid_amount?: number | null;
  first_emi_charge_paid_at?: string | null;
};
export type AnalysisEmi = {
  customer_id: string; due_date?: string | null; status?: string | null;
  amount?: number | null; partial_paid_amount?: number | null; fine_paid_amount?: number | null;
  paid_at?: string | null; collection_requested_at?: string | null;
};

const COUNTED = new Set(['RUNNING', 'COMPLETE']);
const empty = (): PeriodMetrics => ({ loanGiven: 0, collected: 0, customers: 0, dueEmis: 0, bouncedEmis: 0 });

/** "YYYY-MM" of a timestamp/date in IST, or '' when missing/invalid. */
export function istMonth(value: string | null | undefined): string {
  if (!value) return '';
  return (value.length <= 10 ? value : toISTDateString(value) || '').slice(0, 7);
}

export function loanOf(c: AnalysisCustomer): number {
  const disbursed = Number(c.disburse_amount || 0);
  if (disbursed > 0) return disbursed;
  return Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
}

export const collectionDateOf = (e: AnalysisEmi) =>
  e.collection_requested_at || e.paid_at || e.due_date || null;

const paidOnSchedule = (e: AnalysisEmi, customerStatus?: string | null) =>
  e.status === 'APPROVED' || customerStatus === 'COMPLETE';

export const emiPrincipalCollected = (e: AnalysisEmi, customerStatus?: string | null) =>
  paidOnSchedule(e, customerStatus) ? Number(e.amount || 0) : Number(e.partial_paid_amount || 0);

const firstChargeCollected = (c: AnalysisCustomer) =>
  Number(c.first_emi_charge_paid_amount || 0) ||
  (c.first_emi_charge_paid_at ? Number(c.first_emi_charge_amount || 0) : 0);

export function computeAnalysis(
  customers: AnalysisCustomer[],
  emis: AnalysisEmi[],
  retailers: { id: string; name: string }[],
  month: number,
  year: number,
): AnalysisData {
  const ym = (y: number) => `${y}-${String(month).padStart(2, '0')}`;
  const cur = ym(year);
  const prev = ym(year - 1);

  const statusOf = new Map<string, string>();
  const retailerOf = new Map<string, string>();
  for (const c of customers) {
    statusOf.set(c.id, c.status || '');
    if (c.retailer_id) retailerOf.set(c.id, c.retailer_id);
  }

  const periods: Record<string, PeriodMetrics> = { [cur]: empty(), [prev]: empty() };
  const leads = new Map<string, number>();
  const coll = new Map<string, number>();
  const add = (mp: Map<string, number>, k: string | undefined | null, v: number) => {
    if (k && v) mp.set(k, (mp.get(k) || 0) + v);
  };

  for (const c of customers) {
    if (!COUNTED.has(c.status || '')) continue;
    const opened = istMonth(c.purchase_date || c.created_at);
    const p = periods[opened];
    if (p) { p.loanGiven += loanOf(c); p.customers += 1; }
    if (opened === cur) add(leads, c.retailer_id, 1);

    const fc = firstChargeCollected(c);
    const fcMonth = istMonth(c.first_emi_charge_paid_at);
    if (fc > 0 && periods[fcMonth]) periods[fcMonth].collected += fc;
    if (fc > 0 && fcMonth === cur) add(coll, c.retailer_id, fc);
  }

  for (const e of emis) {
    const st = statusOf.get(e.customer_id);
    if (!COUNTED.has(st || '')) continue;
    const value = emiPrincipalCollected(e, st) + Number(e.fine_paid_amount || 0);
    const cm = istMonth(collectionDateOf(e));
    if (value > 0 && periods[cm]) periods[cm].collected += value;
    if (value > 0 && cm === cur) add(coll, retailerOf.get(e.customer_id), value);

    const dm = istMonth(e.due_date);
    if (periods[dm]) {
      periods[dm].dueEmis += 1;
      if (!paidOnSchedule(e, st)) periods[dm].bouncedEmis += 1;
    }
  }

  const names = new Map(retailers.map(r => [r.id, r.name]));
  const board = (mp: Map<string, number>): LeaderRow[] =>
    [...mp.entries()]
      .map(([retailerId, value]) => ({ retailerId, name: names.get(retailerId) || 'Unknown shop', value }))
      .filter(r => r.value > 0)
      .sort((a, b) => b.value - a.value);

  return {
    thisYear: periods[cur],
    lastYear: periods[prev],
    leadLeaderboard: board(leads),
    collectionLeaderboard: board(coll),
  };
}

/**
 * Year a closed loan (COMPLETE / NPA / SETTLED) belongs to for year-wise P&L.
 *
 * completion_date alone is unreliable for imported history (it is either
 * missing or stamped with the import day), which collapsed every completed
 * loan into the current year. Prefer the loan's real last activity:
 *   settlement_date (SETTLED) → last collection date of a paid EMI →
 *   last EMI due date (if not in the future) → completion_date → purchase date.
 */
export function closedYear(
  c: { status?: string | null; settlement_date?: string | null; completion_date?: string | null; purchase_date?: string | null; created_at?: string | null },
  cEmis: AnalysisEmi[],
): string {
  const yearOf = (v: string | null | undefined) => istMonth(v).slice(0, 4);
  if (c.status === 'SETTLED' && c.settlement_date) return yearOf(c.settlement_date) || 'unknown';

  let lastPaid = '';
  let lastDue = '';
  for (const e of cEmis) {
    if (e.due_date && e.due_date > lastDue) lastDue = e.due_date;
    const paid = e.status === 'APPROVED' || Number(e.partial_paid_amount || 0) > 0;
    const when = paid ? (e.collection_requested_at || e.paid_at || '') : '';
    if (when && when > lastPaid) lastPaid = when;
  }
  // Imported loans have APPROVED EMIs with no paid_at, and their
  // completion_date is the import day — so the schedule's last due date is the
  // better signal, unless it lies in the future (loan closed early).
  const today = toISTDateString(new Date()) || '';
  const pastDue = lastDue && lastDue.slice(0, 10) <= today ? lastDue : '';
  return yearOf(lastPaid) || yearOf(pastDue) || yearOf(c.completion_date)
    || yearOf(c.purchase_date || c.created_at) || 'unknown';
}
