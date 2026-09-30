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
  // Live advanced-policy snapshot the device reports (migration 034). Only a
  // small, known set of boolean keys is stored — nothing free-form from client.
  if (body.policies && typeof body.policies === 'object' && !Array.isArray(body.policies)) {
    const p = body.policies as Record<string, unknown>;
    const bool = (v: unknown) => v === true;
    patch.policies = {
      mode: typeof p.mode === 'string' ? p.mode : undefined,
      camera: bool(p.camera),
      bluetooth: bool(p.bluetooth),
      wifi: bool(p.wifi),
      usb: bool(p.usb),
      airplane: bool(p.airplane),
      outgoingCalls: bool(p.outgoingCalls),
      wallpaper: bool(p.wallpaper),
    };
  }
  // Location snapshot (only when the device reports a valid fix).
  if (body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
    const l = body.location as Record<string, unknown>;
    if (typeof l.lat === 'number' && typeof l.lng === 'number') {
      patch.last_location = {
        lat: l.lat,
        lng: l.lng,
        accuracy: typeof l.accuracy === 'number' ? l.accuracy : undefined,
        provider: typeof l.provider === 'string' ? l.provider : undefined,
        at: new Date().toISOString(),
      };
    }
  }
  // SIM info snapshot (bounded to a few known fields).
  if (body.sim_info && typeof body.sim_info === 'object' && !Array.isArray(body.sim_info)) {
    const s = body.sim_info as Record<string, unknown>;
    const rawSims = Array.isArray(s.sims) ? (s.sims as Record<string, unknown>[]) : [];
    patch.sim_info = {
      count: typeof s.count === 'number' ? s.count : rawSims.length,
      at: new Date().toISOString(),
      sims: rawSims.slice(0, 4).map((x) => ({
        slot: typeof x.slot === 'number' ? x.slot : undefined,
        carrier: typeof x.carrier === 'string' ? x.carrier.slice(0, 60) : undefined,
        display: typeof x.display === 'string' ? x.display.slice(0, 60) : undefined,
        number: typeof x.number === 'string' ? x.number.slice(0, 24) : undefined,
      })),
    };
  }

  const { data: device } = await svc.from('devices')
    .update(patch).eq('customer_id', customerId).eq('installation_id', installationId)
    .select('id, management_status, admin_enabled').maybeSingle();

  return NextResponse.json({ ok: !!device, device: device ?? null });
}
