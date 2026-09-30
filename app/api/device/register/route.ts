import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { customerFromSession, isUuid, writeDeviceAudit } from '@/lib/deviceServer';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { generateSecretBase32 } from '@/lib/totp';

/**
 * POST /api/device/register — the customer app registers (or refreshes) its
 * install for device management. Authenticated by the signed customer session
 * token; the owning retailer is resolved SERVER-SIDE from the customer, never
 * trusted from the client. A customer can only register their OWN loan's
 * device, and an installation_id already bound to a different customer is
 * refused (you cannot register somebody else's device).
 */
export async function POST(req: NextRequest) {
  const wait = rateLimit(`devreg:${clientIp(req)}`, 60, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = customerFromSession(body);
  if (!customerId) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });

  const installationId = typeof body.installation_id === 'string' ? body.installation_id.trim() : '';
  if (installationId.length < 8 || installationId.length > 128) {
    return NextResponse.json({ error: 'Invalid installation identifier' }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: customer } = await svc.from('customers').select('id, retailer_id').eq('id', customerId).single();
  if (!customer || !isUuid(customer.retailer_id)) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // An installation_id is globally unique. If it already belongs to another
  // customer, refuse — this stops a device being re-pointed at a stranger's loan.
  const { data: clash } = await svc.from('devices').select('id, customer_id').eq('installation_id', installationId).maybeSingle();
  if (clash && clash.customer_id !== customerId) {
    return NextResponse.json({ error: 'This device is registered to another account' }, { status: 409 });
  }

  const consent = body.consent === true;
  const adminEnabled = body.admin_enabled === true;
  const ALLOWED_MODES = ['UNMANAGED', 'DEVICE_ADMIN', 'PROFILE_OWNER', 'DEVICE_OWNER', 'UNSUPPORTED'];
  const managementMode = typeof body.management_mode === 'string' && ALLOWED_MODES.includes(body.management_mode)
    ? body.management_mode : undefined;
  const nowIso = new Date().toISOString();

  const patch = {
    customer_id: customerId,
    retailer_id: customer.retailer_id,
    installation_id: installationId,
    device_model: typeof body.device_model === 'string' ? body.device_model.slice(0, 120) : null,
    device_manufacturer: typeof body.device_manufacturer === 'string' ? body.device_manufacturer.slice(0, 120) : null,
    android_version: typeof body.android_version === 'string' ? body.android_version.slice(0, 40) : null,
    app_version: typeof body.app_version === 'string' ? body.app_version.slice(0, 40) : null,
    admin_enabled: adminEnabled,
    last_seen_at: nowIso,
    updated_at: nowIso,
    ...(managementMode ? { management_mode: managementMode } : {}),
    ...(consent ? { consent_granted_at: nowIso } : {}),
  };

  const { data: device, error } = await svc
    .from('devices')
    .upsert(patch, { onConflict: 'customer_id,installation_id' })
    .select('id, customer_id, retailer_id, installation_id, device_model, device_manufacturer, android_version, app_version, management_status, admin_enabled, consent_granted_at, last_seen_at, registered_at, totp_secret')
    .single();

  if (error || !device) {
    return NextResponse.json({ error: 'Could not register device' }, { status: 500 });
  }

  // Ensure a TOTP offline-unlock secret exists for this device, then hand it to
  // the app so it can verify unlock codes with no internet.
  let totpSecret: string | null = (device as { totp_secret?: string | null }).totp_secret ?? null;
  if (!totpSecret) {
    totpSecret = generateSecretBase32();
    await svc.from('devices').update({ totp_secret: totpSecret }).eq('id', device.id);
  }

  await writeDeviceAudit(svc, { action: 'DEVICE_REGISTERED', customer_id: customerId, device_id: device.id, metadata: { model: patch.device_model, consent } });
  if (adminEnabled) {
    await writeDeviceAudit(svc, { action: 'DEVICE_ADMIN_ENABLED', customer_id: customerId, device_id: device.id });
  }

  const { totp_secret, ...deviceOut } = device as Record<string, unknown>;
  void totp_secret;
  return NextResponse.json({ device: deviceOut, totp_secret: totpSecret });
}
