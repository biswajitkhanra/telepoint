import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/dbFetch';
import { istMonthRange, IST_OFFSET_MS } from '@/lib/ist';
import { buildCsv, csvHeaders } from '@/lib/csv';

// ─────────────────────────────────────────────────────────────────────────────
// Super Admin — Month-wise Payment Collection Report (CSV).
//
//   GET /api/report/payment-collection?month=&year=&retailer_id=
//
// One row per APPROVED payment that was collected (approved) within the chosen
// IST month. Optionally scoped to a single retailer. The figures come straight
// from the payment_requests record so the export matches the database exactly.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

const MONTHS_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Format an ISO timestamp as "DD-Mon-YYYY HH:MM" in IST. */
function formatDateTimeIST(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const day = pad(ist.getUTCDate());
  const mon = MONTHS_SHORT[ist.getUTCMonth()];
  const yr = ist.getUTCFullYear();
  return `${day}-${mon}-${yr} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

interface PaymentRow {
  id: string;
  mode: string | null;
  utr: string | null;
  total_emi_amount: number | null;
  fine_amount: number | null;
  first_emi_charge_amount: number | null;
  total_amount: number | null;
  payment_date: string | null;
  approved_at: string | null;
  created_at: string | null;
  customer: { customer_name: string | null; mobile: string | null; imei: string | null } | null;
  retailer: { name: string | null } | null;
}

export async function GET(req: NextRequest) {
  // ── Auth — super admin only ───────────────────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 });
  }

  // ── Params ────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const month = parseInt(searchParams.get('month') ?? '', 10);
  const year = parseInt(searchParams.get('year') ?? '', 10);
  const retailerId = searchParams.get('retailer_id') || null;

  let startDate: string;
  let endDate: string;
  let filenameSuffix = '';

  if (from && to) {
    startDate = from;
    endDate = to;
    filenameSuffix = `${from}_to_${to}`;
  } else if (month && year && month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    startDate = `${monthPrefix}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;
    filenameSuffix = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][month - 1] + '_' + year;
  } else {
    return NextResponse.json({ error: 'Valid date range (from/to) or month/year required' }, { status: 400 });
  }

  const svc = createServiceClient();

  let retailerName = 'All_Retailers';
  if (retailerId) {
    const { data: r } = await svc.from('retailers').select('name').eq('id', retailerId).single();
    retailerName = (r?.name || 'Retailer').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Retailer';
  }

  // ── Fetch APPROVED payments collected in the date range ───────────────────
  // Use payment_date (IST calendar date) for scoping instead of approved_at.

  const payments = await fetchAllPaged<PaymentRow>((from, to) => {
    let q = svc
      .from('payment_requests')
      .select('id, mode, utr, total_emi_amount, fine_amount, first_emi_charge_amount, total_amount, payment_date, approved_at, created_at, customer:customers(customer_name, mobile, imei), retailer:retailers(name)')
      .eq('status', 'APPROVED')
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)
      .order('payment_date')
      .order('id');
    if (retailerId) q = q.eq('retailer_id', retailerId);
    return q.range(from, to) as unknown as PromiseLike<{ data: PaymentRow[] | null; error: { message: string } | null }>;
  });

  const monthLabel = `${MONTHS_UPPER[month - 1]}-${String(year).slice(-2)}`;
  const filename = `Payment-Collection-${retailerName}-${monthLabel}.csv`;

  const header = [
    'Customer Name', 'Customer Phone Number', 'IMEI Number', 'EMI Amount', 'Fine Amount',
    '1st EMI Charge', 'Total Collected Amount', 'Payment Date & Time', 'Payment Method',
    'UPI UTR Number', 'Retailer Name',
  ];

  let totalEmi = 0, totalFine = 0, totalCharge = 0, totalCollected = 0;
  const rows = payments.map(p => {
    const emi = Number(p.total_emi_amount || 0);
    const fine = Number(p.fine_amount || 0);
    const charge = Number(p.first_emi_charge_amount || 0);
    const collected = Number(p.total_amount || 0);
    totalEmi += emi; totalFine += fine; totalCharge += charge; totalCollected += collected;
    const isUpi = (p.mode || '').toUpperCase() === 'UPI';
    return {
      'Customer Name': p.customer?.customer_name || '',
      'Customer Phone Number': p.customer?.mobile || '',
      'IMEI Number': p.customer?.imei || '',
      'EMI Amount': emi || '',
      'Fine Amount': fine || '',
      '1st EMI Charge': charge || '',
      'Total Collected Amount': collected,
      'Payment Date & Time': p.payment_date || formatDateTimeIST(p.approved_at || p.created_at),
      'Payment Method': p.mode || '',
      'UPI UTR Number': isUpi ? (p.utr || '') : '',
      'Retailer Name': p.retailer?.name || '',
    };
  });

  const csv = buildCsv({
    header,
    rows: [
      ...rows,
      {
        'Customer Name': 'TOTAL',
        'Customer Phone Number': '',
        'IMEI Number': '',
        'EMI Amount': totalEmi,
        'Fine Amount': totalFine,
        '1st EMI Charge': totalCharge,
        'Total Collected Amount': totalCollected,
        'Payment Date & Time': `${rows.length} payments`,
        'Payment Method': '',
        'UPI UTR Number': '',
        'Retailer Name': '',
      },
    ],
  });

  return new NextResponse(csv, { headers: csvHeaders(filename) });
}
