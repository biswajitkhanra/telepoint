import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { firstChargeRemaining } from '@/lib/firstCharge';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { todayIST, midnightIST } from '@/lib/ist';
import { EMISchedule } from '@/lib/types';
import { reverseApprovedRequestEffects, recomputeCustomerCompletion } from '@/lib/paymentReconcile';

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  customer_name: string;
  mobile: string | null;
  imei: string | null;
  status: string;
  retailer_id: string | null;
  purchase_value: number | null;
  down_payment: number | null;
  disburse_amount: number | null;
  purchase_date: string | null;
  created_at: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const svc = createServiceClient();
    const today = todayIST();
    const todayMs = midnightIST(today);

    // 1. Fetch fine settings
    const { data: fs } = await svc
      .from('fine_settings')
      .select('default_fine_amount, weekly_fine_increment')
      .eq('id', 1)
      .single();
    const baseFine = Number(fs?.default_fine_amount ?? 450);
    const weeklyIncrement = Number(fs?.weekly_fine_increment ?? 25);

    // 2. Fetch Retailers
    const { data: retailersData } = await svc
      .from('retailers')
      .select('id, name, username, mobile, is_active')
      .order('name');
    const retailers = retailersData || [];
    const retailerMap = new Map<string, string>();
    for (const r of retailers) {
      retailerMap.set(r.id, r.name);
    }

    // 3. Fetch all customers
    const customers = await fetchAllPaged<CustomerRow>((from, to) =>
      svc
        .from('customers')
        .select('id, customer_name, mobile, imei, status, retailer_id, purchase_value, down_payment, disburse_amount, purchase_date, created_at, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at')
        .order('created_at', { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>
    );

    const custIds = customers.map(c => c.id);

    // 4. Fetch EMIs
    const emiList = custIds.length > 0
      ? await fetchAllByIds<EMISchedule>(custIds, (chunk, from, to) =>
          svc
            .from('emi_schedule')
            .select('id, customer_id, emi_no, due_date, amount, status, partial_paid_amount, paid_at, fine_amount, fine_waived, fine_paid_amount, collection_requested_at')
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

    // Compute portfolio totals
    let totalDisbursed = 0;
    let totalCollected = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let runningCount = 0;
    let completedCount = 0;
    let settledCount = 0;

    const retailerStats = new Map<string, { activeCount: number; disbursed: number; collected: number }>();
    for (const r of retailers) {
      retailerStats.set(r.id, { activeCount: 0, disbursed: 0, collected: 0 });
    }

    for (const c of customers) {
      if (c.status === 'RUNNING') runningCount++;
      else if (c.status === 'COMPLETED') completedCount++;
      else if (c.status === 'SETTLED') settledCount++;

      const disburse = Number(c.disburse_amount || 0) || Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
      totalDisbursed += disburse;

      const rStat = c.retailer_id ? retailerStats.get(c.retailer_id) : undefined;
      if (rStat) {
        if (c.status === 'RUNNING') rStat.activeCount++;
        rStat.disbursed += disburse;
      }

      const cEmis = byCustomer.get(c.id) ?? [];
      let cOverdue = 0;
      for (const e of cEmis) {
        const amt = Number(e.amount || 0);
        const part = Number(e.partial_paid_amount || 0);
        if (e.status === 'APPROVED') {
          totalCollected += amt;
          if (rStat) rStat.collected += amt;
        } else {
          totalCollected += part;
          if (rStat) rStat.collected += part;
          if (midnightIST(e.due_date) < todayMs) {
            cOverdue += Math.max(0, amt - part);
          }
        }
      }

      if (c.status === 'RUNNING' && cOverdue > 0) {
        const cFine = calculateTotalFineFromEmis(cEmis, baseFine, weeklyIncrement);
        const chargeDue = firstChargeRemaining(c);
        overdueCount++;
        overdueAmount += (cOverdue + cFine + chargeDue);
      }
    }

    // 5. Fetch Pending Approvals
    const { data: pendingReqs } = await svc
      .from('payment_requests')
      .select('id, customer_id, retailer_id, total_amount, total_emi_amount, fine_amount, mode, status, utr, created_at, customer:customers(customer_name, mobile, imei), retailer:retailers(name)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(50);

    const formattedPending = (pendingReqs || []).map(p => {
      const cust = Array.isArray(p.customer) ? p.customer[0] : p.customer;
      const ret = Array.isArray(p.retailer) ? p.retailer[0] : p.retailer;
      return {
        id: p.id,
        customer_id: p.customer_id,
        customer_name: cust?.customer_name || 'Customer',
        mobile: cust?.mobile || '',
        imei: cust?.imei || '',
        retailer_name: ret?.name || (p.retailer_id ? retailerMap.get(p.retailer_id) : 'Direct/Store') || 'Store',
        total_amount: Number(p.total_amount || p.total_emi_amount || 0),
        fine_amount: Number(p.fine_amount || 0),
        mode: p.mode || 'CASH',
        utr: p.utr || '',
        created_at: p.created_at,
      };
    });

    // 6. Retailers summary array
    const formattedRetailers = retailers.map(r => {
      const st = retailerStats.get(r.id) || { activeCount: 0, disbursed: 0, collected: 0 };
      return {
        id: r.id,
        name: r.name,
        username: r.username,
        mobile: r.mobile,
        isActive: r.is_active,
        activeCount: st.activeCount,
        disbursed: st.disbursed,
        collected: st.collected,
      };
    });

    // 7. Recent 30 customers
    const recentCustomers = customers.slice(0, 35).map(c => ({
      id: c.id,
      customer_name: c.customer_name,
      mobile: c.mobile,
      imei: c.imei,
      status: c.status,
      purchase_value: c.purchase_value,
      retailer_name: c.retailer_id ? retailerMap.get(c.retailer_id) || 'Store' : 'Direct',
      created_at: c.created_at,
    }));

    return NextResponse.json({
      summary: {
        totalCustomers: customers.length,
        runningCount,
        completedCount,
        settledCount,
        totalDisbursed,
        totalCollected,
        overdueCount,
        overdueAmount,
        pendingApprovalsCount: formattedPending.length,
        retailersCount: retailers.length,
      },
      pendingApprovals: formattedPending,
      retailers: formattedRetailers,
      recentCustomers,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Mobile admin GET error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to fetch admin data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const svc = createServiceClient();
    const body = await req.json();
    const { action, request_id, admin_id, remark, reason } = body;

    if (action === 'approve') {
      if (!request_id) {
        return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
      }

      // Execute atomic DB RPC
      const { data: result, error: rpcErr } = await svc.rpc('approve_payment_request', {
        p_request_id: request_id,
        p_admin_id: admin_id || '00000000-0000-0000-0000-000000000000',
        p_remark: remark || 'Approved via Mobile Admin Console',
      });

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }

      const res = result as { success?: boolean; error?: string; already_approved?: boolean };
      if (!res?.success) {
        return NextResponse.json({ error: res?.error || 'Approval failed' }, { status: 400 });
      }

      return NextResponse.json({ success: true, request_id, already_approved: res.already_approved ?? false });
    }

    if (action === 'reject') {
      if (!request_id || !reason) {
        return NextResponse.json({ error: 'request_id and reason are required' }, { status: 400 });
      }

      const { data: request, error: reqFetchErr } = await svc
        .from('payment_requests')
        .select('*')
        .eq('id', request_id)
        .single();
      if (reqFetchErr || !request) {
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
      }

      if (request.status === 'APPROVED') {
        await reverseApprovedRequestEffects(svc, request);
        await recomputeCustomerCompletion(svc, request.customer_id);
      }

      const { data: items } = await svc
        .from('payment_request_items')
        .select('emi_schedule_id')
        .eq('payment_request_id', request_id);
      const emiIds = (items || []).map((item: { emi_schedule_id: string }) => item.emi_schedule_id).filter(Boolean);

      if (emiIds.length) {
        const { data: emiRows } = await svc
          .from('emi_schedule')
          .select('id, amount, partial_paid_amount')
          .in('id', emiIds);
        for (const emi of emiRows || []) {
          const partialPaid = Number((emi as { partial_paid_amount?: number }).partial_paid_amount || 0);
          await svc.from('emi_schedule')
            .update({ status: partialPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID', collection_requested_at: null })
            .eq('id', (emi as { id: string }).id);
        }
      }

      await svc.rpc('recalc_customer_fines', { p_customer_id: request.customer_id }).then(() => null, () => null);

      const { error: reqErr } = await svc.from('payment_requests').update({
        status: 'REJECTED',
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      }).eq('id', request_id);

      if (reqErr) {
        return NextResponse.json({ error: reqErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'broadcast') {
      const { message, target_retailer_id, image_url, expires_at } = body;
      if (!message || !message.trim()) {
        return NextResponse.json({ error: 'Broadcast message is required' }, { status: 400 });
      }

      const expiry = expires_at || new Date(Date.now() + 7 * 86400000).toISOString();
      const insertRow = {
        message: message.trim(),
        target_retailer_id: target_retailer_id || null,
        image_url: image_url || null,
        expires_at: expiry,
        sender_name: 'ADMIN CONSOLE',
        sender_role: 'admin',
      };

      const { data: broadcastData, error: bErr } = await svc
        .from('broadcast_messages')
        .insert(insertRow)
        .select()
        .single();

      if (bErr) {
        return NextResponse.json({ error: bErr.message }, { status: 500 });
      }

      try {
        const { dispatchBroadcastPush } = await import('@/lib/notifications/broadcastPushEngine');
        await dispatchBroadcastPush(broadcastData);
      } catch (pushErr) {
        console.error('[AdminMobileRoute] Push error:', pushErr);
      }

      return NextResponse.json({ success: true, broadcast: broadcastData });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('Mobile admin POST error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
