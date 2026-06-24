import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/dbFetch';
import { IST_OFFSET_MS, toISTDateString, todayIST } from '@/lib/ist';
import { brandOf, categoryOf } from '@/lib/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Retailer Business Dashboard — month-till-date (or any [from,to] range) figures,
// computed server-side with the service client (no RLS, no 1000-row truncation)
// so even a 1000+ customer retailer gets correct totals.
//
//   GET /api/retailer/dashboard                    → logged-in retailer, MTD
//   GET /api/retailer/dashboard?from=&to=          → custom IST date range
//   GET /api/retailer/dashboard?retailer_id=…      → admin drill-down
//
// Retailers are always scoped to themselves regardless of the query param.
//
// Tiles (the "Logins" tile from the source design is intentionally dropped):
//   • Total Disbursed Amount — money put into the market for loans STARTED in range
//   • Disbursed              — number of loans started in range
//   • Approved               — approved collection requests in range
//   • ABND                   — accounts marked NPA (abandoned / non-performing) in range
//
// Graphical Overview (over loans started in range):
//   • Top Performing Brands  — brand = FIRST word of the device model ("Redmi 5A" → "Redmi")
//   • Best Selling Category  — the full device model line
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  status: string;
  model_no: string | null;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  purchase_date: string | null;
  created_at: string | null;
  completion_date: string | null;
};

type PayReqRow = {
  total_amount: number | null;
  total_emi_amount: number | null;
  fine_amount: number | null;
  first_emi_charge_amount: number | null;
  approved_at: string | null;
  created_at: string | null;
};

export interface BreakdownRow {
  name: string;
  count: number;
  amount: number;
}

export interface RetailerDashboard {
  from: string;
  to: string;
  totalDisbursed: number;
  disbursedCount: number;
  approvedCount: number;
  collectedAmount: number;
  fineCollected: number;
  abndCount: number;
  brands: BreakdownRow[];
  categories: BreakdownRow[];
}

/** Loan handed to the customer: prefer disburse_amount, else value − down payment. */
function loanOf(c: CustomerRow): number {
  const disbursed = Number(c.disburse_amount || 0);
  if (disbursed > 0) return disbursed;
  return Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
}

/** UTC [start,end] ISO bounds for an inclusive IST date range. */
function istRangeUtc(fromDate: string, toDate: string): { startUtc: string; endUtc: string } {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const startUtc = Date.UTC(fy, fm - 1, fd) - IST_OFFSET_MS;
  const endUtc = Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - IST_OFFSET_MS;
  return { startUtc: new Date(startUtc).toISOString(), endUtc: new Date(endUtc).toISOString() };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  const isAdmin = profile?.role === 'super_admin';
  const isRetailer = profile?.role === 'retailer';
  if (!isAdmin && !isRetailer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createServiceClient();

  // ── Resolve scope (retailers always see only their own portfolio) ──────────
  let retailerId: string | null = req.nextUrl.searchParams.get('retailer_id');
  if (isRetailer) {
    const { data: r } = await svc
      .from('retailers').select('id').eq('auth_user_id', user.id).single();
    if (!r) return NextResponse.json({ error: 'Retailer not found' }, { status: 403 });
    retailerId = r.id;
  }
  if (!retailerId) return NextResponse.json({ error: 'retailer_id required' }, { status: 400 });

  // ── Resolve date range (default: month-till-date in IST) ───────────────────
  const today = todayIST();
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const from = fromParam && ISO_DATE.test(fromParam) ? fromParam : `${today.slice(0, 7)}-01`;
  const to = toParam && ISO_DATE.test(toParam) ? toParam : today;
  const inRange = (value: string | null | undefined) => {
    const d = toISTDateString(value);
    return !!d && d >= from && d <= to;
  };
  const { startUtc, endUtc } = istRangeUtc(from, to);

  // ── Load this retailer's customers (paged) ─────────────────────────────────
  const customers = await fetchAllPaged<CustomerRow>((f, t) =>
    svc
      .from('customers')
      .select('id, status, model_no, purchase_value, down_payment, disburse_amount, purchase_date, created_at, completion_date')
      .eq('retailer_id', retailerId as string)
      .order('id')
      .range(f, t) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  // ── Approved collections in range (count + money) ──────────────────────────
  const payReqs = await fetchAllPaged<PayReqRow>((f, t) =>
    svc
      .from('payment_requests')
      .select('total_amount, total_emi_amount, fine_amount, first_emi_charge_amount, approved_at, created_at')
      .eq('retailer_id', retailerId as string)
      .eq('status', 'APPROVED')
      .gte('approved_at', startUtc)
      .lte('approved_at', endUtc)
      .order('id')
      .range(f, t) as unknown as PromiseLike<{ data: PayReqRow[] | null; error: { message: string } | null }>,
  );

  let approvedCount = 0;
  let collectedAmount = 0;
  let fineCollected = 0;
  for (const p of payReqs) {
    approvedCount += 1;
    const total = Number(p.total_amount || 0) ||
      (Number(p.total_emi_amount || 0) + Number(p.fine_amount || 0) + Number(p.first_emi_charge_amount || 0));
    collectedAmount += total;
    fineCollected += Number(p.fine_amount || 0);
  }

  // ── Loans started in range → disbursed totals + brand/category breakdowns ──
  const brandMap = new Map<string, BreakdownRow>();
  const catMap = new Map<string, BreakdownRow>();
  let totalDisbursed = 0;
  let disbursedCount = 0;
  let abndCount = 0;

  for (const c of customers) {
    // ABND — accounts that went bad (NPA) within the range.
    if (c.status === 'NPA' && inRange(c.completion_date)) abndCount += 1;

    // Loan lifecycle starts on purchase_date (fallback created_at).
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
    [...m.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, 8);

  const result: RetailerDashboard = {
    from, to,
    totalDisbursed,
    disbursedCount,
    approvedCount,
    collectedAmount,
    fineCollected,
    abndCount,
    brands: rank(brandMap),
    categories: rank(catMap),
  };

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
