import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { customerFromSession, writeDeviceAudit } from '@/lib/deviceServer';
import { auditAction } from '@/lib/deviceCommands';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/device/commands — the customer app polls for authorised commands
 * addressed to its registered install. Authenticated by the customer session
 * token. Returns only ACTIVE commands for THIS device, expires stale ones,
 * marks delivered ones RECEIVED, and includes the live amount due + retailer
 * contact for the locked screen (never hard-coded).
 */
export async function POST(req: NextRequest) {
  const wait = rateLimit(`devpoll:${clientIp(req)}`, 240, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = customerFromSession(body);
  if (!customerId) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  const installationId = typeof body.installation_id === 'string' ? body.installation_id.trim() : '';
  if (!installationId) return NextResponse.json({ error: 'installation_id required' }, { status: 400 });

  const svc = createServiceClient();

  const { data: device } = await svc.from('devices')
    .select('id, customer_id, retailer_id, installation_id, management_status')
    .eq('customer_id', customerId).eq('installation_id', installationId).maybeSingle();
  if (!device) return NextResponse.json({ commands: [], device: null });

  const nowIso = new Date().toISOString();

  // Expire anything past its window before handing work to the device.
  await svc.from('device_commands').update({ status: 'EXPIRED', updated_at: nowIso })
    .eq('device_id', device.id).in('status', ['PENDING', 'RECEIVED']).lte('expires_at', nowIso);

  const { data: active } = await svc.from('device_commands')
    .select('id, device_id, customer_id, retailer_id, command_type, reason, emi_amount, voice, language, payload, status, expires_at, created_at')
    .eq('device_id', device.id).in('status', ['PENDING', 'RECEIVED']).gt('expires_at', nowIso)
    .order('created_at', { ascending: true });

  const commands = active ?? [];

  // Acknowledge delivery: PENDING → RECEIVED, and audit once per command.
  const pending = commands.filter(c => c.status === 'PENDING');
  if (pending.length) {
    await svc.from('device_commands').update({ status: 'RECEIVED', received_at: nowIso, updated_at: nowIso })
      .in('id', pending.map(c => c.id));
    for (const c of pending) {
      await writeDeviceAudit(svc, { action: auditAction(c.command_type, 'RECEIVED'), customer_id: customerId, device_id: device.id, command_id: c.id });
      c.status = 'RECEIVED';
    }
  }

  // Live amount due + retailer contact + photo for the locked screen / reminders.
  const { data: customer } = await svc.from('customers')
    .select('id, status, customer_name, customer_photo_url, retailer:retailers(name, mobile)').eq('id', customerId).single();
  let breakdown: unknown = null;
  try { const { data } = await svc.rpc('get_due_breakdown', { p_customer_id: customerId }); breakdown = data; } catch { breakdown = null; }

  // Reminder configuration the app caches locally for its OFFLINE engine
  // (migration 032). Defaults reproduce today's behaviour if no row exists yet.
  const { data: rs } = await svc.from('reminder_settings')
    .select('reminder_enabled, overdue_reminder_enabled, voice_enabled, voice_language, voice_on_overdue, schedule_version')
    .eq('customer_id', customerId).maybeSingle();
  const reminder_settings = rs ?? {
    reminder_enabled: true,
    overdue_reminder_enabled: true,
    voice_enabled: true,
    voice_language: 'bn',
    voice_on_overdue: false,
    schedule_version: 1,
  };

  return NextResponse.json({
    commands,
    loan_status: customer?.status ?? null,
    device: { id: device.id, management_status: device.management_status },
    retailer: (customer as Record<string, unknown> | null)?.retailer ?? null,
    customer_name: (customer as Record<string, unknown> | null)?.customer_name ?? null,
    customer_photo_url: (customer as Record<string, unknown> | null)?.customer_photo_url ?? null,
    breakdown,
    reminder_settings,
  });
}
