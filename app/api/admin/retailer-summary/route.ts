import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { firstChargePaid } from '@/lib/firstCharge';

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin: Retailer-wise investment recovery summary.
//
//   GET /api/admin/retailer-summary
//
// For every retailer, over their RUNNING + NPA + SETTLED loans: how much loan
// was given out (invested) at that shop, how much has come back so far
// (EMI + fine + 1st-EMI charge actually collected), and the deficit still to
// recover — or the surplus already recovered — against the invested amount.
// COMPLETE accounts are excluded (fully recovered and booked as profit);
// NPA/SETTLED stay in because their unrecovered money is still real deficit.
//
// Computed server-side with the service client (no RLS, no 1000-row
// truncation), same conventions as /api/metrics.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

// RUNNING, NPA, and SETTLED are counted for deficit (unrecovered money).
// COMPLETE is included ONLY for counts/display — their deficit is zero by
// definition (all EMIs recovered) and they don't inflate the deficit figure.
const DEFICIT_STATUSES = ['RUNNING', 'NPA', 'SETTLED'] as const;
const ALL_COUNTED_STATUSES = ['RUNNING', 'NPA', 'SETTLED', 'COMPLETE'] as const;

type CustomerRow = {
  id: string;
  retailer_id: string | null;
  status: string;
  purchase_value: number | null;
  down_payment: number | null;
  settlement_amount: number | null;
  settlement_date: string | null;
  completion_date: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

type EmiRow = {
  customer_id: string;
  amount: number | null;
  status: string;
  partial_paid_amount: number | null;
  fine_paid_amount: number | null;
  paid_at: string | null;
};

export interface RetailerSummaryRow {
  retailerId: string;
  name: string;
  isActive: boolean;
  runningCount: number;
  npaCount: number;
  settledCount: number;
  completedCount: number;
  totalCustomers: number;
  loanGiven: number;
  emiCollected: number;
  fineCollected: number;
  firstChargeCollected: number;
  totalCollected: number;
  /** Loan Given − Total Collected. Negative = surplus already recovered. */
  deficit: number;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceClient();

  // Retailer list and customer scan are independent — run them in parallel.
  // Fetch ALL_COUNTED_STATUSES (includes COMPLETE) so we can show
  // per-retailer customer counts correctly in the UI.
  const [{ data: retailers, error: rErr }, customers] = await Promise.all([
    svc.from('retailers').select('id, name, is_active').order('name'),
    fetchAllPaged<CustomerRow>((from, to) =>
      svc
        .from('customers')
        .select('id, retailer_id, status, purchase_value, down_payment, settlement_amount, settlement_date, completion_date, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at')
        .in('status', [...ALL_COUNTED_STATUSES])
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
    ),
  ]);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const emiList = customers.length
    ? await fetchAllByIds<EmiRow>(customers.map(c => c.id), (chunk, from, to) =>
        svc
          .from('emi_schedule')
          .select('customer_id, amount, status, partial_paid_amount, fine_paid_amount, paid_at')
          .in('customer_id', chunk)
          .order('id')
          .range(from, to) as unknown as PromiseLike<{ data: EmiRow[] | null; error: { message: string } | null }>,
      )
    : [];

  // An APPROVED EMI is fully paid even when partial_paid_amount was never
  // written (settlement / direct-approve set status only).
  const emiPaid = (e: EmiRow) =>
    e.status === 'APPROVED'
      ? Number(e.amount || 0)
      : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));

  const emisByCustomer = new Map<string, EmiRow[]>();
  for (const e of emiList) {
    const arr = emisByCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    emisByCustomer.set(e.customer_id, arr);
  }

  const byRetailer = new Map<string, RetailerSummaryRow>();
  for (const r of (retailers ?? []) as { id: string; name: string; is_active: boolean }[]) {
    byRetailer.set(r.id, {
      retailerId: r.id, name: r.name, isActive: !!r.is_active,
      runningCount: 0, npaCount: 0, settledCount: 0, completedCount: 0, totalCustomers: 0,
      loanGiven: 0, emiCollected: 0, fineCollected: 0,
      firstChargeCollected: 0, totalCollected: 0, deficit: 0,
    });
  }

  for (const c of customers) {
    const row = c.retailer_id ? byRetailer.get(c.retailer_id) : undefined;
    if (!row) continue;
    const cEmis = emisByCustomer.get(c.id) ?? [];

    if (c.status === 'NPA') row.npaCount += 1;
    else if (c.status === 'SETTLED') row.settledCount += 1;
    else if (c.status === 'COMPLETE') row.completedCount += 1;
    else row.runningCount += 1;

    // COMPLETE customers are NOT included in deficit (their loans are recovered).
    // They are counted above for display but don't affect financial totals.
    if (c.status === 'COMPLETE') continue;

    row.loanGiven += Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));

    // SETTLED accounts: settlement (/api/settlement) bulk-APPROVES every EMI
    // still unpaid, so the schedule overstates money received by the whole
    // waived tail. Real principal recovery = EMIs paid BEFORE the settlement
    // day + the negotiated settlement_amount itself (counted as principal).
    const settledOn = c.status === 'SETTLED'
      ? String(c.settlement_date || c.completion_date || '').slice(0, 10)
      : '';
    if (settledOn) {
      row.emiCollected += cEmis.reduce((s, e) => {
        const waived = e.status === 'APPROVED' &&
          (!e.paid_at || String(e.paid_at).slice(0, 10) >= settledOn);
        return s + (waived
          ? Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0))
          : emiPaid(e));
      }, 0) + Number(c.settlement_amount || 0);
    } else {
      row.emiCollected += cEmis.reduce((s, e) => s + emiPaid(e), 0);
    }

    row.fineCollected += cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0);
    row.firstChargeCollected += firstChargePaid(c);
  }

  const rows = [...byRetailer.values()]
    .map(r => {
      const totalCollected = r.emiCollected + r.fineCollected + r.firstChargeCollected;
      const totalCustomers = r.runningCount + r.npaCount + r.settledCount + r.completedCount;
      return { ...r, totalCollected, deficit: r.loanGiven - totalCollected, totalCustomers };
    })
    // Only list retailers with at least one customer across any status.
    .filter(r => r.totalCustomers > 0)
    .sort((a, b) => b.deficit - a.deficit);

  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
