import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest } from '@/lib/deviceServer';

/**
 * POST /api/device/retailer — staff (retailer/admin) reads the device + recent
 * command history + live amount due for ONE of their customers. Authenticated
 * via cookie or Bearer; ownership is verified server-side (a retailer sees only
 * their own customers).
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { customer_id?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 });

  const svc = createServiceClient();
  const { data: customer } = await svc.from('customers')
    .select('id, retailer_id, customer_name, customer_code, mobile, model_no, customer_photo_url, status').eq('id', customerId).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  if (staff.role === 'retailer') {
    const { data: retailer } = await svc.from('retailers').select('id').eq('auth_user_id', staff.userId).single();
    if (!retailer || customer.retailer_id !== retailer.id) {
      return NextResponse.json({ error: 'Customer does not belong to your account' }, { status: 403 });
    }
  }

  const { data: device } = await svc.from('devices')
    .select('id, management_status, admin_enabled, management_mode, policies, last_location, sim_info, consent_granted_at, registered_at, last_seen_at, device_model, device_manufacturer, android_version')
    .eq('customer_id', customerId).order('registered_at', { ascending: false }).limit(1).maybeSingle();

  const { data: commands } = await svc.from('device_commands')
    .select('id, command_type, reason, status, emi_amount, voice, language, created_at, received_at, executed_at, expires_at, failure_reason')
    .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20);

  let breakdown: unknown = null;
  try { const { data } = await svc.rpc('get_due_breakdown', { p_customer_id: customerId }); breakdown = data; } catch { breakdown = null; }

  const { data: rs } = await svc.from('reminder_settings')
    .select('reminder_enabled, overdue_reminder_enabled, voice_enabled, voice_language, voice_on_overdue, schedule_version')
    .eq('customer_id', customerId).maybeSingle();

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.customer_name,
      code: customer.customer_code ?? null,
      mobile: customer.mobile,
      model: customer.model_no,
      photo_url: customer.customer_photo_url ?? null,
      status: customer.status ?? null,
    },
    device: device ?? null,
    commands: commands ?? [],
    breakdown,
    reminder_settings: rs ?? {
      reminder_enabled: true,
      overdue_reminder_enabled: true,
      voice_enabled: true,
      voice_language: 'bn',
      voice_on_overdue: false,
      schedule_version: 1,
    },
  });
}
