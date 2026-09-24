import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { firstChargeRemaining, firstChargePaid } from '@/lib/firstCharge';
import { loadPortfolio } from '@/lib/portfolioData';
import { closedYear, istMonth } from '@/lib/analysis';
import { EMISchedule } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Server-computed portfolio metrics.
//
// The Live DB dashboard and the per-retailer summary used to scan the WHOLE
// customers + emi_schedule tables from the browser. At MAMA TELECOM's scale
// (1000+ customers, many thousands of EMIs) that was both wrong (PostgREST's
// 1000-row cap truncated the read) and fragile (huge transfers / RLS / timeouts
// → the dashboard showed nothing). Here we do it once on the server with the
// service client (no RLS, no truncation — every row paged in) and return a tiny
// JSON the client just renders.
//
//   GET /api/metrics                 → whole-portfolio totals (admin only)
//   GET /api/metrics?retailer_id=…   → one retailer's totals
//
// Retailers are always scoped to themselves regardless of the query param.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  status: string;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  completion_date: string | null;
  purchase_date: string | null;
  created_at: string | null;
  settlement_amount: number | null;
  settlement_date: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

export interface PortfolioMetrics {
  customerCount: number;
  runningCount: number;
  loanAmount: number;
  // Money actually put into the market for the running book: disburse_amount
  // when recorded, otherwise purchase_value − down_payment. Profit baseline —
  // matches the convention used by /api/report/profit.
  disburse: number;
  emiDue: number;
  fineDue: number;
  firstChargeDue: number;
  emiCollected: number;
  fineCollected: number;
  firstChargeCollected: number;
  upcoming30d: number;
  overdueCustomers: number;
  // ── Year-wise Profit & Loss (terminal accounts) ───────────────────────────
  // PROFIT — FULLY COMPLETED customers ONLY, bucketed by the IST year they
  // completed in: profit = everything actually collected (EMI + fine + 1st
  // charge) − LOAN VALUE (purchase_value − down_payment). Running / partially
  // active accounts never touch these figures. Customers with no
  // completion_date recorded land in the "unknown" bucket so nothing is
  // silently dropped from the totals.
  profitByYear: Record<string, { amount: number; count: number }>;
  // LOSS BOOKED — NPA + SETTLED accounts, bucketed the same way:
  // loss = loan value − collected (the unrecovered money on closed-bad books).
  lossBookedByYear: Record<string, { amount: number; count: number }>;
  // EXPECTED LOSS (live, not year-bucketed) — RUNNING loans carrying an EMI
  // unpaid for more than 3 months. Only the outstanding EMI principal counts
  // (no fines / charges).
  expectedLossCount: number;
  expectedLossEmiDue: number;
  // Fine actually collected, bucketed by the IST calendar month ("YYYY-MM") it
  // was approved in. Transaction-level (one approved payment_request = one
  // collection event), so a month's figure reflects money taken in that month,
  // not lifetime balances.
  fineCollectedByMonth: Record<string, number>;
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

  // ── Resolve scope ─────────────────────────────────────────────────────────
  let retailerId: string | null = req.nextUrl.searchParams.get('retailer_id');
  if (isRetailer) {
    // Retailers can only ever see their own portfolio.
    const { data: r } = await svc
      .from('retailers').select('id').eq('auth_user_id', user.id).single();
    if (!r) return NextResponse.json({ error: 'Retailer not found' }, { status: 403 });
    retailerId = r.id;
  }

  // ── Every customer + EMI in scope (paged past the 1000-row cap, cached ~60s)
  // and the fine settings, in parallel.
  const [fsRes, portfolio] = await Promise.all([
    svc.from('fine_settings').select('default_fine_amount, weekly_fine_increment').eq('id', 1).single(),
    loadPortfolio(retailerId, req.nextUrl.searchParams.get('fresh') === '1'),
  ]);
  const customers = portfolio.customers as unknown as CustomerRow[];
  const emiList = portfolio.emis as unknown as EMISchedule[];
  const fs = fsRes.data;
  const baseFine = Number(fs?.default_fine_amount ?? 450);
  const weeklyIncrement = Number(fs?.weekly_fine_increment ?? 25);

  // Fine collected per IST month, from the fine actually recorded on each EMI
  // (fine_paid_amount). payment_requests only exist for portal-era payments,
  // so reading them showed ₹0 for every month of imported history.
  const fineCollectedByMonth: Record<string, number> = {};
  for (const e of portfolio.emis) {
    const amt = Number(e.fine_paid_amount || 0);
    if (amt <= 0) continue;
    const ym = istMonth(e.fine_paid_at || e.paid_at || e.collection_requested_at || e.due_date);
    if (ym) fineCollectedByMonth[ym] = (fineCollectedByMonth[ym] || 0) + amt;
  }

  const empty: PortfolioMetrics = {
    customerCount: 0, runningCount: 0, loanAmount: 0, disburse: 0, emiDue: 0, fineDue: 0,
    firstChargeDue: 0, emiCollected: 0, fineCollected: 0, firstChargeCollected: 0,
    upcoming30d: 0, overdueCustomers: 0,
    profitByYear: {}, lossBookedByYear: {},
    expectedLossCount: 0, expectedLossEmiDue: 0,
    fineCollectedByMonth,
  };
  if (!customers.length) return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } });

  const byCustomer = new Map<string, EMISchedule[]>();
  for (const e of emiList) {
    const arr = byCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    byCustomer.set(e.customer_id, arr);
  }

  // ── Aggregate (same rules the dashboard + summary used) ───────────────────
  // An APPROVED EMI is fully paid even when partial_paid_amount was never
  // written (settlement / direct-approve set status only), so count its full
  // amount as collected.
  const emiPaid = (e: EMISchedule) =>
    e.status === 'APPROVED'
      ? Number(e.amount || 0)
      : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));

  const todayMs = Date.now();
  const in30Ms = todayMs + 30 * 86_400_000;
  const staleCutoffMs = todayMs - 90 * 86_400_000; // EMI unpaid > 3 months
  // Year a closed loan belongs to: its real last activity (see closedYear) —
  // completion_date alone put all imported history into the import year.
  const closedYearOf = (c: CustomerRow) => closedYear(c, byCustomer.get(c.id) ?? []);

  const m: PortfolioMetrics = { ...empty, customerCount: customers.length };

  for (const c of customers) {
    const cEmis = byCustomer.get(c.id) ?? [];
    const cFineDue = calculateTotalFineFromEmis(cEmis, baseFine, weeklyIncrement);
    const cEmiDue = cEmis.reduce((s, e) => s + Math.max(0, Number(e.amount || 0) - emiPaid(e)), 0);

    const cFirstChargeDue = firstChargeRemaining(c);
    const cFirstChargeCollected = firstChargePaid(c);

    const cLoanValue = Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
    const cCollected =
      cEmis.reduce((s, e) => s + emiPaid(e), 0) +
      cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0) +
      cFirstChargeCollected;

    // ── PROFIT: FULLY COMPLETED customers ONLY, year-wise ───────────────────
    // profit = collected − loan value. Running / partially active accounts
    // never touch these figures.
    if (c.status === 'COMPLETE') {
      const y = closedYearOf(c);
      const bucket = m.profitByYear[y] || { amount: 0, count: 0 };
      bucket.amount += cCollected - cLoanValue;
      bucket.count += 1;
      m.profitByYear[y] = bucket;
    }

    // ── LOSS BOOKED: NPA + SETTLED accounts, year-wise ──────────────────────
    // loss = loan value − collected (money not recovered on closed-bad books).
    // Settlement (/api/settlement) bulk-APPROVES every EMI still unpaid, so a
    // SETTLED customer's schedule overstates money received by the whole
    // waived tail. Real recovery = EMIs paid BEFORE the settlement day + the
    // negotiated settlement_amount itself (+ fines / 1st charge as usual).
    if (c.status === 'NPA' || c.status === 'SETTLED') {
      const settledOn = c.status === 'SETTLED'
        ? String(c.settlement_date || c.completion_date || '').slice(0, 10)
        : '';
      const cRecovered = settledOn
        ? cEmis.reduce((s, e) => {
            const waived = e.status === 'APPROVED' &&
              (!e.paid_at || String(e.paid_at).slice(0, 10) >= settledOn);
            return s + (waived
              ? Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0))
              : emiPaid(e));
          }, 0) +
          cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0) +
          cFirstChargeCollected +
          Number(c.settlement_amount || 0)
        : cCollected;
      const y = closedYearOf(c);
      const bucket = m.lossBookedByYear[y] || { amount: 0, count: 0 };
      bucket.amount += cLoanValue - cRecovered;
      bucket.count += 1;
      m.lossBookedByYear[y] = bucket;
    }

    // ── EXPECTED LOSS (live): RUNNING loans with an EMI unpaid > 3 months ───
    // Only the outstanding EMI principal is reported for this bucket.
    if (c.status === 'RUNNING') {
      const hasStaleEmi = cEmis.some(e =>
        (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
        new Date(e.due_date).getTime() < staleCutoffMs,
      );
      if (hasStaleEmi) {
        m.expectedLossCount += 1;
        m.expectedLossEmiDue += cEmiDue;
      }
    }

    // Scope (strict): only customers whose loan lifecycle is currently RUNNING.
    // The running financial landscape aggregates EVERYTHING for these active
    // profiles — both already-collected and still-to-collect — across EMIs,
    // 1st-EMI charges and fines (see the accumulators below).
    //
    // Terminal states are excluded entirely:
    //   • NPA      — defaulted / non-performing asset, written off.
    //   • COMPLETE — finished EMI lifecycle; dropped even if trailing unpaid
    //                fines or charges still sit on the profile.
    //   • SETTLED  — early closure; not an active running account.
    if (c.status !== 'RUNNING') continue;

    m.runningCount += 1;

    const principal = Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
    m.loanAmount += principal;
    m.disburse += Number(c.disburse_amount || 0) || principal;
    m.emiDue += cEmiDue;
    m.fineDue += cFineDue;
    m.firstChargeDue += cFirstChargeDue;
    m.emiCollected += cEmis.reduce((s, e) => s + emiPaid(e), 0);
    m.fineCollected += cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0);
    m.firstChargeCollected += cFirstChargeCollected;

    let custOverdue = false;
    for (const e of cEmis) {
      if (e.status === 'APPROVED') continue;
      const due = new Date(e.due_date).getTime();
      if (due < todayMs) custOverdue = true;
      if (due >= todayMs && due <= in30Ms) {
        m.upcoming30d += Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0));
      }
    }
    if (custOverdue) m.overdueCustomers += 1;
  }

  return NextResponse.json(m, { headers: { 'Cache-Control': 'no-store' } });
}
