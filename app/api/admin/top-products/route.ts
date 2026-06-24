import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/dbFetch';
import { toISTDateString, todayIST } from '@/lib/ist';
import { brandOf, categoryOf } from '@/lib/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Super-admin: Top Selling Brands & Products across the WHOLE portfolio for an
// IST date range (defaults to the current month-till-date). Computed server-side
// with the service client (no RLS, no 1000-row truncation).
//
//   GET /api/admin/top-products?from=&to=
//
// "Brand" = the FIRST word of the device model ("Redmi 5A" → "Redmi");
// "Product" (category) = the full device model line.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  model_no: string | null;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  purchase_date: string | null;
  created_at: string | null;
};

export interface BreakdownRow {
  name: string;
  count: number;
  amount: number;
}

function loanOf(c: CustomerRow): number {
  const disbursed = Number(c.disburse_amount || 0);
  if (disbursed > 0) return disbursed;
  return Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceClient();

  const today = todayIST();
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const from = fromParam && ISO_DATE.test(fromParam) ? fromParam : `${today.slice(0, 7)}-01`;
  const to = toParam && ISO_DATE.test(toParam) ? toParam : today;
  const inRange = (value: string | null | undefined) => {
    const d = toISTDateString(value);
    return !!d && d >= from && d <= to;
  };

  const customers = await fetchAllPaged<CustomerRow>((f, t) =>
    svc
      .from('customers')
      .select('model_no, purchase_value, down_payment, disburse_amount, purchase_date, created_at')
      .order('id')
      .range(f, t) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  const brandMap = new Map<string, BreakdownRow>();
  const catMap = new Map<string, BreakdownRow>();
  let totalDisbursed = 0;
  let disbursedCount = 0;

  for (const c of customers) {
    if (!inRange(c.purchase_date || c.created_at)) continue;
    const loan = loanOf(c);
    totalDisbursed += loan;
    disbursedCount += 1;

    const b = brandOf(c.model_no);
    const bRow = brandMap.get(b) || { name: b, count: 0, amount: 0 };
    bRow.count += 1; bRow.amount += loan; brandMap.set(b, bRow);

    const cat = categoryOf(c.model_no);
    const cRow = catMap.get(cat) || { name: cat, count: 0, amount: 0 };
    cRow.count += 1; cRow.amount += loan; catMap.set(cat, cRow);
  }

  const rank = (m: Map<string, BreakdownRow>) =>
    [...m.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 8);

  return NextResponse.json(
    { from, to, totalDisbursed, disbursedCount, brands: rank(brandMap), products: rank(catMap) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
