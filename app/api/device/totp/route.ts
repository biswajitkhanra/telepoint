import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest, writeDeviceAudit } from '@/lib/deviceServer';
import { totpNow } from '@/lib/totp';

/**
 * POST /api/device/totp — the current offline-unlock code for a customer's
 * device. ADMIN ONLY: the code unlocks a financed phone with no internet, so
 * only a super admin may reveal it (matches the admin-only panel button), and
 * every reveal is audited. The device verifies the same code locally with no
 * internet.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (staff.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an administrator can reveal the offline unlock code' }, { status: 403 });
  }

  let body: { customer_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: customer } = await svc.from('customers').select('id, retailer_id').eq('id', customerId).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const { data: device } = await svc.from('devices')
    .select('id, totp_secret').eq('customer_id', customerId)
    .order('registered_at', { ascending: false }).limit(1).maybeSingle();
  if (!device?.totp_secret) {
    return NextResponse.json({ error: 'No offline-unlock secret for this device yet (the app must register once).' }, { status: 400 });
  }

  await writeDeviceAudit(svc, {
    actor_user_id: staff.userId,
    actor_role: staff.role,
    action: 'TOTP_CODE_REVEALED',
    customer_id: customerId,
    device_id: device.id,
  });

  const { code, expiresIn } = totpNow(device.totp_secret);
  return NextResponse.json({ code, expiresIn });
}
