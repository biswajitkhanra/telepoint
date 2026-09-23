import { createHmac } from 'crypto';
import { safeEqual } from '@/lib/safeEqual';

/**
 * Signed, stateless proof that a customer passed the Aadhaar / mobile login
 * for a given set of customer ids. Returned by /api/customer-login and sent
 * back with every `customer_id` lookup, so that knowing (or guessing) a
 * customer's UUID is no longer enough to read their account.
 *
 * Format: base64url(JSON {ids, exp}).base64url(HMAC-SHA256)
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — the app auto-refreshes it

function secret(): string {
  const s = process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('CUSTOMER_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set');
  // Domain-separated so the service key itself is never used directly as a MAC key.
  return createHmac('sha256', s).update('telepoint-customer-session-v1').digest('hex');
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function issueCustomerSession(customerIds: string[]): string {
  const payload = b64(JSON.stringify({ ids: Array.from(new Set(customerIds)).slice(0, 50), exp: Date.now() + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

/** True when `token` is a valid, unexpired session that covers `customerId`. */
export function verifyCustomerSession(token: unknown, customerId: string): boolean {
  if (typeof token !== 'string' || token.length > 4096) return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return false;
  try {
    if (!safeEqual(sign(payload), mac)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { ids?: unknown; exp?: unknown };
    return typeof data.exp === 'number' && data.exp > Date.now()
      && Array.isArray(data.ids) && data.ids.includes(customerId);
  } catch {
    return false;
  }
}

/** Covered ids of a valid session (for re-issuing a fresh one), else []. */
export function sessionCustomerIds(token: unknown): string[] {
  if (typeof token !== 'string') return [];
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return [];
  try {
    if (!safeEqual(sign(payload), mac)) return [];
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { ids?: unknown; exp?: unknown };
    if (typeof data.exp !== 'number' || data.exp <= Date.now() || !Array.isArray(data.ids)) return [];
    return data.ids.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}
