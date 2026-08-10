import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/csv';
import { istMonthRange, toISTDateString } from '@/lib/ist';

/**
 * Monthly Retail Profit Report (CSV).
 *
 * Revenue is bucketed by payment_date (the actual IST calendar date the
 * payment was collected), NOT approved_at. This ensures historical payments
 * recorded on past dates land in the correct month.
 *
 * Fix applied: the previous version used `new Date(y, m-1, 1)` which creates
 * dates in UTC (Vercel's default timezone), causing off-by-one-day errors
 * around IST midnight. Now uses istMonthRange() for correct IST boundaries.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // SECURITY: cross-retailer profit report — super admin only. Without this
  // check any authenticated retailer could read every other retailer's
  // disbursal, collection and profit figures.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 });
  }

  const svc = createServiceClient();
  const m = parseInt(req.nextUrl.searchParams.get('month') || String(new Date().getMonth() + 1));
  const y = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));

  if (m < 1 || m > 12 || y < 2020 || y > 2099) {
    return NextResponse.json({ error: 'Valid month (1-12) and year required' }, { status: 400 });
  }

  // IST-aware month boundaries — fixes the previous UTC Date constructor bug
  const { startUtc, endUtc } = istMonthRange(y, m);
  const startDate = toISTDateString(startUtc); // YYYY-MM-DD
  const endDate = toISTDateString(endUtc);     // YYYY-MM-DD

  const { data: retailers } = await svc.from('retailers').select('id, name').eq('is_active', true).order('name');
  const rows: string[][] = [['Retailer', 'Total Purchase Value', 'Total Down Payment', 'Total Disburse', 'Total EMI Collected', 'Total Fine Collected', 'Total 1st Charge', 'Total Revenue', 'Realized Profit (COMPLETE)', 'Projected Profit (RUNNING)']];
  let realizedTotal = 0;
  let projectedTotal = 0;

  for (const r of retailers || []) {
    const { data: custs } = await svc.from('customers').select('id, purchase_value, down_payment, disburse_amount, status').eq('retailer_id', r.id);
    // Use payment_date for month scoping instead of approved_at
    // payment_date is an IST calendar date (YYYY-MM-DD), so we can compare directly
    const { data: payments } = await svc.from('payment_requests')
      .select('total_emi_amount, fine_amount, first_emi_charge_amount, payment_date, approved_at')
      .eq('retailer_id', r.id)
      .eq('status', 'APPROVED')
      .gte('payment_date', startDate)
      .lte('payment_date', endDate);

    const c = custs || [];
    const p = payments || [];
    const pv = c.reduce((s, x) => s + (Number(x.purchase_value) || 0), 0);
    const dp = c.reduce((s, x) => s + (Number(x.down_payment) || 0), 0);
    const di = c.reduce((s, x) => s + (Number(x.disburse_amount) || 0), 0);
    const emi = p.reduce((s, x) => s + (Number(x.total_emi_amount) || 0), 0);
    const fine = p.reduce((s, x) => s + (Number(x.fine_amount) || 0), 0);
    const charge = p.reduce((s, x) => s + (Number(x.first_emi_charge_amount) || 0), 0);
    let retailerRealized = 0;
    let retailerProjected = 0;

    for (const cust of c) {
      const { data: custPayments } = await svc.from('payment_requests')
        .select('total_emi_amount, fine_amount, first_emi_charge_amount')
        .eq('retailer_id', r.id)
        .eq('customer_id', cust.id)
        .eq('status', 'APPROVED');
      const collected = (custPayments || []).reduce((s, x) => s + (Number(x.total_emi_amount) || 0) + (Number(x.fine_amount) || 0) + (Number(x.first_emi_charge_amount) || 0), 0);
      const disburse = Number(cust.disburse_amount) || (Number(cust.purchase_value) - Number(cust.down_payment));
      const profit = collected - disburse;
      if (cust.status === 'COMPLETE') retailerRealized += profit;
      if (cust.status === 'RUNNING') retailerProjected += profit;
    }
    realizedTotal += retailerRealized;
    projectedTotal += retailerProjected;
    rows.push([r.name, String(pv), String(dp), String(di), String(emi), String(fine), String(charge), String(emi + fine + charge), String(retailerRealized), String(retailerProjected)]);
  }

  rows.push(['TOTAL', '', '', '', '', '', '', '', '' + realizedTotal, '' + projectedTotal]);
  const csv = rows.map(r => csvRow(r)).join('\r\n');
  const mn = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1];
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="Retail_Monthly_Profit_${mn}_${y}.csv"`, 'Cache-Control': 'no-store' } });
}
