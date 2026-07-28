import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { validatePaymentDate, paymentDateToISO, todayIST } from '@/lib/ist';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    customer_id, emi_ids, emi_nos, mode, utr, notes, retail_pin,
    total_emi_amount, scheduled_emi_amount, fine_amount,
    fine_breakdown,
    first_emi_charge_amount, total_amount,
    fine_for_emi_no, fine_due_date, collected_by_role, collect_type,
    payment_date,
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
  if (retailer.retail_pin !== retail_pin)
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });

  // ── OWNERSHIP CHECK: customer must belong to this retailer ────────────────
  const { data: custOwner } = await svc
    .from('customers')
    .select('id, retailer_id')
    .eq('id', customer_id)
    .single();
  if (!custOwner || custOwner.retailer_id !== retailer.id)
    return NextResponse.json({ error: 'Customer does not belong to your account' }, { status: 403 });

  // ── SEQUENCE ENFORCEMENT: retailers must pay EMIs in order ────────────────
  // Super admin (collected_by_role === 'admin') bypasses this check.
  if (!noEmi && emi_nos?.length && collected_by_role !== 'admin') {
    const { data: allUnpaid } = await svc
      .from('emi_schedule')
      .select('emi_no')
      .eq('customer_id', customer_id)
      .in('status', ['UNPAID', 'PARTIALLY_PAID'])
      .order('emi_no', { ascending: true })
      .limit(1);

    const lowestUnpaidEmiNo: number | undefined = allUnpaid?.[0]?.emi_no;

    if (lowestUnpaidEmiNo !== undefined) {
      const submittedMin = Math.min(...(emi_nos as number[]));
      if (submittedMin > lowestUnpaidEmiNo) {
        return NextResponse.json(
          {
            error: `EMI sequence violation. EMI #${lowestUnpaidEmiNo} must be paid first before collecting EMI #${submittedMin}.`,
          },
          { status: 400 }
        );
      }
    }
  }

  // ── DUPLICATE / ALREADY-PAID CHECK ────────────────────────────────────────
  if (!noEmi && emi_ids?.length) {
    const { data: ch } = await svc
      .from('emi_schedule')
      .select('id, status, emi_no')
      .in('id', emi_ids)
      .eq('customer_id', customer_id);

    for (const e of ch || []) {
      if (e.status === 'APPROVED')
        return NextResponse.json({ error: `EMI #${e.emi_no} is already fully paid` }, { status: 409 });
      if (e.status === 'PENDING_APPROVAL')
        return NextResponse.json({ error: `EMI #${e.emi_no} already has a pending request` }, { status: 409 });
    }
  }

  // Resolve and validate the payment date
  const resolvedPaymentDate = payment_date || todayIST();
  const dateErr = validatePaymentDate(resolvedPaymentDate);
  if (dateErr) return NextResponse.json({ error: dateErr }, { status: 400 });

  // ── CREATE PAYMENT REQUEST ─────────────────────────────────────────────────
  const { data: request, error: re } = await svc
    .from('payment_requests')
    .insert({
      customer_id,
      retailer_id:             retailer.id,
      submitted_by:            user.id,
      status:                  'PENDING',
      mode,
      utr:                     utr || null,
      total_emi_amount:        total_emi_amount || 0,
      scheduled_emi_amount:    scheduled_emi_amount || 0,
      fine_amount:             fine_amount || 0,
      first_emi_charge_amount: first_emi_charge_amount || 0,
      total_amount:            total_amount || 0,
      notes:                   [notes, utr ? 'UTR: ' + utr : ''].filter(Boolean).join(' | ') || null,
      selected_emi_nos:        emi_nos || [],
      fine_for_emi_no:         fine_for_emi_no || null,
      fine_due_date:           fine_due_date || null,
      fine_breakdown:          Array.isArray(fine_breakdown) ? fine_breakdown : null,
      collected_by_role:       collected_by_role || 'retailer',
      collected_by_user_id:    user.id,
      payment_date:            resolvedPaymentDate,
    })
    .select()
    .single();

  if (re || !request)
    return NextResponse.json({ error: re?.message || 'Failed to create request' }, { status: 500 });

  // ── CREATE LINE ITEMS + MARK EMIs PENDING ─────────────────────────────────
  if (!noEmi && emi_ids?.length) {
    const eachAmount = Number(total_emi_amount || 0) / Math.max(emi_ids.length, 1);
    const items = emi_ids.map((eid: string, i: number) => ({
      payment_request_id: request.id,
      emi_schedule_id:    eid,
      emi_no:             emi_nos[i],
      amount:             eachAmount,
    }));

    const { error: ie } = await svc.from('payment_request_items').insert(items);
    if (ie) {
      // Roll back the request on item insert failure
      await svc.from('payment_requests').delete().eq('id', request.id);
      return NextResponse.json({ error: 'Failed to record payment items' }, { status: 500 });
    }

    // Stamp the ORIGINAL collection date on each EMI (only if not already set).
    // Fine eligibility is decided by THIS date vs the due date — never by the
    // admin approval date. Set BEFORE the rows go PENDING_APPROVAL so the
    // recalc below can still see (and lock in) any late fine.
    // Use the payment_date (IST midnight) instead of server clock time.
    const collectedAt = paymentDateToISO(resolvedPaymentDate);
    await svc.from('emi_schedule')
      .update({ collection_requested_at: collectedAt })
      .in('id', emi_ids)
      .is('collection_requested_at', null);

    // Persist any late fine now so it survives approval. recalc honours the
    // collection-date gate: on-time collections accrue nothing, late ones lock
    // in their fine. PENDING_APPROVAL rows are frozen, so we recalc first.
    await svc.rpc('recalc_customer_fines', { p_customer_id: customer_id }).then(() => null, () => null);

    await svc.from('emi_schedule').update({ status: 'PENDING_APPROVAL' }).in('id', emi_ids);
  }

  return NextResponse.json({ success: true, request_id: request.id });
}
