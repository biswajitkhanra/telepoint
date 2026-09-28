import type {
  DeviceCommand,
  DeviceCommandType,
  DeviceManagementStatus,
} from '@/lib/types';

/**
 * Pure, database-free rules for the device-management command lifecycle.
 * Shared by the server routes and mirrored by the customer app so both sides
 * agree on what "still valid", "already done" and "expired" mean.
 *
 * Design intent (Part 16 of the spec): the customer app must NEVER act on a
 * command just because a row exists. A command is executable only when it is
 * still in-flight, addressed to THIS device, not expired, and not already
 * terminal. Idempotency is keyed on the command UUID + terminal status.
 */

/** How long a freshly issued command stays actionable before it EXPIRES. */
export const COMMAND_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const TERMINAL_STATUSES: ReadonlySet<DeviceCommand['status']> = new Set([
  'EXECUTED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
]);

export function isTerminal(status: DeviceCommand['status']): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isExpired(cmd: Pick<DeviceCommand, 'expires_at'>, now: number = Date.now()): boolean {
  const exp = Date.parse(cmd.expires_at);
  return Number.isFinite(exp) ? exp <= now : true; // unparseable → treat as expired
}

export interface ExecutabilityContext {
  /** Customer id the caller is authenticated as (from the session token). */
  authenticatedCustomerId: string;
  /** The installation_id of the app install asking to execute. */
  installationId: string;
  /** The device row the command targets (already loaded by the server). */
  device: {
    id: string;
    customer_id: string;
    installation_id: string;
  } | null;
  now?: number;
}

// Kept as a single shape (not a discriminated union) so `.reason` is always
// accessible under the web tsconfig's non-strict narrowing. `reason` is set
// only on refusal.
export interface ExecutabilityResult {
  ok: boolean;
  reason?: string;
}

/**
 * The single gate every LOCK/UNLOCK passes before the native module runs.
 * Returns a machine reason string on refusal (also used as failure_reason).
 */
export function checkExecutable(
  cmd: Pick<DeviceCommand, 'id' | 'customer_id' | 'device_id' | 'command_type' | 'status' | 'expires_at'>,
  ctx: ExecutabilityContext,
): ExecutabilityResult {
  const now = ctx.now ?? Date.now();

  if (isTerminal(cmd.status)) return { ok: false, reason: `already_${cmd.status.toLowerCase()}` };
  if (cmd.status !== 'PENDING' && cmd.status !== 'RECEIVED') return { ok: false, reason: 'not_actionable' };
  if (isExpired(cmd, now)) return { ok: false, reason: 'expired' };

  if (cmd.customer_id !== ctx.authenticatedCustomerId) return { ok: false, reason: 'customer_mismatch' };

  if (!ctx.device) return { ok: false, reason: 'device_not_registered' };
  if (cmd.device_id !== ctx.device.id) return { ok: false, reason: 'device_mismatch' };
  if (cmd.customer_id !== ctx.device.customer_id) return { ok: false, reason: 'loan_mismatch' };
  if (ctx.device.installation_id !== ctx.installationId) return { ok: false, reason: 'installation_mismatch' };

  return { ok: true };
}

/** The device management_status while a command of this type is in flight. */
export function pendingStatusFor(type: DeviceCommandType): DeviceManagementStatus {
  return type === 'LOCK' ? 'LOCK_PENDING' : 'UNLOCK_PENDING';
}

/** The device management_status after the device confirms execution. */
export function executedStatusFor(type: DeviceCommandType): DeviceManagementStatus {
  return type === 'LOCK' ? 'LOCKED' : 'ACTIVE';
}

/** Audit action for a given command type + lifecycle event. */
export function auditAction(
  type: DeviceCommandType,
  event: 'REQUESTED' | 'RECEIVED' | 'EXECUTED' | 'FAILED',
): string {
  return `${type}_${event}`;
}
