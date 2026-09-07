import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { firstChargeRemaining } from '@/lib/firstCharge';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { todayIST, addDaysIST, midnightIST, diffDaysIST, IST_OFFSET_MS } from '@/lib/ist';
import { EMISchedule } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UPCOMING_WINDOW_DAYS = 5;

type CustomerRow = {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  status: string;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  purchase_date: string | null;
  created_at: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

type PayReqRow = {
  id: string;
  total_amount: number | null;
  total_emi_amount: number | null;
  fine_amount: number | null;
  first_emi_charge_amount: number | null;
  mode: string | null;
  status: string | null;
  utr: string | null;
  created_at: string | null;
  approved_at: string | null;
  customer_id: string | null;
  customer?: { customer_name?: string; imei?: string };
};

export async function GET(req: NextRequest) {
  try {
    const svc = createServiceClient();
    let retailerId = req.nextUrl.searchParams.get('retailer_id');
    const username = req.nextUrl.searchParams.get('username');

    if (!retailerId && username) {
      const { data: r } = await svc
        .from('retailers')
        .select('id, name, username, mobile')
        .ilike('username', username.trim())
        .single();
      if (r) retailerId = r.id;
    }

    if (!retailerId) {
      // Fallback: pick first active retailer
      const { data: firstR } = await svc
        .from('retailers')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();
      retailerId = firstR?.id || null;
    }

    if (!retailerId) {
      return NextResponse.json({ error: 'Retailer ID is required' }, { status: 400 });
    }

    const today = todayIST();
    const todayMs = midnightIST(today);
    const windowEndMs = midnightIST(addDaysIST(today, UPCOMING_WINDOW_DAYS));

    const { data: fs } = await svc
      .from('fine_settings')
      .select('default_fine_amount, weekly_fine_increment')
      .eq('id', 1)
      .single();
    const baseFine = Number(fs?.default_fine_amount ?? 450);
    const weeklyIncrement = Number(fs?.weekly_fine_increment ?? 25);

    // 1. Fetch Customers under this retailer
    const customers = await fetchAllPaged<CustomerRow>((from, to) =>
      svc
        .from('customers')
        .select('id, customer_name, mobile, imei, status, purchase_value, down_payment, disburse_amount, purchase_date, created_at, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at')
        .eq('retailer_id', retailerId as string)
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>
    );

    const ids = customers.map(c => c.id);

    // 2. Fetch EMIs for these customers
    const emiList = ids.length > 0
      ? await fetchAllByIds<EMISchedule>(ids, (chunk, from, to) =>
          svc
            .from('emi_schedule')
            .select('id, customer_id, emi_no, due_date, amount, status, partial_paid_amount, fine_amount, fine_waived, fine_paid_amount, collection_requested_at')
            .in('customer_id', chunk)
            .order('customer_id')
            .order('emi_no')
            .range(from, to) as unknown as PromiseLike<{ data: EMISchedule[] | null; error: { message: string } | null }>
        )
      : [];

    const byCustomer = new Map<string, EMISchedule[]>();
    for (const e of emiList) {
      const arr = byCustomer.get(e.customer_id) ?? [];
      arr.push(e);
      byCustomer.set(e.customer_id, arr);
    }

    const remaining = (e: EMISchedule) =>
      e.status === 'APPROVED' ? 0 : Math.max(0, Number(e.amount || 0) - Number(e.partial_paid_amount || 0));

    const upcoming: any[] = [];
    const due: any[] = [];

    for (const c of customers) {
      if (c.status !== 'RUNNING') continue;
      const cEmis = byCustomer.get(c.id) ?? [];
      const open = cEmis.filter(e => e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID');
      const allRemaining = cEmis.reduce((s, e) => s + remaining(e), 0);
      const chargeDue = firstChargeRemaining(c);
      const totalFine = calculateTotalFineFromEmis(cEmis, baseFine, weeklyIncrement);

      const overdue = open.filter(e => midnightIST(e.due_date) < todayMs);
      const upcomingEmis = open
        .filter(e => midnightIST(e.due_date) >= todayMs)
        .sort((a, b) => midnightIST(a.due_date) - midnightIST(b.due_date));

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

      if (upcomingEmis.length > 0) {
        const next = upcomingEmis[0];
        if (midnightIST(next.due_date) <= windowEndMs) {
          upcoming.push({
            customer_id: c.id,
            customer_name: c.customer_name,
            mobile: c.mobile || '',
            imei: c.imei || '',
            due_date: next.due_date,
            emi_no: next.emi_no,
            emi_amount: Number(next.amount || 0),
            remaining_balance: allRemaining,
            days_remaining: Math.max(0, diffDaysIST(next.due_date, today)),
          });
        }
      }
    }

    upcoming.sort((a, b) => midnightIST(a.due_date) - midnightIST(b.due_date));
    due.sort((a, b) => midnightIST(a.earliest_due_date) - midnightIST(b.earliest_due_date));

    // 3. MTD Performance
    const startOfMonthIST = `${today.slice(0, 7)}-01`;
    const [fy, fm, fd] = startOfMonthIST.split('-').map(Number);
    const startUtc = new Date(Date.UTC(fy, fm - 1, fd) - IST_OFFSET_MS).toISOString();

    const { data: approvedPayReqs } = await svc
      .from('payment_requests')
      .select('total_amount, total_emi_amount, fine_amount, first_emi_charge_amount, approved_at')
      .eq('retailer_id', retailerId)
      .eq('status', 'APPROVED')
      .gte('approved_at', startUtc);

    let collectedAmount = 0;
    for (const p of approvedPayReqs || []) {
      collectedAmount += Number(p.total_amount || 0) ||
        (Number(p.total_emi_amount || 0) + Number(p.fine_amount || 0) + Number(p.first_emi_charge_amount || 0));
    }

    const { count: pendingApprovalsCount } = await svc
      .from('payment_requests')
      .select('id', { count: 'exact', head: true })
      .eq('retailer_id', retailerId)
      .eq('status', 'PENDING');

    let disbursedAmount = 0;
    let activePhones = 0;
    for (const c of customers) {
      if (c.status === 'RUNNING') {
        activePhones += 1;
        const purchase = c.purchase_date || c.created_at;
        if (purchase && purchase >= startOfMonthIST) {
          disbursedAmount += Number(c.disburse_amount || 0) || Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
        }
      }
    }

    // 4. Recent Payment Requests (Ledger)
    const { data: recentPayments } = await svc
      .from('payment_requests')
      .select('id, total_amount, mode, status, utr, created_at, approved_at, customer:customers(customer_name, imei)')
      .eq('retailer_id', retailerId)
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      retailerId,
      mtdStats: {
        disbursedAmount,
        collectedAmount,
        activePhones,
        pendingApprovals: pendingApprovalsCount || 0,
      },
      upcoming,
      due,
      customers: customers.map(c => ({
        id: c.id,
        customer_name: c.customer_name,
        mobile: c.mobile,
        imei: c.imei,
        status: c.status,
      })),
      recentPayments: recentPayments || [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load retailer dashboard' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const svc = createServiceClient();
    const body = await req.json();
    const { retailer_id, customer_id, emi_no, amount, mode, utr } = body;

    if (!retailer_id || !customer_id || !amount) {
      return NextResponse.json({ error: 'retailer_id, customer_id, and amount are required' }, { status: 400 });
    }

    const { data: payReq, error } = await svc
      .from('payment_requests')
      .insert({
        retailer_id,
        customer_id,
        emi_no: emi_no || 1,
        total_amount: Number(amount),
        total_emi_amount: Number(amount),
        mode: mode || 'CASH',
        utr: utr || null,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, payment_request: payReq });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to submit payment' }, { status: 500 });
  }
}
