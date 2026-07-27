import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { EMISchedule } from '@/lib/types';
import { firstChargeRemaining } from '@/lib/firstCharge';
import { todayIST, addDaysIST, midnightIST, diffDaysIST } from '@/lib/ist';

// Upcoming EMI widget window: show only EMIs due within the next N days
// (inclusive of today). Filtered server-side so the client never receives
// rows it would only throw away.
const UPCOMING_WINDOW_DAYS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Retailer EMI dashboard lists — computed server-side (service client, no RLS,
// no 1000-row truncation) so even a 1000+ customer retailer gets correct totals.
//
//   GET /api/retailer/emi-lists              → logged-in retailer's lists
//   GET /api/retailer/emi-lists?retailer_id= → admin drill-down into a retailer
//
// Returns:
//   upcoming[] — one row per customer with an UN-overdue next EMI, nearest first.
//   due[]      — one row per OVERDUE customer (combined, never duplicated),
//                nearest overdue first.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  status: string;
  customer_photo_url: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

export interface UpcomingRow {
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  customer_photo_url: string | null;
  due_date: string;
  emi_no: number;
  emi_amount: number;
  remaining_balance: number;
  /** Whole-day countdown in IST: 0 = today, 1 = tomorrow, … up to the window. */
  days_remaining: number;
}

export interface DueRow {
  customer_id: string;
  customer_name: string;
  mobile: string;
  imei: string;
  overdue_count: number;
  earliest_due_date: string;
  total_fine: number;
  total_due: number;          // overdue principal + fine + 1st charge
  total_outstanding: number;  // ALL remaining principal + fine + 1st charge
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

  // ── Resolve scope (retailers always see only their own portfolio) ──────────
  let retailerId: string | null = req.nextUrl.searchParams.get('retailer_id');
  if (isRetailer) {
    const { data: r } = await svc
      .from('retailers').select('id').eq('auth_user_id', user.id).single();
    if (!r) return NextResponse.json({ error: 'Retailer not found' }, { status: 403 });
    retailerId = r.id;
  }
  if (!retailerId) return NextResponse.json({ error: 'retailer_id required' }, { status: 400 });

  const { data: fs } = await svc
    .from('fine_settings').select('default_fine_amount, weekly_fine_increment').eq('id', 1).single();
  const baseFine = Number(fs?.default_fine_amount ?? 450);
  const weeklyIncrement = Number(fs?.weekly_fine_increment ?? 25);

  // ── Load this retailer's RUNNING customers ─────────────────────────────────
  const customers = await fetchAllPaged<CustomerRow>((from, to) =>
    svc
      .from('customers')
      .select('id, customer_name, mobile, imei, status, customer_photo_url, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at')
      .eq('retailer_id', retailerId as string)
      .eq('status', 'RUNNING')
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>,
  );

  if (!customers.length) {
    return NextResponse.json({ upcoming: [], due: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const ids = customers.map(c => c.id);
  const custMap = new Map(customers.map(c => [c.id, c]));

  const emiList = await fetchAllByIds<EMISchedule>(ids, (chunk, from, to) =>
    svc
      .from('emi_schedule')
      .select('id, customer_id, emi_no, due_date, amount, status, partial_paid_amount, fine_amount, fine_waived, fine_paid_amount, collection_requested_at')
      .in('customer_id', chunk)
      .order('customer_id')
      .order('emi_no')
      .range(from, to) as unknown as PromiseLike<{ data: EMISchedule[] | null; error: { message: string } | null }>,
  );

  const byCustomer = new Map<string, EMISchedule[]>();
  for (const e of emiList) {
    const arr = byCustomer.get(e.customer_id) ?? [];
    arr.push(e);
    byCustomer.set(e.customer_id, arr);
  }

  // All due-date comparisons run on the IST calendar so the midnight rollover
  // matches Indian operations (Vercel/Node default to UTC).
  const today = todayIST();
  const todayMs = midnightIST(today);
  // Inclusive upper bound for the "Upcoming (Next 5 Days)" window.
  const windowEndMs = midnightIST(addDaysIST(today, UPCOMING_WINDOW_DAYS));

  // Remaining principal still owed on a single EMI row.
  const remaining = (e: EMISchedule) =>
    e.status === 'APPROVED' ? 0 : Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0));

  const upcoming: UpcomingRow[] = [];
  const due: DueRow[] = [];

  for (const c of customers) {
    const cEmis = byCustomer.get(c.id) ?? [];
    const open = cEmis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');

    const allRemaining = cEmis.reduce((s, e) => s + remaining(e), 0);
    const chargeDue = firstChargeRemaining(c);
    const totalFine = calculateTotalFineFromEmis(cEmis, baseFine, weeklyIncrement);

    const overdue = open.filter(e => midnightIST(e.due_date) < todayMs);
    // Upcoming = next EMI that is not yet overdue. Sorted nearest-first.
    const upcomingEmis = open
      .filter(e => midnightIST(e.due_date) >= todayMs)
      .sort((a, b) => midnightIST(a.due_date) - midnightIST(b.due_date));

    // ── DUE: one combined entry per overdue customer ─────────────────────────
    if (overdue.length > 0) {
      const overdueRemaining = overdue.reduce((s, e) => s + remaining(e), 0);
      const earliest = overdue
        .map(e => e.due_date)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
      due.push({
        customer_id: c.id,
        customer_name: c.customer_name,
        mobile: c.mobile || '',
        imei: c.imei || '',
        overdue_count: overdue.length,
        earliest_due_date: earliest,
        total_fine: totalFine,
        total_due: overdueRemaining + totalFine + chargeDue,
        total_outstanding: allRemaining + totalFine + chargeDue,
      });
    }

    // ── UPCOMING (Next 5 Days): nearest not-yet-overdue EMI, but ONLY if it
    // falls inside the [today, today + 5 days] window. Customers whose next EMI
    // is further out (or who are already overdue / fully paid) are excluded. ──
    if (upcomingEmis.length > 0) {
      const next = upcomingEmis[0];
      if (midnightIST(next.due_date) <= windowEndMs) {
        upcoming.push({
          customer_id: c.id,
          customer_name: c.customer_name,
          mobile: c.mobile || '',
          imei: c.imei || '',
          customer_photo_url: c.customer_photo_url || null,
          due_date: next.due_date,
          emi_no: next.emi_no,
          emi_amount: Number(next.amount || 0),
          remaining_balance: allRemaining,
          days_remaining: Math.max(0, diffDaysIST(next.due_date, today)),
        });
      }
    }
  }

  // Ascending by due date — nearest (Today) first.
  upcoming.sort((a, b) => midnightIST(a.due_date) - midnightIST(b.due_date));
  due.sort((a, b) => midnightIST(a.earliest_due_date) - midnightIST(b.earliest_due_date));

  void custMap; // (kept for potential future enrichment)
  return NextResponse.json({ upcoming, due }, { headers: { 'Cache-Control': 'no-store' } });
}
