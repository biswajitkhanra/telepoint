import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { firstChargeRemaining } from '@/lib/firstCharge';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { todayIST, addDaysIST, midnightIST, diffDaysIST, IST_OFFSET_MS } from '@/lib/ist';
import { EMISchedule } from '@/lib/types';
import { applyApprovedRequestEffects, recomputeCustomerCompletion } from '@/lib/paymentReconcile';

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
    const body = await req.json().catch(() => ({}));
    const {
      retailer_id,
      customer_id,
      emi_ids,
      emi_nos,
      emi_no,
      amount,
      total_amount,
      total_emi_amount,
      scheduled_emi_amount,
      fine_amount,
      fine_breakdown,
      first_emi_charge_amount,
      mode,
      utr,
      notes,
      retail_pin,
      fine_for_emi_no,
      fine_due_date,
      collected_by_role,
      collect_type,
      is_admin_direct,
    } = body;

    const noEmi = collect_type === 'fine_only' || collect_type === 'first_charge_only';
    const effectiveTotal = Number(total_amount || amount || 0);

    if (!customer_id || effectiveTotal <= 0) {
      return NextResponse.json({ error: 'customer_id and valid collection amount are required' }, { status: 400 });
    }

    if (mode === 'UPI' && !utr?.trim()) {
      return NextResponse.json({ error: 'UTR / Reference number is required for UPI payments' }, { status: 400 });
    }

    // 1. Fetch customer details
    const { data: customer, error: custErr } = await svc
      .from('customers')
      .select('id, retailer_id, customer_name, imei, mobile')
      .eq('id', customer_id)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Resolve effective retailer ID
    let effectiveRetailerId = retailer_id;
    if (!effectiveRetailerId || effectiveRetailerId === '00000000-0000-0000-0000-000000000000') {
      effectiveRetailerId = customer.retailer_id;
    }

    const isAdmin = collected_by_role === 'admin' || is_admin_direct;

    // 2. Verify Retailer PIN if not admin
    if (!isAdmin && retail_pin) {
      const { data: ret } = await svc
        .from('retailers')
        .select('id, retail_pin, is_active')
        .eq('id', effectiveRetailerId)
        .single();

      if (ret?.retail_pin && ret.retail_pin !== String(retail_pin).trim()) {
        return NextResponse.json({ error: 'Incorrect Retailer PIN' }, { status: 401 });
      }
    }

    // 3. Sequence Enforcement: Ensure lowest unpaid EMI is paid in order
    const selectedEmiNos = Array.isArray(emi_nos) && emi_nos.length > 0
      ? emi_nos
      : (emi_no ? [emi_no] : []);

    if (!noEmi && selectedEmiNos.length > 0 && !isAdmin) {
      const { data: allUnpaid } = await svc
        .from('emi_schedule')
        .select('emi_no')
        .eq('customer_id', customer_id)
        .in('status', ['UNPAID', 'PARTIALLY_PAID'])
        .order('emi_no', { ascending: true })
        .limit(1);

      const lowestUnpaidEmiNo = allUnpaid?.[0]?.emi_no;
      if (lowestUnpaidEmiNo !== undefined) {
        const submittedMin = Math.min(...(selectedEmiNos as number[]));
        if (submittedMin > lowestUnpaidEmiNo) {
          return NextResponse.json(
            { error: `EMI sequence violation. EMI #${lowestUnpaidEmiNo} must be paid before EMI #${submittedMin}.` },
            { status: 400 }
          );
        }
      }
    }

    // 4. Duplicate / Already paid check
    const selectedEmiIds = Array.isArray(emi_ids) ? emi_ids : [];
    if (!noEmi && selectedEmiIds.length > 0) {
      const { data: ch } = await svc
        .from('emi_schedule')
        .select('id, status, emi_no')
        .in('id', selectedEmiIds)
        .eq('customer_id', customer_id);

      for (const e of ch || []) {
        if (e.status === 'APPROVED') {
          return NextResponse.json({ error: `EMI #${e.emi_no} is already fully settled` }, { status: 409 });
        }
        if (e.status === 'PENDING_APPROVAL') {
          return NextResponse.json({ error: `EMI #${e.emi_no} already has a pending approval request` }, { status: 409 });
        }
      }
    }

    const now = new Date().toISOString();

    // 5. Create Payment Request Record
    const { data: payReq, error: reqErr } = await svc
      .from('payment_requests')
      .insert({
        customer_id,
        retailer_id: effectiveRetailerId,
        submitted_by: effectiveRetailerId,
        total_amount: effectiveTotal,
        total_emi_amount: Number(total_emi_amount || (selectedEmiIds.length ? effectiveTotal : 0)),
        scheduled_emi_amount: Number(scheduled_emi_amount || 0),
        fine_amount: Number(fine_amount || 0),
        fine_breakdown: Array.isArray(fine_breakdown) ? fine_breakdown : null,
        first_emi_charge_amount: Number(first_emi_charge_amount || 0),
        mode: mode || 'CASH',
        utr: mode === 'UPI' ? (utr ? utr.trim() : null) : null,
        notes: notes || null,
        status: isAdmin ? 'APPROVED' : 'PENDING',
        selected_emi_nos: selectedEmiNos,
        fine_for_emi_no: fine_for_emi_no || (selectedEmiNos[0] ?? null),
        fine_due_date: fine_due_date || null,
        collected_by_role: isAdmin ? 'admin' : 'retailer',
        approved_at: isAdmin ? now : null,
      })
      .select()
      .single();

    if (reqErr || !payReq) {
      return NextResponse.json({ error: reqErr?.message || 'Failed to record collection request' }, { status: 500 });
    }

    // 6. Insert items into payment_request_items
    if (!noEmi && selectedEmiIds.length > 0) {
      const eachAmount = Number(total_emi_amount || effectiveTotal) / selectedEmiIds.length;
      const items = selectedEmiIds.map((eid: string, i: number) => ({
        payment_request_id: payReq.id,
        emi_schedule_id: eid,
        emi_no: selectedEmiNos[i] || 1,
        amount: eachAmount,
      }));
      await svc.from('payment_request_items').insert(items);

      // Lock collection request timestamp on target EMIs
      await svc
        .from('emi_schedule')
        .update({
          collection_requested_at: now,
          status: isAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
        })
        .in('id', selectedEmiIds);
    }

    // 7. If Admin Direct Approval, reconcile balances & complete customer if needed
    if (isAdmin) {
      await applyApprovedRequestEffects(svc, payReq, effectiveRetailerId, now);
      await recomputeCustomerCompletion(svc, customer_id);
    }

    return NextResponse.json({
      success: true,
      payment_request: payReq,
      request_id: payReq.id,
      receipt: {
        receipt_id: `REC-${payReq.id.slice(0, 8).toUpperCase()}`,
        customer_name: customer.customer_name,
        imei: customer.imei,
        mobile: customer.mobile,
        total_amount: effectiveTotal,
        mode: mode || 'CASH',
        utr: utr || null,
        timestamp: now,
        status: isAdmin ? 'APPROVED' : 'PENDING_APPROVAL',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to submit payment' }, { status: 500 });
  }
}
