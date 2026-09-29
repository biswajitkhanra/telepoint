import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCustomerSession } from '@/lib/customerSession';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/customer-app-token/register — the customer app registers (or
 * deactivates on logout) its Expo push token so the server can send real
 * notifications (device lock/unlock, EMI reminders, broadcasts). Authenticated
 * by the signed customer session token; a caller must prove they are the
 * customer whose token they are registering.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const wait = rateLimit(`pushreg:${clientIp(req)}`, 120, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  if (!UUID_RE.test(customerId)) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  // Require proof of login (the signed session token) that covers this customer.
  if (!verifyCustomerSession(body.session_token, customerId)) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: cust } = await svc.from('customers').select('id').eq('id', customerId).single();
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  const action = body.action === 'logout' ? 'logout' : 'register';
  const token = typeof body.push_token === 'string' ? body.push_token.slice(0, 300) : '';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.slice(0, 200) : null;

  if (action === 'logout') {
    if (token) {
      await svc.from('push_tokens').update({ is_active: false, updated_at: new Date().toISOString() }).eq('token', token);
    } else if (deviceId) {
      await svc.from('push_tokens').update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('customer_id', customerId).eq('device_id', deviceId);
    }
    return NextResponse.json({ success: true });
  }

  if (!token || !token.startsWith('ExponentPushToken')) {
    return NextResponse.json({ error: 'Valid push_token required' }, { status: 400 });
  }

  const { error } = await svc.from('push_tokens').upsert({
    customer_id: customerId,
    token,
    device_id: deviceId,
    platform: typeof body.platform === 'string' ? body.platform.slice(0, 20) : 'android',
    app_version: typeof body.app_version === 'string' ? body.app_version.slice(0, 40) : null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'token' });

  if (error) return NextResponse.json({ error: 'Could not register token' }, { status: 500 });
  return NextResponse.json({ success: true });
}
