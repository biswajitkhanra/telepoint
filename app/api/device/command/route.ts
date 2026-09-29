import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest, writeDeviceAudit } from '@/lib/deviceServer';
import { pushToCustomer } from '@/lib/push';
import { COMMAND_TTL_MS, pendingStatusFor, auditAction } from '@/lib/deviceCommands';
import type { DeviceCommandType } from '@/lib/types';

/**
 * POST /api/device/command — the protected create-device-command authorisation
 * layer. A retailer or admin requests a LOCK, an UNLOCK, or a manual
 * EMI_REMINDER. The server, NOT the client, decides if it is allowed:
 *   authenticate caller → verify role → verify the customer belongs to the
 *   retailer → verify a registered device exists → (lock only) snapshot the
 *   amount due → create the command → write an audit log → return the command id.
 *
 * Authorisation model:
 *   LOCK / UNLOCK  — ADMIN ONLY (device lock is a serious action).
 *   EMI_REMINDER   — admin OR the OWNING retailer (a reminder is benign; it just
 *                    shows the customer their due EMI, optionally spoken).
 */
const REMINDER_TTL_MS = 24 * 60 * 60 * 1000; // a manual reminder is only relevant for a day

export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId: staffUserId, role } = staff;

  let body: { customer_id?: unknown; command_type?: unknown; reason?: unknown; voice?: unknown; language?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  const commandType =
    body.command_type === 'LOCK' || body.command_type === 'UNLOCK' || body.command_type === 'EMI_REMINDER'
      ? (body.command_type as DeviceCommandType)
      : null;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;
  if (!customerId || !commandType) {
    return NextResponse.json({ error: 'customer_id and a valid command_type are required' }, { status: 400 });
  }

  const isReminder = commandType === 'EMI_REMINDER';

  // LOCK/UNLOCK are admin-only. EMI_REMINDER is allowed for admin or the owning
  // retailer.
  if (!isReminder && role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an administrator can lock or unlock a device' }, { status: 403 });
  }

  // Reminder options (validated).
  const voice = isReminder ? body.voice === true : null;
  const language = isReminder
    ? (body.language === 'hi' ? 'hi' : 'bn')
    : null;

  const svc = createServiceClient();

  const { data: customer } = await svc.from('customers')
    .select('id, retailer_id, status').eq('id', customerId).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  // Retailer scoping for the reminder path (admins may act on any customer).
  if (role === 'retailer') {
    const { data: retailer } = await svc.from('retailers').select('id').eq('auth_user_id', staffUserId).single();
    if (!retailer || customer.retailer_id !== retailer.id) {
      return NextResponse.json({ error: 'Customer does not belong to your account' }, { status: 403 });
    }
  }

  // BUSINESS RULE (lock only): a device can be locked only while the EMI is
  // outstanding. UNLOCK is always allowed; a reminder is always allowed.
  if (commandType === 'LOCK' && (customer.status === 'COMPLETE' || customer.status === 'SETTLED')) {
    return NextResponse.json({ error: 'EMI is fully cleared for this customer; the device cannot be locked' }, { status: 409 });
  }

  // A registered, consented device must exist.
  const { data: device } = await svc.from('devices')
    .select('id, customer_id, retailer_id, management_status, admin_enabled')
    .eq('customer_id', customerId)
    .order('registered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!device) return NextResponse.json({ error: 'No registered device for this customer' }, { status: 400 });

  // Snapshot the amount due (locked screen / reminder display).
  let emiAmount: number | null = null;
  try {
    const { data: bd } = await svc.rpc('get_due_breakdown', { p_customer_id: customerId });
    const b = (bd ?? {}) as Record<string, unknown>;
    const v = b.total_payable ?? b.next_emi_amount;
    emiAmount = typeof v === 'number' ? v : null;
  } catch { emiAmount = null; }

  // Supersede any still-in-flight command OF THE SAME KIND so a new instruction
  // always wins. Lock/unlock share a lifecycle (newest lock-state wins);
  // reminders are independent and only supersede prior pending reminders.
  const supersedeTypes = isReminder ? ['EMI_REMINDER'] : ['LOCK', 'UNLOCK'];
  await svc.from('device_commands')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('device_id', device.id).in('status', ['PENDING', 'RECEIVED']).in('command_type', supersedeTypes);

  const nowMs = Date.now();
  const insert = {
    device_id: device.id,
    customer_id: customerId,
    retailer_id: customer.retailer_id,
    command_type: commandType,
    reason,
    emi_amount: emiAmount,
    voice,
    language,
    status: 'PENDING' as const,
    issued_by: staffUserId,
    issued_by_role: role,
    expires_at: new Date(nowMs + (isReminder ? REMINDER_TTL_MS : COMMAND_TTL_MS)).toISOString(),
  };

  const { data: command, error } = await svc.from('device_commands').insert(insert).select('id, status, expires_at').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A command is already in progress for this device' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not create command' }, { status: 500 });
  }

  // Lock-state side effects apply ONLY to LOCK/UNLOCK — a reminder never changes
  // the device's management status or the is_locked pill.
  if (!isReminder) {
    await svc.from('devices').update({ management_status: pendingStatusFor(commandType), updated_at: new Date().toISOString() }).eq('id', device.id);
    await svc.from('customers')
      .update({ is_locked: commandType === 'LOCK', lock_provider: 'TelePoint Device' })
      .eq('id', customerId)
      .then(() => {}, () => {});
  }

  await writeDeviceAudit(svc, {
    actor_user_id: staffUserId,
    actor_role: role,
    action: isReminder ? 'EMI_REMINDER_SENT' : auditAction(commandType, 'REQUESTED'),
    customer_id: customerId,
    device_id: device.id,
    command_id: command.id,
    metadata: { reason, emi_amount: emiAmount, voice, language },
  });

  // Wake the customer's app with a real push so the command is applied promptly.
  await pushToCustomer(svc, customerId, {
    title: 'TelePoint',
    body: isReminder
      ? 'You have an EMI payment reminder.'
      : commandType === 'LOCK'
        ? 'Your device has been locked for an overdue EMI. Please pay your dues to unlock.'
        : 'Your device has been unlocked.',
    data: { type: 'device_command', command_type: commandType },
  });

  return NextResponse.json({ command_id: command.id, status: command.status, expires_at: command.expires_at });
}
