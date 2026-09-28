import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { staffFromRequest, writeDeviceAudit } from '@/lib/deviceServer';
import { COMMAND_TTL_MS, pendingStatusFor, auditAction } from '@/lib/deviceCommands';
import type { DeviceCommandType } from '@/lib/types';

/**
 * POST /api/device/command — the protected create-device-command authorisation
 * layer (the "edge function" of the spec). A retailer or admin requests a LOCK
 * or UNLOCK. The server, NOT the client, decides if it is allowed:
 *   authenticate caller → verify role → verify the customer belongs to the
 *   retailer → verify a registered device exists → snapshot the amount due →
 *   create the command → write an audit log → return the command id.
 * The retailer app never touches another device directly; it only asks here.
 */
export async function POST(req: NextRequest) {
  const staff = await staffFromRequest(req);
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { userId: staffUserId, role } = staff;

  // Device lock/unlock is an ADMIN-ONLY action. Retailers cannot issue device
  // commands (they may view status, but not lock/unlock).
  if (role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an administrator can lock or unlock a device' }, { status: 403 });
  }

  let body: { customer_id?: unknown; command_type?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = typeof body.customer_id === 'string' ? body.customer_id : '';
  const commandType = body.command_type === 'LOCK' || body.command_type === 'UNLOCK'
    ? (body.command_type as DeviceCommandType) : null;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;
  if (!customerId || !commandType) {
    return NextResponse.json({ error: 'customer_id and a valid command_type are required' }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: customer } = await svc.from('customers')
    .select('id, retailer_id, status').eq('id', customerId).single();
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  // Only super_admin reaches here (checked above), so no per-retailer ownership
  // scoping is needed — an admin may act on any customer.

  // BUSINESS RULE: a device can be locked only while the EMI is still
  // outstanding. Once the loan is fully cleared (COMPLETE = auto-paid,
  // SETTLED = manually settled) locking is refused — the collateral is
  // released. UNLOCK is always permitted (to release a lock). NPA (bad debt)
  // and RUNNING remain lockable.
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

  // Snapshot the amount due for the locked screen (also re-read live on device).
  let emiAmount: number | null = null;
  try {
    const { data: bd } = await svc.rpc('get_due_breakdown', { p_customer_id: customerId });
    const b = (bd ?? {}) as Record<string, unknown>;
    const v = b.total_payable ?? b.next_emi_amount;
    emiAmount = typeof v === 'number' ? v : null;
  } catch { emiAmount = null; }

  // Supersede any still-in-flight command for this device so a new admin
  // click (LOCK or UNLOCK) always takes effect — the newest instruction wins.
  await svc.from('device_commands')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('device_id', device.id).in('status', ['PENDING', 'RECEIVED']);

  const nowMs = Date.now();
  const insert = {
    device_id: device.id,
    customer_id: customerId,
    retailer_id: customer.retailer_id,
    command_type: commandType,
    reason,
    emi_amount: emiAmount,
    status: 'PENDING' as const,
    issued_by: staffUserId,
    issued_by_role: role,
    expires_at: new Date(nowMs + COMMAND_TTL_MS).toISOString(),
  };

  const { data: command, error } = await svc.from('device_commands').insert(insert).select('id, status, expires_at').single();
  if (error) {
    // Unique partial index: an in-flight command already exists for this device.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A command is already in progress for this device' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not create command' }, { status: 500 });
  }

  await svc.from('devices').update({ management_status: pendingStatusFor(commandType), updated_at: new Date().toISOString() }).eq('id', device.id);

  await writeDeviceAudit(svc, {
    actor_user_id: staffUserId,
    actor_role: role,
    action: auditAction(commandType, 'REQUESTED'),
    customer_id: customerId,
    device_id: device.id,
    command_id: command.id,
    metadata: { reason, emi_amount: emiAmount },
  });

  return NextResponse.json({ command_id: command.id, status: command.status, expires_at: command.expires_at });
}
