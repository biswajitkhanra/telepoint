import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged, fetchAllByIds } from '@/lib/dbFetch';
import { loadPortfolio } from '@/lib/portfolioData';
import { collectionDateOf, emiPrincipalCollected, istMonth } from '@/lib/analysis';
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
  const month = parseInt(searchParams.get('month') ?? '', 10);
  const year = parseInt(searchParams.get('year') ?? '', 10);
  if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2099) {
    return NextResponse.json({ error: 'Valid month (1-12) and year required' }, { status: 400 });
  }
  const retailerId = searchParams.get('retailer_id') || null;

  const svc = createServiceClient();
  const { startUtc, endUtc } = istMonthRange(year, month);

  let retailerName = 'All_Retailers';
  if (retailerId) {
    const { data: r } = await svc.from('retailers').select('name').eq('id', retailerId).single();
    retailerName = (r?.name || 'Retailer').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Retailer';
  }

  // ── Fetch APPROVED payments collected in the month ────────────────────────
  // Anchor the month window on approved_at (when the payment was confirmed /
  // collected); fall back is handled below for legacy rows missing approved_at.
  const payments = await fetchAllPaged<PaymentRow>((from, to) => {
    let q = svc
      .from('payment_requests')
      .select('id, mode, utr, total_emi_amount, fine_amount, first_emi_charge_amount, total_amount, approved_at, created_at, customer:customers(customer_name, mobile, imei), retailer:retailers(name)')
      .eq('status', 'APPROVED')
      .gte('approved_at', startUtc)
      .lte('approved_at', endUtc)
      .order('approved_at')
      .order('id');
    if (retailerId) q = q.eq('retailer_id', retailerId);
    return q.range(from, to) as unknown as PromiseLike<{ data: PaymentRow[] | null; error: { message: string } | null }>;
  });

  // ── Imported history (paid before the portal existed) ─────────────────────
  // Sheet-imported payments never produced payment_requests, so a month from
  // before the portal went live exported as an empty file. Anything collected
  // before the FIRST ever approved portal payment is taken from emi_schedule
  // instead. From that moment on every payment has a request, so the two
  // sources never overlap (no double counting).
  const { data: firstPortal } = await svc
    .from('payment_requests').select('approved_at')
    .eq('status', 'APPROVED').not('approved_at', 'is', null)
    .order('approved_at', { ascending: true }).limit(1).maybeSingle();
  const portalStart = firstPortal?.approved_at ? new Date(firstPortal.approved_at).getTime() : Infinity;
  const ym = `${year}-${pad(month)}`;
  type HistoryRow = { when: string; emi: number; fine: number; mode: string; utr: string; customerId: string };
  const history: HistoryRow[] = [];
  if (new Date(startUtc).getTime() < portalStart) {
    const book = await loadPortfolio(retailerId);
    const statusOf = new Map(book.customers.map(c => [c.id, c.status]));
    for (const e of book.emis) {
      const when = collectionDateOf(e);
      if (!when || istMonth(when) !== ym) continue;
      if (new Date(when.length <= 10 ? when + 'T00:00:00+05:30' : when).getTime() >= portalStart) continue;
      const emi = emiPrincipalCollected(e, statusOf.get(e.customer_id));
      const fine = Number(e.fine_paid_amount || 0);
      if (emi + fine <= 0) continue;
      history.push({ when, emi, fine, mode: e.mode || (e.utr ? 'UPI' : 'CASH'), utr: e.utr || '', customerId: e.customer_id });
    }
  }
  type Who = { id: string; customer_name: string | null; mobile: string | null; imei: string | null; retailer: { name: string | null } | null };
  const who = new Map<string, Who>();
  if (history.length) {
    const people = await fetchAllByIds<Who>([...new Set(history.map(h => h.customerId))], (chunk, from, to) =>
      svc.from('customers').select('id, customer_name, mobile, imei, retailer:retailers(name)')
        .in('id', chunk).order('id').range(from, to) as unknown as PromiseLike<{ data: Who[] | null; error: { message: string } | null }>);
    for (const w of people) who.set(w.id, w);
    history.sort((a, b) => a.when.localeCompare(b.when));
  }

  const monthLabel = `${MONTHS_UPPER[month - 1]}-${String(year).slice(-2)}`;
  const filename = `Payment-Collection-${retailerName}-${monthLabel}.csv`;

  const header = [
    'Customer Name', 'Customer Phone Number', 'IMEI Number', 'EMI Amount', 'Fine Amount',
    '1st EMI Charge', 'Total Collected Amount', 'Payment Date & Time', 'Payment Method',
    'UPI UTR Number', 'Retailer Name', 'Source',
  ];

  let totalEmi = 0, totalFine = 0, totalCharge = 0, totalCollected = 0;
  const historyRows = history.map(h => {
    const c = who.get(h.customerId);
    totalEmi += h.emi; totalFine += h.fine; totalCollected += h.emi + h.fine;
    return {
      'Customer Name': c?.customer_name || '',
      'Customer Phone Number': c?.mobile || '',
      'IMEI Number': c?.imei || '',
      'EMI Amount': h.emi || '',
      'Fine Amount': h.fine || '',
      '1st EMI Charge': '',
      'Total Collected Amount': h.emi + h.fine,
      'Payment Date & Time': h.when.length <= 10 ? h.when : formatDateTimeIST(h.when),
      'Payment Method': h.mode,
      'UPI UTR Number': h.mode === 'UPI' ? h.utr : '',
      'Retailer Name': c?.retailer?.name || '',
      'Source': 'Imported history',
    };
  });
  const portalRows = payments.map(p => {
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
      'Payment Date & Time': formatDateTimeIST(p.approved_at || p.created_at),
      'Payment Method': p.mode || '',
      'UPI UTR Number': isUpi ? (p.utr || '') : '',
      'Retailer Name': p.retailer?.name || '',
      'Source': 'Portal',
    };
  });
  const rows = [...historyRows, ...portalRows];

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
        'Source': '',
      },
    ],
  });

  return new NextResponse(csv, { headers: csvHeaders(filename) });
}
