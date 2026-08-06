import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST: Generate persistent token for customer app auto-login
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin' && profile?.role !== 'retailer')
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { customer_id } = await req.json();
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: customer } = await svc.from('customers').select('id, customer_name, mobile, retailer_id').eq('id', customer_id).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  // SECURITY: Retailers can only generate tokens for their OWN customers
  if (profile?.role === 'retailer') {
    const { data: retailer } = await svc
      .from('retailers').select('id').eq('auth_user_id', user.id).single();
    if (!retailer || customer.retailer_id !== retailer.id) {
      return NextResponse.json({ error: 'Customer not in your portfolio' }, { status: 403 });
    }
  }


  // Generate unique token
  const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);

  // Upsert — one active token per customer
  const { data: existing } = await svc.from('customer_app_tokens').select('id').eq('customer_id', customer_id).maybeSingle();
  if (existing) {
    await svc.from('customer_app_tokens').update({ token, updated_at: new Date().toISOString() }).eq('customer_id', customer_id);
  } else {
    await svc.from('customer_app_tokens').insert({ customer_id, token, created_by: user.id });
  }

  return NextResponse.json({ token, customer_name: customer.customer_name, mobile: customer.mobile });
}

// GET: Validate token and return full customer data (auto-login)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: tokenRow } = await svc.from('customer_app_tokens')
    .select('customer_id, is_active').eq('token', token).maybeSingle();

  if (!tokenRow || !tokenRow.is_active)
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  // Track access
  await svc.from('customer_app_tokens').update({
    last_accessed_at: new Date().toISOString(),
  }).eq('token', token);

  // Load full customer data. `customer_code` (migration 025) is requested
  // first; if the column is not deployed yet, retry without it.
  const APP_COLS = `
    id, retailer_id, customer_name, father_name, aadhaar, mobile,
    alternate_number_1, alternate_number_2,
    model_no, imei, purchase_value, down_payment, disburse_amount,
    purchase_date, emi_due_day, emi_amount, emi_tenure,
    first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at,
    customer_photo_url, status, is_locked, lock_provider,
    retailer:retailers(name, mobile)
  `;
  type CustRow = Record<string, unknown> & { id: string; retailer_id: string };
  const first = await svc.from('customers')
    .select(APP_COLS.replace('customer_photo_url', 'customer_code, customer_photo_url'))
    .eq('id', tokenRow.customer_id).single();
  let customer = first.data as unknown as CustRow | null;
  if (first.error?.message && /customer_code/.test(first.error.message)) {
    const retry = await svc.from('customers').select(APP_COLS).eq('id', tokenRow.customer_id).single();
    customer = retry.data as unknown as CustRow | null;
  }

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const { data: emis } = await svc.from('emi_schedule')
    .select('id, emi_no, due_date, amount, status, paid_at, mode, utr, partial_paid_amount, partial_paid_at, fine_amount, fine_waived, fine_paid_amount, fine_paid_at, collection_requested_at')
    .eq('customer_id', customer.id).order('emi_no');

  let breakdown = null;
  try {
    const { data: bd } = await svc.rpc('get_due_breakdown', { p_customer_id: customer.id });
    breakdown = bd;
  } catch { breakdown = null; }

  const { data: broadcasts } = await svc.from('broadcast_messages')
    .select('id, message, image_url, expires_at, sender_name, sender_role')
    .eq('target_retailer_id', customer.retailer_id)
    .or(`target_customer_id.is.null,target_customer_id.eq.${customer.id}`)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return NextResponse.json({
    customer, emis: emis || [], breakdown: breakdown || null, broadcasts: broadcasts || [],
  });
}
