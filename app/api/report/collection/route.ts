import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/csv';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { toISTDateString } from '@/lib/ist';

// Retailer Collection summary CSV.
//
// Money is attributed to the month it was ACTUALLY collected — each EMI's own
// collection date (collection_requested_at → paid_at → due_date) — NOT the
// portal approval/upload date. History imported from the Google sheet has no
// payment_requests, so the old approved_at basis showed ₹0 for every past
// month and bunched everything into the upload day. We read emi_schedule
// directly instead, so historical months report their real figures.

type CustomerRow = {
  id: string;
  status: string;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

type EmiRow = {
  customer_id: string;
  status: string;
  amount: number | null;
  partial_paid_amount: number | null;
  fine_paid_amount: number | null;
  paid_at: string | null;
  collection_requested_at: string | null;
  due_date: string;
};

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  const isAdmin = profile?.role === 'super_admin';
  const isRetailer = profile?.role === 'retailer';
  if (!isAdmin && !isRetailer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceClient();
  const m = parseInt(req.nextUrl.searchParams.get('month') || String(new Date().getMonth() + 1));
  const y = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));
  const monthStr = `${y}-${String(m).padStart(2, '0')}`; // IST "YYYY-MM"

  // The IST month an EMI's collection lands in (real collection date, not upload).
  const collMonthOf = (e: EmiRow) =>
    toISTDateString(e.collection_requested_at || e.paid_at || e.due_date).slice(0, 7);

  // Scope: admin sees all retailers; retailer sees only self
  let retailerScope: { id: string; name: string }[] = [];
  if (isAdmin) {
    const { data: retailers } = await svc.from('retailers').select('id, name').eq('is_active', true).order('name');
    retailerScope = retailers || [];
  } else {
    const { data: retailer } = await svc.from('retailers').select('id, name').eq('auth_user_id', user.id).single();
    if (!retailer) return NextResponse.json({ error: 'Retailer not found' }, { status: 403 });
    retailerScope = [retailer];
  }

  const rows: string[][] = [['Retailer', 'Total EMI', 'Total Fine', 'Total 1st Charge', 'Total Collection', 'Customers']];
  for (const r of retailerScope) {
    // Count active (RUNNING) + finished (COMPLETE) books; a COMPLETE customer's
    // EMIs are paid by definition even if an imported row still says UNPAID.
    const customers = await fetchAllPaged<CustomerRow>((from, to) =>
      svc
        .from('customers')
        .select('id, status, first_emi_charge_amount, first_emi_charge_paid_at')
        .eq('retailer_id', r.id)
        .in('status', ['RUNNING', 'COMPLETE'])
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
    );
    if (!customers.length) continue;

    const statusOf = new Map(customers.map(c => [c.id, c.status]));
    const custIds = customers.map(c => c.id);

    const emis = await fetchAllByIds<EmiRow>(custIds, (chunk, from, to) =>
      svc
        .from('emi_schedule')
        .select('customer_id, status, amount, partial_paid_amount, fine_paid_amount, paid_at, collection_requested_at, due_date')
        .in('customer_id', chunk)
        .order('customer_id')
        .order('emi_no')
        .range(from, to) as unknown as PromiseLike<{ data: EmiRow[] | null; error: { message: string } | null }>,
    );

    let emi = 0, fine = 0, charge = 0;
    const custSet = new Set<string>();

    for (const e of emis) {
      const st = statusOf.get(e.customer_id);
      const principal = (e.status === 'APPROVED' || st === 'COMPLETE')
        ? Number(e.amount || 0)
        : Number(e.partial_paid_amount || 0);
      const f = Number(e.fine_paid_amount || 0);
      if ((principal > 0 || f > 0) && collMonthOf(e) === monthStr) {
        emi += principal;
        fine += f;
        custSet.add(e.customer_id);
      }
    }
    for (const c of customers) {
      if (c.first_emi_charge_paid_at && toISTDateString(c.first_emi_charge_paid_at).slice(0, 7) === monthStr) {
        charge += Number(c.first_emi_charge_amount || 0);
        custSet.add(c.id);
      }
    }

    const tot = emi + fine + charge;
    if (tot > 0) rows.push([r.name, String(emi), String(fine), String(charge), String(tot), String(custSet.size)]);
  }

  const csv = rows.map(r => csvRow(r)).join('\r\n');
  const mn  = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1];
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="Retailer_Collection_${mn}_${y}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
