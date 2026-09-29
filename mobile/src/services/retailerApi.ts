import { PORTAL_BASE_URL } from '../config';
import { getStaffAccessToken } from './staffSession';

/**
 * Retailer/admin client for device management. Every call carries the staff
 * Supabase access token as a Bearer header; the server re-verifies the role and
 * that the customer belongs to the caller. The app asserts no authority itself.
 */

async function authed<T>(path: string, bodyObj: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = await getStaffAccessToken();
  if (!token) return { ok: false, error: 'Not signed in' };
  try {
    const res = await fetch(`${PORTAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(bodyObj),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string })?.error || `HTTP ${res.status}` };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export interface RetailerDeviceView {
  customer: { id: string; name: string; mobile: string; model?: string | null };
  device: {
    id: string; management_status: string; admin_enabled: boolean;
    consent_granted_at?: string | null; registered_at: string; last_seen_at?: string | null;
    device_model?: string | null; device_manufacturer?: string | null; android_version?: string | null;
  } | null;
  commands: Array<{
    id: string; command_type: 'LOCK' | 'UNLOCK'; reason?: string | null; status: string;
    emi_amount?: number | null; created_at: string; executed_at?: string | null; expires_at: string; failure_reason?: string | null;
  }>;
  breakdown?: Record<string, unknown> | null;
}

export function fetchRetailerDevice(customerId: string) {
  return authed<RetailerDeviceView>('/api/device/retailer', { customer_id: customerId });
}

export function createDeviceCommand(customerId: string, commandType: 'LOCK' | 'UNLOCK', reason?: string) {
  return authed<{ command_id: string; status: string; expires_at: string }>(
    '/api/device/command',
    { customer_id: customerId, command_type: commandType, reason },
  );
}
