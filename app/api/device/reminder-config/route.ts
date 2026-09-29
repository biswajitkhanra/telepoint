import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest, writeDeviceAudit } from '@/lib/deviceServer';

/**
 * POST /api/device/reminder-config — staff (admin or the OWNING retailer) reads
 * or updates a customer's reminder configuration (voice on/off, language,
 * overdue-reminder toggle). The customer app pulls this via /api/device/commands
 * and caches it for the OFFLINE reminder engine; changing it bumps
 * schedule_version (DB trigger) so the device knows to reschedule.
 *
 * Send only the fields you want to change. Omit them all to just READ the
 * current settings.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
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

  // Current row (or defaults).
  const { data: existing } = await svc.from('reminder_settings')
    .select('reminder_enabled, overdue_reminder_enabled, voice_enabled, voice_language, voice_on_overdue, schedule_version')
    .eq('customer_id', customerId).maybeSingle();

  const current = existing ?? {
    reminder_enabled: true,
    overdue_reminder_enabled: true,
    voice_enabled: true,
    voice_language: 'bn',
    voice_on_overdue: false,
    schedule_version: 1,
  };

  // Only the provided, validated fields are changed.
  const asBool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const merged = {
    reminder_enabled: asBool(body.reminder_enabled, current.reminder_enabled),
    overdue_reminder_enabled: asBool(body.overdue_reminder_enabled, current.overdue_reminder_enabled),
    voice_enabled: asBool(body.voice_enabled, current.voice_enabled),
    voice_language: body.voice_language === 'hi' ? 'hi' : body.voice_language === 'bn' ? 'bn' : current.voice_language,
    voice_on_overdue: asBool(body.voice_on_overdue, current.voice_on_overdue),
  };

  const changed = Object.keys(merged).some((k) => (merged as Record<string, unknown>)[k] !== (current as Record<string, unknown>)[k]);

  if (changed || !existing) {
    const { error } = await svc.from('reminder_settings')
      .upsert({ customer_id: customerId, updated_by: staff.userId, ...merged }, { onConflict: 'customer_id' });
    if (error) return NextResponse.json({ error: 'Could not save reminder settings' }, { status: 500 });

    if (changed) {
      await writeDeviceAudit(svc, {
        actor_user_id: staff.userId,
        actor_role: staff.role,
        action: 'REMINDER_CONFIG_CHANGED',
        customer_id: customerId,
        metadata: { ...merged },
      });
    }
  }

  const { data: fresh } = await svc.from('reminder_settings')
    .select('reminder_enabled, overdue_reminder_enabled, voice_enabled, voice_language, voice_on_overdue, schedule_version')
    .eq('customer_id', customerId).maybeSingle();

  return NextResponse.json({ reminder_settings: fresh ?? { ...merged, schedule_version: current.schedule_version } });
}
