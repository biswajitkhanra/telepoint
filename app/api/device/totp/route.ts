import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest } from '@/lib/deviceServer';
import { totpNow } from '@/lib/totp';

/**
 * POST /api/device/totp — the current offline-unlock code for a customer's
 * device, for the admin (or owning retailer) to read to the customer over the
 * phone. The device verifies the same code locally with no internet. Auth +
 * ownership enforced server-side.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { customer_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: customer } = await svc.from('customers').select('id, retailer_id').eq('id', customerId).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (staff.role === 'retailer') {
    const { data: retailer } = await svc.from('retailers').select('id').eq('auth_user_id', staff.userId).single();
    if (!retailer || customer.retailer_id !== retailer.id) {
      return NextResponse.json({ error: 'Customer does not belong to your account' }, { status: 403 });
    }
  }

  const { data: device } = await svc.from('devices')
    .select('id, totp_secret').eq('customer_id', customerId)
    .order('registered_at', { ascending: false }).limit(1).maybeSingle();
  if (!device?.totp_secret) {
    return NextResponse.json({ error: 'No offline-unlock secret for this device yet (the app must register once).' }, { status: 400 });
  }

  const { code, expiresIn } = totpNow(device.totp_secret);
  return NextResponse.json({ code, expiresIn });
}
