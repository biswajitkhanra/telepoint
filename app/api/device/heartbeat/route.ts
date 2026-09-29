import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { customerFromSession } from '@/lib/deviceServer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/device/heartbeat — lightweight health ping from the customer app.
 * Updates last_seen_at, app/OS version and whether device-admin is still
 * granted. Server-authoritative fields (management_status, ownership) are NOT
 * taken from the client here. Meant to be called sparingly (on foreground /
 * periodic background fetch), never in a tight loop.
 */
export async function POST(req: NextRequest) {
  const wait = rateLimit(`devbeat:${clientIp(req)}`, 120, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = customerFromSession(body);
  if (!customerId) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  const installationId = typeof body.installation_id === 'string' ? body.installation_id.trim() : '';
  if (!installationId) return NextResponse.json({ error: 'installation_id required' }, { status: 400 });

  const svc = createServiceClient();
  const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (typeof body.app_version === 'string') patch.app_version = body.app_version.slice(0, 40);
  if (typeof body.android_version === 'string') patch.android_version = body.android_version.slice(0, 40);
  if (typeof body.admin_enabled === 'boolean') patch.admin_enabled = body.admin_enabled;
  const ALLOWED_MODES = ['UNMANAGED', 'DEVICE_ADMIN', 'PROFILE_OWNER', 'DEVICE_OWNER', 'UNSUPPORTED'];
  if (typeof body.management_mode === 'string' && ALLOWED_MODES.includes(body.management_mode)) {
    patch.management_mode = body.management_mode;
  }

  const { data: device } = await svc.from('devices')
    .update(patch).eq('customer_id', customerId).eq('installation_id', installationId)
    .select('id, management_status, admin_enabled').maybeSingle();

  return NextResponse.json({ ok: !!device, device: device ?? null });
}
