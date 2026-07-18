import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin: Retailer-wise investment recovery summary.
//
//   GET /api/admin/retailer-summary
//
// For every retailer, over their RUNNING (active) loans only: how much loan
// was given out (invested) at that shop, how much has come back so far
// (EMI + fine + 1st-EMI charge actually collected), and the deficit still to
// recover before the invested amount is back. Terminal accounts (COMPLETE /
// SETTLED / NPA) are excluded — their money is already booked as profit/loss.
//
// Computed server-side with the service client (no RLS, no 1000-row
// truncation), same conventions as /api/metrics.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  retailer_id: string | null;
  purchase_value: number | null;
  down_payment: number | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

type EmiRow = {
  customer_id: string;
  amount: number | null;
  status: string;
  partial_paid_amount: number | null;
  fine_paid_amount: number | null;
};

export interface RetailerSummaryRow {
  retailerId: string;
  name: string;
  isActive: boolean;
  runningCount: number;
  loanGiven: number;
  emiCollected: number;
  fineCollected: number;
  firstChargeCollected: number;
  totalCollected: number;
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

  const { data: retailers, error: rErr } = await svc
    .from('retailers').select('id, name, is_active').order('name');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const customers = await fetchAllPaged<CustomerRow>((from, to) =>
    svc
      .from('customers')
      .select('id, retailer_id, purchase_value, down_payment, first_emi_charge_amount, first_emi_charge_paid_at')
      .eq('status', 'RUNNING')
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  const emiList = customers.length
    ? await fetchAllByIds<EmiRow>(customers.map(c => c.id), (chunk, from, to) =>
        svc
          .from('emi_schedule')
          .select('customer_id, amount, status, partial_paid_amount, fine_paid_amount')
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
      runningCount: 0, loanGiven: 0, emiCollected: 0, fineCollected: 0,
      firstChargeCollected: 0, totalCollected: 0, deficit: 0,
    });
  }

  for (const c of customers) {
    const row = c.retailer_id ? byRetailer.get(c.retailer_id) : undefined;
    if (!row) continue;
    const cEmis = emisByCustomer.get(c.id) ?? [];
    row.runningCount += 1;
    row.loanGiven += Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
    row.emiCollected += cEmis.reduce((s, e) => s + emiPaid(e), 0);
    row.fineCollected += cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0);
    const chargeAmount = Number(c.first_emi_charge_amount || 0);
    if (chargeAmount > 0 && c.first_emi_charge_paid_at) row.firstChargeCollected += chargeAmount;
  }

  const rows = [...byRetailer.values()]
    .map(r => {
      const totalCollected = r.emiCollected + r.fineCollected + r.firstChargeCollected;
      return { ...r, totalCollected, deficit: r.loanGiven - totalCollected };
    })
    // Shops with no running book carry nothing to recover — skip them so the
    // dropdown / table only lists retailers with live exposure.
    .filter(r => r.runningCount > 0)
    .sort((a, b) => b.deficit - a.deficit);

  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}
