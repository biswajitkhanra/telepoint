import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeEqual } from '@/lib/safeEqual';

// Constant-time PIN check so response timing can't leak the PIN digit by digit.
function pinMatches(expected: string, provided: string): boolean {
  return expected.length > 0 && safeEqual(expected, provided.trim());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    customer_id, emi_ids, emi_nos, mode, utr, notes, retail_pin,
    total_emi_amount, scheduled_emi_amount, fine_amount,
    fine_breakdown,
    first_emi_charge_amount, total_amount,
    fine_for_emi_no, fine_due_date, collect_type,
  } = body;

  // "noEmi" requests collect only fine and/or first-charge without touching
  // any EMI principal row. Per-EMI fines (fine_breakdown) are still applied
  // separately to their target EMI rows in the reconciler.
  const noEmi = collect_type === 'fine_only' || collect_type === 'first_charge_only';

  if (!customer_id || (!noEmi && !emi_ids?.length) || !mode)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  if (!retail_pin?.trim())
    return NextResponse.json({ error: 'Retailer PIN required' }, { status: 400 });
  if (mode === 'UPI' && !utr?.trim())
    return NextResponse.json({ error: 'UTR required for UPI' }, { status: 400 });

  const supabase = createClient();
  const svc = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: retailer } = await svc
    .from('retailers')
    .select('id, retail_pin, is_active')
    .eq('auth_user_id', user.id)
    .single();

  if (!retailer?.is_active)
    return NextResponse.json({ error: 'Retailer inactive' }, { status: 403 });
  if (!pinMatches(String(retailer.retail_pin ?? ''), String(retail_pin)))
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });

  // ── OWNERSHIP CHECK: customer must belong to this retailer ────────────────
  const { data: custOwner } = await svc
    .from('customers')
    .select('id, retailer_id')
    .eq('id', customer_id)
    .single();
  if (!custOwner || custOwner.retailer_id !== retailer.id)
    return NextResponse.json({ error: 'Customer does not belong to your account' }, { status: 403 });

  // ── SUBMIT: one atomic, row-locked DB transaction ─────────────────────────
  // Sequence enforcement, the "already pending / already approved" EMI check,
  // and the insert itself (guarded by a DB-level partial unique index — at
  // most one PENDING request per customer) all happen inside a single
  // Postgres function. This closes the race a check-then-insert from Next.js
  // could never fully close: a double-click, two open tabs, or a retried
  // request can no longer both succeed as separate duplicate requests.
  const { data: result, error: rpcErr } = await svc.rpc('submit_payment_request', {
    p_customer_id:             customer_id,
    p_retailer_id:             retailer.id,
    p_submitted_by:            user.id,
    p_mode:                    mode,
    p_utr:                     utr || null,
    p_notes:                   [notes, utr ? 'UTR: ' + utr : ''].filter(Boolean).join(' | ') || null,
    p_emi_ids:                 noEmi ? [] : (emi_ids || []),
    p_emi_nos:                 noEmi ? [] : (emi_nos || []),
    p_total_emi_amount:        total_emi_amount || 0,
    p_scheduled_emi_amount:    scheduled_emi_amount || 0,
    p_fine_amount:             fine_amount || 0,
    p_first_emi_charge_amount: first_emi_charge_amount || 0,
    p_total_amount:            total_amount || 0,
    p_fine_for_emi_no:         fine_for_emi_no || null,
    p_fine_due_date:           fine_due_date || null,
    p_fine_breakdown:          Array.isArray(fine_breakdown) ? fine_breakdown : null,
    // This route is retailer-only (admins go through /approve-direct), so the
    // role is fixed server-side. Trusting the body here let any retailer send
    // collected_by_role:'admin' and skip the EMI sequence enforcement.
    p_collected_by_role:       'retailer',
    p_bypass_sequence:         false,
  });

  if (rpcErr) {
    console.error('submit_payment_request RPC error:', rpcErr);
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const res = result as { success?: boolean; error?: string; code?: string; request_id?: string };
  if (!res?.success) {
    const status = res?.code === 'DUPLICATE_PENDING' || res?.code === 'ALREADY_APPROVED' || res?.code === 'ALREADY_PENDING'
      ? 409
      : res?.code === 'FORBIDDEN' ? 403
      : res?.code === 'NOT_FOUND' ? 404
      : 400;
    return NextResponse.json({ error: res?.error || 'Failed to create request' }, { status });
  }

  return NextResponse.json({ success: true, request_id: res.request_id });
}
