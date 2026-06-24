import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/dbFetch';
import { toISTDateString, todayIST } from '@/lib/ist';
import { brandOf, categoryOf } from '@/lib/brand';
import { buildCsv, csvHeaders } from '@/lib/csv';

// ─────────────────────────────────────────────────────────────────────────────
// Retailer-only Report export (CSV). Scoped to the logged-in retailer (admins
// may pass ?retailer_id= to pull any single retailer's report).
//
//   GET /api/retailer/report?type=customers&from=&to=  → one row per loan started in range
//   GET /api/retailer/report?type=brands&from=&to=     → brand-wise disbursal summary
//
// Dates are IST calendar dates (YYYY-MM-DD); the range defaults to month-till-date.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  model_no: string | null;
  status: string;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  emi_amount: number | null;
  emi_tenure: number | null;
  purchase_date: string | null;
  created_at: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function loanOf(c: CustomerRow): number {
  const disbursed = Number(c.disburse_amount || 0);
  if (disbursed > 0) return disbursed;
  return Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
}

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

  let retailerId: string | null = req.nextUrl.searchParams.get('retailer_id');
  let retailerName = 'Retailer';
  if (isRetailer) {
    const { data: r } = await svc
      .from('retailers').select('id, name').eq('auth_user_id', user.id).single();
    if (!r) return NextResponse.json({ error: 'Retailer not found' }, { status: 403 });
    retailerId = r.id;
    retailerName = r.name;
  } else if (retailerId) {
    const { data: r } = await svc.from('retailers').select('name').eq('id', retailerId).single();
    retailerName = r?.name || retailerName;
  }
  if (!retailerId) return NextResponse.json({ error: 'retailer_id required' }, { status: 400 });

  const today = todayIST();
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const from = fromParam && ISO_DATE.test(fromParam) ? fromParam : `${today.slice(0, 7)}-01`;
  const to = toParam && ISO_DATE.test(toParam) ? toParam : today;
  const inRange = (value: string | null | undefined) => {
    const d = toISTDateString(value);
    return !!d && d >= from && d <= to;
  };
  const type = (req.nextUrl.searchParams.get('type') || 'customers').toLowerCase();

  const customers = await fetchAllPaged<CustomerRow>((f, t) =>
    svc
      .from('customers')
      .select('id, customer_name, mobile, imei, model_no, status, purchase_value, down_payment, disburse_amount, emi_amount, emi_tenure, purchase_date, created_at')
      .eq('retailer_id', retailerId as string)
      .order('id')
      .range(f, t) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  const started = customers.filter(c => inRange(c.purchase_date || c.created_at));
  const safeName = retailerName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Retailer';

  if (type === 'brands') {
    const map = new Map<string, { count: number; amount: number }>();
    for (const c of started) {
      const b = brandOf(c.model_no);
      const row = map.get(b) || { count: 0, amount: 0 };
      row.count += 1; row.amount += loanOf(c); map.set(b, row);
    }
    const ranked = [...map.entries()].sort((a, b) => b[1].amount - a[1].amount);
    const totalCount = ranked.reduce((s, [, v]) => s + v.count, 0);
    const totalAmount = ranked.reduce((s, [, v]) => s + v.amount, 0);
    const csv = buildCsv({
      header: ['Brand', 'Devices Disbursed', 'Total Disbursed'],
      rows: [
        ...ranked.map(([name, v]) => ({ Brand: name, 'Devices Disbursed': v.count, 'Total Disbursed': v.amount })),
        { Brand: 'TOTAL', 'Devices Disbursed': totalCount, 'Total Disbursed': totalAmount },
      ],
    });
    return new NextResponse(csv, { headers: csvHeaders(`${safeName}_Brand_Report_${from}_to_${to}.csv`) });
  }

  // type === 'customers'
  let totalDisbursed = 0;
  const rows = started
    .sort((a, b) => (toISTDateString(a.purchase_date || a.created_at) < toISTDateString(b.purchase_date || b.created_at) ? 1 : -1))
    .map(c => {
      const loan = loanOf(c);
      totalDisbursed += loan;
      return {
        Date: toISTDateString(c.purchase_date || c.created_at),
        Customer: c.customer_name,
        Mobile: c.mobile || '',
        IMEI: c.imei || '',
        Device: categoryOf(c.model_no),
        Brand: brandOf(c.model_no),
        'Purchase Value': Number(c.purchase_value || 0),
        'Down Payment': Number(c.down_payment || 0),
        Disbursed: loan,
        'EMI Amount': Number(c.emi_amount || 0),
        Tenure: Number(c.emi_tenure || 0),
        Status: c.status,
      };
    });
  const csv = buildCsv({
    header: ['Date', 'Customer', 'Mobile', 'IMEI', 'Device', 'Brand', 'Purchase Value', 'Down Payment', 'Disbursed', 'EMI Amount', 'Tenure', 'Status'],
    rows: [
      ...rows,
      { Date: '', Customer: 'TOTAL', Mobile: '', IMEI: '', Device: '', Brand: '', 'Purchase Value': '', 'Down Payment': '', Disbursed: totalDisbursed, 'EMI Amount': '', Tenure: '', Status: `${rows.length} loans` },
    ],
  });
  return new NextResponse(csv, { headers: csvHeaders(`${safeName}_Disbursal_Report_${from}_to_${to}.csv`) });
}
