import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin: the customers behind the "Expected Loss (live)" figure.
//
//   GET /api/admin/expected-loss
//
// Definition: customers in RUNNING or NPA status with at least one EMI
// UNPAID or PARTIALLY_PAID for more than 3 months. COMPLETE customers are
// ALWAYS excluded — a COMPLETE customer with a pending fine is still COMPLETE
// and is never an expected-loss account.
//
// Returns one row per at-risk customer with their full outstanding EMI
// principal (not just the stale installments) plus the outstanding fine amount,
// matching the dashboard tile definition exactly.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  imei: string | null;
  status: string;
  settlement_date: string | null;
  completion_date: string | null;
  retailer: { name: string | null } | { name: string | null }[] | null;
};

type EmiRow = {
  customer_id: string;
  due_date: string;
  amount: number | null;
  status: string;
  partial_paid_amount: number | null;
  paid_at: string | null;
  fine_amount: number | null;
  fine_paid_amount: number | null;
  fine_waived: boolean | null;
};

export interface ExpectedLossCustomer {
  customerId: string;
  name: string;
  mobile: string;
  imei: string;
  retailerName: string;
  customerStatus: string;
  emiDue: number;
  fineDue: number;
  oldestDueDate: string;
  daysOverdue: number;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceClient();

  // COMPLETE customers are explicitly excluded — a completed customer with a
  // pending fine is NOT an expected-loss account. Only RUNNING and NPA
  // customers can be in the expected-loss bucket.
  const customers = await fetchAllPaged<CustomerRow>((from, to) =>
    svc
      .from('customers')
      .select('id, customer_name, mobile, imei, status, settlement_date, completion_date, retailer:retailers(name)')
      .in('status', ['RUNNING', 'NPA'])
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  if (!customers.length) {
    return NextResponse.json(
      { rows: [], totalEmiDue: 0, totalFineDue: 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const emiList = await fetchAllByIds<EmiRow>(customers.map(c => c.id), (chunk, from, to) =>
    svc
      .from('emi_schedule')
      .select('customer_id, due_date, amount, status, partial_paid_amount, paid_at, fine_amount, fine_paid_amount, fine_waived')
      .in('customer_id', chunk)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: EmiRow[] | null; error: { message: string } | null }>,
  );

  // Build a deduplicated map: customer_id → EmiRow[]
  const emisByCustomer = new Map<string, EmiRow[]>();
  for (const e of emiList) {
    const arr = emisByCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    emisByCustomer.set(e.customer_id, arr);
  }

  // Consistent emiPaid helper (same logic as /api/metrics):
  // APPROVED status = fully paid regardless of partial_paid_amount column.
  const emiPaid = (e: EmiRow): number =>
    e.status === 'APPROVED'
      ? Math.max(0, Number(e.amount || 0))
      : Math.min(Math.max(0, Number(e.amount || 0)), Math.max(0, Number(e.partial_paid_amount || 0)));

  const todayMs = Date.now();
  // 3-month cutoff: EMI overdue for more than 90 days
  const staleCutoffMs = todayMs - 90 * 86_400_000;

  // Use a Map to guarantee deduplication (one row per customer_id).
  const rowMap = new Map<string, ExpectedLossCustomer>();

  for (const c of customers) {
    // Skip if already processed (dedup guard)
    if (rowMap.has(c.id)) continue;

    const cEmis = emisByCustomer.get(c.id) ?? [];

    // Find stale (overdue > 3 months) unpaid/partially-paid EMIs
    const stale = cEmis.filter(e =>
      (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
      new Date(e.due_date).getTime() < staleCutoffMs,
    );
    if (!stale.length) continue;

    // Total outstanding EMI principal across ALL installments (not just stale).
    // Matches the dashboard tile definition.
    const emiDue = cEmis.reduce((s, e) => {
      return s + Math.max(0, Math.max(0, Number(e.amount || 0)) - emiPaid(e));
    }, 0);

    // Total outstanding fine (excluding waived fines).
    const fineDue = cEmis.reduce((s, e) => {
      if (e.fine_waived) return s;
      const fineAmt = Math.max(0, Number(e.fine_amount || 0));
      const finePaid = Math.min(fineAmt, Math.max(0, Number(e.fine_paid_amount || 0)));
      return s + Math.max(0, fineAmt - finePaid);
    }, 0);

    const oldestDueDate = stale
      .map(e => e.due_date)
      .sort()[0];

    const retailer = Array.isArray(c.retailer) ? c.retailer[0] : c.retailer;

    rowMap.set(c.id, {
      customerId: c.id,
      name: c.customer_name || '—',
      mobile: c.mobile || '',
      imei: c.imei || '',
      retailerName: retailer?.name || '—',
      customerStatus: c.status,
      emiDue,
      fineDue,
      oldestDueDate,
      daysOverdue: Math.floor((todayMs - new Date(oldestDueDate).getTime()) / 86_400_000),
    });
  }

  const rows = Array.from(rowMap.values())
    // Sort by most overdue first, then by highest EMI due (riskiest accounts first)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.emiDue - a.emiDue);

  const totalEmiDue = rows.reduce((s, r) => s + r.emiDue, 0);
  const totalFineDue = rows.reduce((s, r) => s + r.fineDue, 0);

  return NextResponse.json(
    { rows, totalEmiDue, totalFineDue },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

