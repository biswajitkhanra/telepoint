import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { verifyCustomerSession } from '@/lib/customerSession';

/**
 * Shared server helpers for the device-management API routes. These routes are
 * the protected "edge function" layer: the retailer/admin surface authenticates
 * with a Supabase session, and the customer surface authenticates with the
 * signed customer session token issued at Aadhaar/mobile login. Both run with
 * the service-role client so RLS is enforced in application code here.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * Resolve the customer a request is authenticated as. Requires that the signed
 * session token in the body actually covers the claimed customer_id — knowing a
 * customer UUID is never enough (mirrors app/api/customer-login).
 */
export function customerFromSession(body: {
  customer_id?: unknown;
  session_token?: unknown;
}): string | null {
  const customerId = typeof body.customer_id === 'string' ? body.customer_id : null;
  if (!customerId || !isUuid(customerId)) return null;
  return verifyCustomerSession(body.session_token, customerId) ? customerId : null;
}

export interface AuthedStaff {
  userId: string;
  role: 'super_admin' | 'retailer';
}

/**
 * Resolve an authenticated retailer/admin from the request. Accepts BOTH the
 * Supabase cookie session (web portal) and an `Authorization: Bearer <token>`
 * access token (native retailer app). The role is read server-side from
 * profiles — never trusted from the client. Returns null when unauthenticated
 * or when the user has no staff role.
 */
export async function staffFromRequest(req: NextRequest): Promise<AuthedStaff | null> {
  const svc = createServiceClient();

  // 1) Bearer access token (mobile).
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
  let userId: string | null = null;
  if (bearer && bearer.length < 4096) {
    const { data } = await svc.auth.getUser(bearer);
    userId = data.user?.id ?? null;
  }

  // 2) Cookie session (web portal).
  if (!userId) {
    const { data } = await createClient().auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return null;

  const { data: profile } = await svc.from('profiles').select('role').eq('user_id', userId).single();
  const role = profile?.role;
  if (role !== 'super_admin' && role !== 'retailer') return null;
  return { userId, role };
}

export interface DeviceAuditInput {
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  customer_id?: string | null;
  device_id?: string | null;
  command_id?: string | null;
  metadata?: Record<string, unknown>;
  remark?: string | null;
}

/**
 * Append a device-management event to audit_log. audit_log has no device_id /
 * command_id columns, so those (plus any metadata) live in after_data — reusing
 * the existing table rather than inventing a parallel one.
 */
export async function writeDeviceAudit(
  svc: SupabaseClient,
  e: DeviceAuditInput,
): Promise<void> {
  await svc.from('audit_log').insert({
    actor_user_id: e.actor_user_id ?? null,
    actor_role: e.actor_role ?? 'customer',
    action: e.action,
    table_name: 'device_commands',
    record_id: e.command_id ?? e.device_id ?? null,
    after_data: {
      customer_id: e.customer_id ?? null,
      device_id: e.device_id ?? null,
      command_id: e.command_id ?? null,
      ...(e.metadata ?? {}),
    },
    remark: e.remark ?? null,
  }).then(
    () => {},
    () => {}, // audit must never block the primary action
  );
}
