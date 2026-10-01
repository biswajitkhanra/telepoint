import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { customerFromSession, writeDeviceAudit } from '@/lib/deviceServer';
import { checkExecutable, executedStatusFor, isTerminal, auditAction } from '@/lib/deviceCommands';
import { clientIp, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/device/command/ack — the customer device reports the RESULT of an
 * authorised command after the native module actually ran. Authenticated by the
 * customer session token. This is where the backend distinguishes "requested"
 * from "confirmed": device.management_status only becomes LOCKED here, on the
 * device's word — never merely because the retailer clicked a button.
 *
 * Idempotent: a command already in a terminal state is returned unchanged, so
 * the same result can never be applied twice.
 */
export async function POST(req: NextRequest) {
  const wait = rateLimit(`devack:${clientIp(req)}`, 120, 10 * 60_000);
  if (wait) return NextResponse.json({ error: 'Too many attempts' }, { status: 429, headers: { 'Retry-After': String(wait) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const customerId = customerFromSession(body);
  if (!customerId) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const installationId = typeof body.installation_id === 'string' ? body.installation_id.trim() : '';
  const commandId = typeof body.command_id === 'string' ? body.command_id : '';
  const result = body.result === 'EXECUTED' || body.result === 'FAILED' || body.result === 'SUPERSEDED' ? body.result : null;
  const failureReason = typeof body.failure_reason === 'string' ? body.failure_reason.slice(0, 300) : null;
  if (!installationId || !commandId || !result) {
    return NextResponse.json({ error: 'installation_id, command_id and result are required' }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: device } = await svc.from('devices')
    .select('id, customer_id, installation_id').eq('customer_id', customerId).eq('installation_id', installationId).maybeSingle();

  const { data: cmd } = await svc.from('device_commands')
    .select('id, device_id, customer_id, command_type, status, expires_at, created_at').eq('id', commandId).maybeSingle();
  if (!cmd) return NextResponse.json({ error: 'Command not found' }, { status: 404 });

  // Full ownership / device / expiry gate FIRST — even the idempotent branch
  // must not leak another customer's command lifecycle.
  const gate = checkExecutable(cmd, { authenticatedCustomerId: customerId, installationId, device });
  if (isTerminal(cmd.status)) {
    if (gate.reason === 'customer_mismatch' || gate.reason === 'device_mismatch' || gate.reason === 'loan_mismatch' || gate.reason === 'installation_mismatch' || !gate.ok) {
      return NextResponse.json({ error: 'Command not acceptable', reason: gate.reason }, { status: 409 });
    }
    return NextResponse.json({ status: cmd.status, idempotent: true });
  }
  if (!gate.ok) return NextResponse.json({ error: 'Command not acceptable', reason: gate.reason }, { status: 409 });

  const nowIso = new Date().toISOString();
  // Only LOCK/UNLOCK may change the device's confirmed management_status —
  // executing a reminder or a device action must never mask or fabricate the
  // lock state on the portal.
  const isLockState = cmd.command_type === 'LOCK' || cmd.command_type === 'UNLOCK';
  // Atomic transition: the device-state write applies ONLY when this ack
  // actually moved the command row (a lost race leaves state untouched).
  const transition = async (patch: Record<string, unknown>) => {
    const { data: moved } = await svc.from('device_commands')
      .update(patch).eq('id', cmd.id).in('status', ['PENDING', 'RECEIVED']).select('id');
    return (moved?.length ?? 0) > 0;
  };
  // Keep customers.is_locked reconciled with the device-confirmed state.
  const setCustomerLocked = (locked: boolean) =>
    svc.from('customers').update({ is_locked: locked, lock_provider: 'TelePoint Device' }).eq('id', customerId);

  if (result === 'EXECUTED') {
    const moved = await transition({ status: 'EXECUTED', executed_at: nowIso, updated_at: nowIso });
    if (moved && isLockState) {
      await svc.from('devices').update({ management_status: executedStatusFor(cmd.command_type), updated_at: nowIso }).eq('id', device!.id);
      await setCustomerLocked(cmd.command_type === 'LOCK');
    }
    if (moved) await writeDeviceAudit(svc, { action: auditAction(cmd.command_type, 'EXECUTED'), customer_id: customerId, device_id: device!.id, command_id: cmd.id });
    return NextResponse.json({ status: moved ? 'EXECUTED' : cmd.status, idempotent: !moved });
  }

  // SUPERSEDED — the device unlocked locally (backend UNLOCK / offline TOTP /
  // offline SMS UNLOCK) AFTER this LOCK was issued, so the stale lock must not
  // re-lock the phone and the portal must not keep showing "Locked".
  if (result === 'SUPERSEDED') {
    const moved = await transition({ status: 'SUPERSEDED', executed_at: nowIso, updated_at: nowIso });
    if (moved) {
      // Only flip the portal to ACTIVE when no NEWER in-flight LOCK exists — a
      // fresh admin lock must keep showing pending/locked, not be masked.
      const { data: newer } = await svc.from('device_commands')
        .select('id').eq('device_id', device!.id).in('status', ['PENDING', 'RECEIVED'])
        .eq('command_type', 'LOCK').gt('created_at', cmd.created_at).limit(1);
      if (!newer || newer.length === 0) {
        await svc.from('devices').update({ management_status: 'ACTIVE', updated_at: nowIso }).eq('id', device!.id);
        await setCustomerLocked(false);
      }
      await writeDeviceAudit(svc, { action: auditAction(cmd.command_type, 'SUPERSEDED'), customer_id: customerId, device_id: device!.id, command_id: cmd.id });
    }
    return NextResponse.json({ status: moved ? 'SUPERSEDED' : cmd.status, idempotent: !moved });
  }

  // FAILED — record why; for LOCK/UNLOCK only, restore the device to the
  // opposite confirmed state (a failed lock never locked; a failed unlock
  // stays locked). Reminders/actions leave the lock state untouched.
  const moved = await transition({ status: 'FAILED', failure_reason: failureReason, updated_at: nowIso });
  if (moved && isLockState) {
    const revert = cmd.command_type === 'LOCK' ? 'ACTIVE' : 'LOCKED';
    await svc.from('devices').update({ management_status: revert, updated_at: nowIso }).eq('id', device!.id);
    await setCustomerLocked(revert === 'LOCKED');
  }
  if (moved) await writeDeviceAudit(svc, { action: auditAction(cmd.command_type, 'FAILED'), customer_id: customerId, device_id: device!.id, command_id: cmd.id, remark: failureReason });
  return NextResponse.json({ status: moved ? 'FAILED' : cmd.status, failure_reason: moved ? failureReason : null, idempotent: !moved });
}
