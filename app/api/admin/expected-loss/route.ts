import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin: the customers behind the "Expected Loss (live)" figure.
//
//   GET /api/admin/expected-loss
//
// Same definition as /api/metrics: RUNNING customers carrying an EMI unpaid
// for more than 3 months. One row per such customer with their outstanding
// EMI due (fines & charges excluded, matching the dashboard tile) so the
// admin can drill from the aggregate straight into the risky accounts.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  customer_name: string | null;
  mobile: string | null;
  imei: string | null;
  retailer: { name: string | null } | { name: string | null }[] | null;
};

type EmiRow = {
  customer_id: string;
  due_date: string;
  amount: number | null;
  status: string;
  partial_paid_amount: number | null;
};

export interface ExpectedLossCustomer {
  customerId: string;
  name: string;
  mobile: string;
  imei: string;
  retailerName: string;
  emiDue: number;
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

  const customers = await fetchAllPaged<CustomerRow>((from, to) =>
    svc
      .from('customers')
      .select('id, customer_name, mobile, imei, retailer:retailers(name)')
      .eq('status', 'RUNNING')
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );
  if (!customers.length) {
    return NextResponse.json({ rows: [], totalEmiDue: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const emiList = await fetchAllByIds<EmiRow>(customers.map(c => c.id), (chunk, from, to) =>
    svc
      .from('emi_schedule')
      .select('customer_id, due_date, amount, status, partial_paid_amount')
      .in('customer_id', chunk)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: EmiRow[] | null; error: { message: string } | null }>,
  );

  const emisByCustomer = new Map<string, EmiRow[]>();
  for (const e of emiList) {
    const arr = emisByCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    emisByCustomer.set(e.customer_id, arr);
  }

  const todayMs = Date.now();
  const staleCutoffMs = todayMs - 90 * 86_400_000; // EMI unpaid > 3 months

  const rows: ExpectedLossCustomer[] = [];
  for (const c of customers) {
    const cEmis = emisByCustomer.get(c.id) ?? [];
    const stale = cEmis.filter(e =>
      (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
      new Date(e.due_date).getTime() < staleCutoffMs,
    );
    if (!stale.length) continue;

    // Same figure the dashboard tile aggregates: the customer's WHOLE
    // outstanding EMI principal, not just the stale installments.
    const emiDue = cEmis.reduce((s, e) => {
      const paid = e.status === 'APPROVED'
        ? Number(e.amount || 0)
        : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));
      return s + Math.max(0, Number(e.amount || 0) - paid);
    }, 0);

    const oldestDueDate = stale
      .map(e => e.due_date)
      .sort()[0];
    const retailer = Array.isArray(c.retailer) ? c.retailer[0] : c.retailer;
    rows.push({
      customerId: c.id,
      name: c.customer_name || '—',
      mobile: c.mobile || '',
      imei: c.imei || '',
      retailerName: retailer?.name || '—',
      emiDue,
      oldestDueDate,
      daysOverdue: Math.floor((todayMs - new Date(oldestDueDate).getTime()) / 86_400_000),
    });
  }

  rows.sort((a, b) => b.emiDue - a.emiDue);
  const totalEmiDue = rows.reduce((s, r) => s + r.emiDue, 0);

  return NextResponse.json({ rows, totalEmiDue }, { headers: { 'Cache-Control': 'no-store' } });
}
