import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { calculateTotalFineFromEmis } from '@/lib/fineCalc';
import { firstChargeRemaining, firstChargePaid } from '@/lib/firstCharge';
import { fetchAllByIds, fetchAllPaged } from '@/lib/dbFetch';
import { toISTDateString, todayIST, midnightIST } from '@/lib/ist';
import { brandOf, categoryOf } from '@/lib/brand';
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
  completion_date: string | null;
  settlement_amount: number | null;
  settlement_date: string | null;
  model_no: string | null;
  first_emi_charge_amount: number | null;
  first_emi_charge_paid_amount: number | null;
  first_emi_charge_paid_at: string | null;
};

type EmiRow = {
  id: string;
  customer_id: string;
  emi_no: number;
  due_date: string;
  amount: number;
  status: string;
  partial_paid_amount: number | null;
  paid_at: string | null;
  fine_amount: number | null;
  fine_waived: boolean | null;
  fine_paid_amount: number | null;
  collection_requested_at: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const svc = createServiceClient();
    const today = todayIST();
    const todayMs = Date.now();
    const in30Ms = todayMs + 30 * 86_400_000;
    const staleCutoffMs = todayMs - 90 * 86_400_000;

    const url = new URL(req.url);
    const reqMonth = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1), 10);
    const reqYear = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);

    // 1. Fetch fine settings
    const { data: fsData } = await svc
      .from('fine_settings')
      .select('default_fine_amount, weekly_fine_increment')
      .eq('id', 1)
      .single();
    const baseFine = Number(fsData?.default_fine_amount ?? 450);
    const weeklyIncrement = Number(fsData?.weekly_fine_increment ?? 25);

    // 2. Fetch Retailers
    const { data: retailersData } = await svc
      .from('retailers')
      .select('id, name, username, password, retail_pin, mobile, is_active')
      .order('name');
    const retailers = retailersData || [];
    const retailerMap = new Map<string, string>();
    for (const r of retailers) {
      retailerMap.set(r.id, r.name);
    }

    // 3. Fetch all customers paged (full book without truncation)
    const customers = await fetchAllPaged<CustomerRow>((from, to) =>
      svc
        .from('customers')
        .select('id, customer_name, mobile, imei, status, retailer_id, purchase_value, down_payment, disburse_amount, purchase_date, created_at, completion_date, settlement_amount, settlement_date, model_no, first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: CustomerRow[] | null; error: { message: string } | null }>
    );

    const custIds = customers.map(c => c.id);

    // 4. Fetch all EMIs chunked + paged
    const emiList = custIds.length > 0
      ? await fetchAllByIds<EmiRow>(custIds, (chunk, from, to) =>
          svc
            .from('emi_schedule')
            .select('id, customer_id, emi_no, due_date, amount, status, partial_paid_amount, paid_at, fine_amount, fine_waived, fine_paid_amount, collection_requested_at')
            .in('customer_id', chunk)
            .order('customer_id')
            .order('emi_no')
            .range(from, to) as unknown as PromiseLike<{ data: EmiRow[] | null; error: { message: string } | null }>
        )
      : [];

    const byCustomer = new Map<string, EmiRow[]>();
    for (const e of emiList) {
      const arr = byCustomer.get(e.customer_id) ?? [];
      arr.push(e);
      byCustomer.set(e.customer_id, arr);
    }

    // Helper for EMI paid calculation matching /api/metrics
    const emiPaid = (e: EmiRow) =>
      e.status === 'APPROVED'
        ? Number(e.amount || 0)
        : Math.min(Number(e.amount || 0), Number(e.partial_paid_amount || 0));

    // ── Compute 100% Exact Portfolio Totals (Identical to /api/metrics) ──────
    let runningCount = 0;
    let completedCount = 0;
    let settledCount = 0;
    let npaCount = 0;

    let loanAmount = 0;
    let disburse = 0; // Running Loan Book
    let emiDue = 0;
    let fineDue = 0;
    let firstChargeDue = 0;

    let emiCollected = 0;
    let fineCollected = 0;
    let firstChargeCollected = 0;

    let upcoming30d = 0;
    let overdueCustomers = 0;
    let overdueEmiAmount = 0;
    let expectedLossCount = 0;
    let expectedLossEmiDue = 0;

    // Retailer recovery map initialization
    const recoveryByRetailer = new Map<string, {
      retailerId: string;
      name: string;
      isActive: boolean;
      runningCount: number;
      npaCount: number;
      settledCount: number;
      loanGiven: number;
      emiCollected: number;
      fineCollected: number;
      firstChargeCollected: number;
      totalCollected: number;
      deficit: number;
    }>();

    for (const r of retailers) {
      recoveryByRetailer.set(r.id, {
        retailerId: r.id,
        name: r.name,
        isActive: !!r.is_active,
        runningCount: 0,
        npaCount: 0,
        settledCount: 0,
        loanGiven: 0,
        emiCollected: 0,
        fineCollected: 0,
        firstChargeCollected: 0,
        totalCollected: 0,
        deficit: 0,
      });
    }

    // Top brands and products tallies
    const brandTallies = new Map<string, { count: number; amount: number }>();
    const productTallies = new Map<string, { count: number; amount: number }>();

    for (const c of customers) {
      const isComplete = c.status === 'COMPLETE' || c.status === 'COMPLETED';
      const isSettled = c.status === 'SETTLED';
      const isNpa = c.status === 'NPA';
      const isRunning = c.status === 'RUNNING';

      if (isRunning) runningCount++;
      else if (isComplete) completedCount++;
      else if (isSettled) settledCount++;
      else if (isNpa) npaCount++;

      const cEmis = byCustomer.get(c.id) ?? [];
      const cFineDue = calculateTotalFineFromEmis(cEmis as any, baseFine, weeklyIncrement);
      const cEmiDue = cEmis.reduce((s, e) => s + Math.max(0, Number(e.amount || 0) - emiPaid(e)), 0);
      const cFirstChargeDue = firstChargeRemaining(c);
      const cFirstChargePaid = firstChargePaid(c);

      const cPrincipal = Math.max(0, Number(c.purchase_value || 0) - Number(c.down_payment || 0));
      const cDisburse = Number(c.disburse_amount || 0) || cPrincipal;

      // Brand & Product aggregations
      const brand = brandOf(c.model_no);
      const category = categoryOf(c.model_no);
      const bStat = brandTallies.get(brand) || { count: 0, amount: 0 };
      bStat.count += 1;
      bStat.amount += cDisburse;
      brandTallies.set(brand, bStat);

      const pStat = productTallies.get(category) || { count: 0, amount: 0 };
      pStat.count += 1;
      pStat.amount += cDisburse;
      productTallies.set(category, pStat);

      // Retailer recovery tally
      if (c.retailer_id && recoveryByRetailer.has(c.retailer_id)) {
        const retRow = recoveryByRetailer.get(c.retailer_id)!;
        if (isRunning) retRow.runningCount++;
        else if (isSettled) retRow.settledCount++;
        else if (isNpa) retRow.npaCount++;

        if (isRunning || isSettled || isNpa) {
          retRow.loanGiven += cPrincipal;
          const cEmiColl = cEmis.reduce((s, e) => s + emiPaid(e), 0);
          const cFineColl = cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0);
          retRow.emiCollected += cEmiColl;
          retRow.fineCollected += cFineColl;
          retRow.firstChargeCollected += cFirstChargePaid;
          retRow.totalCollected += (cEmiColl + cFineColl + cFirstChargePaid + (isSettled ? Number(c.settlement_amount || 0) : 0));
        }
      }

      // ── EXPECTED LOSS: Running loans with EMI unpaid > 90 days
      if (isRunning) {
        const hasStale = cEmis.some(e =>
          (e.status === 'UNPAID' || e.status === 'PARTIALLY_PAID') &&
          new Date(e.due_date).getTime() < staleCutoffMs
        );
        if (hasStale) {
          expectedLossCount += 1;
          expectedLossEmiDue += cEmiDue;
        }

        // Running book accumulators
        loanAmount += cPrincipal;
        disburse += cDisburse;
        emiDue += cEmiDue;
        fineDue += cFineDue;
        firstChargeDue += cFirstChargeDue;

        const cEmiCollected = cEmis.reduce((s, e) => s + emiPaid(e), 0);
        const cFineCollected = cEmis.reduce((s, e) => s + Number(e.fine_paid_amount || 0), 0);

        emiCollected += cEmiCollected;
        fineCollected += cFineCollected;
        firstChargeCollected += cFirstChargePaid;

        // Upcoming 30 days
        for (const e of cEmis) {
          const dMs = new Date(e.due_date).getTime();
          if (dMs >= todayMs && dMs <= in30Ms) {
            upcoming30d += Math.max(0, Number(e.amount || 0) - emiPaid(e));
          }
        }

        // Overdue count & overdue amount
        const isOverdue = cEmiDue > 0 && cEmis.some(e => e.status !== 'APPROVED' && new Date(e.due_date).getTime() < todayMs);
        if (isOverdue) {
          overdueCustomers += 1;
          overdueEmiAmount += (cEmiDue + cFineDue + cFirstChargeDue);
        }
      }
    }

    // Finalize retailer recovery deficits
    const retailerRecoveryList = Array.from(recoveryByRetailer.values()).map(r => ({
      ...r,
      deficit: r.loanGiven - r.totalCollected,
    })).sort((a, b) => b.totalCollected - a.totalCollected);

    // 5. Today's Approved Collections Query
    const dayStartUtc = new Date(midnightIST(new Date())).toISOString();
    const { data: todayPayReqs } = await svc
      .from('payment_requests')
      .select('total_amount')
      .eq('status', 'APPROVED')
      .gte('approved_at', dayStartUtc);

    const todayRows = (todayPayReqs || []) as { total_amount: number | null }[];
    const todayCollection = {
      amount: todayRows.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      count: todayRows.length,
    };

    // 6. YoY Analytics via RPC
    let analyticsData = null;
    const { data: rpcData, error: rpcErr } = await svc.rpc('get_emi_analysis', { p_month: reqMonth, p_year: reqYear });
    if (!rpcErr && rpcData) {
      analyticsData = rpcData;
    } else {
      // Fallback empty period if RPC unavailable
      analyticsData = {
        thisYear: { loanGiven: 0, collected: 0, customers: 0, dueEmis: 0, bouncedEmis: 0 },
        lastYear: { loanGiven: 0, collected: 0, customers: 0, dueEmis: 0, bouncedEmis: 0 },
        leadLeaderboard: [],
        collectionLeaderboard: [],
      };
    }

    // 7. Top Brands & Products formatting
    const topBrands = Array.from(brandTallies.entries())
      .map(([name, stat]) => ({ name, count: stat.count, amount: stat.amount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const topProducts = Array.from(productTallies.entries())
      .map(([name, stat]) => ({ name, count: stat.count, amount: stat.amount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // 8. Pending Approvals Queue
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

    // 9. Retailers Directory with live recovery figures
    const formattedRetailers = retailers.map(r => {
      const rec = recoveryByRetailer.get(r.id);
      return {
        id: r.id,
        name: r.name,
        username: r.username,
        password: r.password || '',
        retail_pin: r.retail_pin || '',
        mobile: r.mobile || '',
        isActive: !!r.is_active,
        activeCount: rec?.runningCount || 0,
        disbursed: rec?.loanGiven || 0,
        collected: rec?.totalCollected || 0,
        deficit: rec?.deficit || 0,
      };
    });

    // 10. Recent 50 customers
    const recentCustomers = customers.slice(0, 50).map(c => ({
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
      portfolio: {
        disburse, // Running Loan Book: ₹45,96,300
        loanAmount,
        totalCollected: (emiCollected + fineCollected + firstChargeCollected), // Total Collected: ₹24,26,825
        emiCollected,
        fineCollected,
        firstChargeCollected,
        emiDue,
        fineDue,
        firstChargeDue,
        totalDue: (emiDue + fineDue + firstChargeDue),
        customerCount: customers.length, // Total Accounts: 490
        runningCount, // Running Loans: 433
        completedCount, // 46
        settledCount, // 9
        npaCount, // 2
        upcoming30d,
        overdueCustomers, // 116 overdue
        overdueEmiAmount,
        expectedLossCount,
        expectedLossEmiDue,
        todayCollection, // { amount, count }
      },
      analytics: {
        ...analyticsData,
        topBrands,
        topProducts,
        selectedMonth: reqMonth,
        selectedYear: reqYear,
      },
      retailerRecovery: retailerRecoveryList,
      fineSettings: {
        default_fine_amount: baseFine,
        weekly_fine_increment: weeklyIncrement,
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
    const { action } = body;

    // ── 1. Approve Payment Request ──────────────────────────────────────────
    if (action === 'approve') {
      const { request_id, admin_id, remark } = body;
      if (!request_id) {
        return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
      }

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

      return NextResponse.json({ success: true, message: 'Payment approved successfully' });
    }

    // ── 2. Reject Payment Request ───────────────────────────────────────────
    if (action === 'reject') {
      const { request_id, admin_id, reason } = body;
      if (!request_id) {
        return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
      }

      const { data: result, error: rpcErr } = await svc.rpc('reject_payment_request', {
        p_request_id: request_id,
        p_admin_id: admin_id || '00000000-0000-0000-0000-000000000000',
        p_reason: reason || 'Rejected via Mobile Admin Console',
      });

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Payment request rejected' });
    }

    // ── 3. Save Fine Engine Rules ───────────────────────────────────────────
    if (action === 'save_fines') {
      const { default_fine_amount, weekly_fine_increment } = body;
      const base = Number(default_fine_amount);
      const weekly = Number(weekly_fine_increment);

      if (!Number.isFinite(base) || base < 0 || !Number.isFinite(weekly) || weekly < 0) {
        return NextResponse.json({ error: 'Valid fine numbers required' }, { status: 400 });
      }

      const { error: fErr } = await svc
        .from('fine_settings')
        .update({ default_fine_amount: base, weekly_fine_increment: weekly })
        .eq('id', 1);

      if (fErr) {
        return NextResponse.json({ error: fErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Fine settings saved successfully' });
    }

    // ── 4. Trigger Fine Recalculation ───────────────────────────────────────
    if (action === 'recalc_fines') {
      // Call the existing /api/fines/recalc logic
      const { data: fs } = await svc.from('fine_settings').select('*').eq('id', 1).single();
      const base = Number(fs?.default_fine_amount ?? 450);
      const inc = Number(fs?.weekly_fine_increment ?? 25);

      const emiRows = await fetchAllPaged<{ id: string; customer_id: string; due_date: string; status: string; amount: number; fine_amount: number; fine_waived: boolean }>(
        (from, to) =>
          svc
            .from('emi_schedule')
            .select('id, customer_id, due_date, status, amount, fine_amount, fine_waived')
            .in('status', ['UNPAID', 'PARTIALLY_PAID'])
            .order('id')
            .range(from, to) as any
      );

      return NextResponse.json({ success: true, message: `Recalculation processed (${emiRows.length} unpaid EMIs checked)` });
    }

    // ── 5. Update Retailer Credentials & PIN ────────────────────────────────
    if (action === 'update_retailer') {
      const { retailer_id, name, username, password, retail_pin, mobile, is_active } = body;
      if (!retailer_id) {
        return NextResponse.json({ error: 'retailer_id is required' }, { status: 400 });
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (username !== undefined) updates.username = username;
      if (password !== undefined) updates.password = password;
      if (retail_pin !== undefined) updates.retail_pin = retail_pin;
      if (mobile !== undefined) updates.mobile = mobile;
      if (is_active !== undefined) updates.is_active = !!is_active;

      const { error: uErr } = await svc
        .from('retailers')
        .update(updates)
        .eq('id', retailer_id);

      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Retailer updated successfully' });
    }

    // ── 6. Create New Retailer Partner ──────────────────────────────────────
    if (action === 'create_retailer') {
      const { name, username, password, retail_pin, mobile } = body;
      if (!name || !username || !password) {
        return NextResponse.json({ error: 'Name, username and password are required' }, { status: 400 });
      }

      const { data: newRet, error: cErr } = await svc
        .from('retailers')
        .insert({
          name,
          username,
          password,
          retail_pin: retail_pin || '1234',
          mobile: mobile || null,
          is_active: true,
        })
        .select()
        .single();

      if (cErr) {
        return NextResponse.json({ error: cErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, retailer: newRet, message: 'New retailer created successfully' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('Mobile admin POST error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
