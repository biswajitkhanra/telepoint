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
  const result = body.result === 'EXECUTED' || body.result === 'FAILED' ? body.result : null;
  const failureReason = typeof body.failure_reason === 'string' ? body.failure_reason.slice(0, 300) : null;
  if (!installationId || !commandId || !result) {
    return NextResponse.json({ error: 'installation_id, command_id and result are required' }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: device } = await svc.from('devices')
    .select('id, customer_id, installation_id').eq('customer_id', customerId).eq('installation_id', installationId).maybeSingle();

  const { data: cmd } = await svc.from('device_commands')
    .select('id, device_id, customer_id, command_type, status, expires_at').eq('id', commandId).maybeSingle();
  if (!cmd) return NextResponse.json({ error: 'Command not found' }, { status: 404 });

  // Idempotency — already resolved, return as-is without re-applying.
  if (isTerminal(cmd.status)) return NextResponse.json({ status: cmd.status, idempotent: true });

  // Full ownership / device / expiry gate before we trust the report.
  const gate = checkExecutable(cmd, { authenticatedCustomerId: customerId, installationId, device });
  if (!gate.ok) return NextResponse.json({ error: 'Command not acceptable', reason: gate.reason }, { status: 409 });

  const nowIso = new Date().toISOString();

  if (result === 'EXECUTED') {
    await svc.from('device_commands').update({ status: 'EXECUTED', executed_at: nowIso, updated_at: nowIso }).eq('id', cmd.id).in('status', ['PENDING', 'RECEIVED']);
    await svc.from('devices').update({ management_status: executedStatusFor(cmd.command_type), updated_at: nowIso }).eq('id', device!.id);
    await writeDeviceAudit(svc, { action: auditAction(cmd.command_type, 'EXECUTED'), customer_id: customerId, device_id: device!.id, command_id: cmd.id });
    return NextResponse.json({ status: 'EXECUTED' });
  }

  // FAILED — record why; leave the device in its prior confirmed state.
  await svc.from('device_commands').update({ status: 'FAILED', failure_reason: failureReason, updated_at: nowIso }).eq('id', cmd.id).in('status', ['PENDING', 'RECEIVED']);
  const revert = cmd.command_type === 'LOCK' ? 'ACTIVE' : 'LOCKED';
  await svc.from('devices').update({ management_status: revert, updated_at: nowIso }).eq('id', device!.id);
  await writeDeviceAudit(svc, { action: auditAction(cmd.command_type, 'FAILED'), customer_id: customerId, device_id: device!.id, command_id: cmd.id, remark: failureReason });
  return NextResponse.json({ status: 'FAILED', failure_reason: failureReason });
}
