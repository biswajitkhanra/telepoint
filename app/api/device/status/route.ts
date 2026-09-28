import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { customerFromSession } from '@/lib/deviceServer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/device/status — read-only device + locked-screen state for the
 * customer app. Returns the device row, the live amount due and the retailer's
 * name/phone (from the loan's assigned retailer — never hard-coded). Does not
 * mutate command state (use /api/device/commands to receive work).
 */
export async function POST(req: NextRequest) {
  const wait = rateLimit(`devstat:${clientIp(req)}`, 240, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = customerFromSession(body);
  if (!customerId) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  const installationId = typeof body.installation_id === 'string' ? body.installation_id.trim() : '';

  const svc = createServiceClient();
  const base = svc
    .from('devices')
    .select('id, management_status, admin_enabled, consent_granted_at, registered_at, device_model, device_manufacturer, last_seen_at')
    .eq('customer_id', customerId);
  const { data: device } = installationId
    ? await base.eq('installation_id', installationId).maybeSingle()
    : await base.order('registered_at', { ascending: false }).limit(1).maybeSingle();

  const { data: customer } = await svc
    .from('customers')
    .select('customer_name, retailer:retailers(name, mobile)')
    .eq('id', customerId)
    .single();

  let breakdown: unknown = null;
  try {
    const { data } = await svc.rpc('get_due_breakdown', { p_customer_id: customerId });
    breakdown = data;
  } catch {
    breakdown = null;
  }

  const c = (customer as Record<string, unknown> | null) ?? null;
  return NextResponse.json({
    device: device ?? null,
    retailer: c?.retailer ?? null,
    customer_name: c?.customer_name ?? null,
    breakdown,
  });
}
