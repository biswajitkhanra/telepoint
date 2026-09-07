import { PORTAL_BASE_URL } from '../config';
import { Customer, EMIScheduleItem, DueBreakdown, BroadcastItem, MultiLoanCustomer, NotificationHistoryItem } from '../types';

export interface LoginResponse {
  multi?: boolean;
  customers?: MultiLoanCustomer[];
  customer?: Customer;
  emis?: EMIScheduleItem[];
  breakdown?: DueBreakdown | null;
  broadcasts?: BroadcastItem[];
  error?: string;
}

/**
 * Log in using Aadhaar (12 digits) or Mobile (10 digits),
 * or directly load by customer_id (when selecting from multi-loan accounts).
 */
export async function loginCustomer(params: {
  aadhaar?: string;
  mobile?: string;
  customer_id?: string;
}): Promise<LoginResponse> {
  const url = `${PORTAL_BASE_URL}/api/customer-login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Portal server returned 404 at ${url}. Please verify your portal URL or deployment.`);
      }
      throw new Error(data.error || `Login failed (HTTP ${res.status})`);
    }
    return data as LoginResponse;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[API] Login error:', msg);
    if (msg.includes('Network request failed') || msg.includes('Failed to fetch')) {
      throw new Error(`Cannot connect to server at ${PORTAL_BASE_URL}. Please check your internet connection or EXPO_PUBLIC_PORTAL_URL.`);
    }
    throw err;
  }
}

/**
 * Register or refresh Expo push token and device information in Supabase.
 */
export async function registerPushToken(params: {
  customer_id: string;
  push_token: string;
  device_id?: string;
  device_name?: string;
  platform?: string;
  app_version?: string;
}): Promise<{ success: boolean; tokenId?: string }> {
  const url = `${PORTAL_BASE_URL}/api/customer-app-token/register`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        action: 'register',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[API] Token registration failed:', data.error);
      return { success: false };
    }
    return data;
  } catch (err) {
    console.warn('[API] Push token registration network exception:', err);
    return { success: false };
  }
}

/**
 * Deactivate push token on logout so this device stops receiving reminders.
 */
export async function deactivatePushToken(params: {
  customer_id: string;
  device_id?: string;
  push_token?: string;
}): Promise<void> {
  const url = `${PORTAL_BASE_URL}/api/customer-app-token/register`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        action: 'logout',
      }),
    });
  } catch (err) {
    console.warn('[API] Token deactivation failed:', err);
  }
}

/**
 * Fetch notification history for the customer.
 */
export async function fetchNotificationHistory(customerId: string): Promise<NotificationHistoryItem[]> {
  const url = `${PORTAL_BASE_URL}/api/notifications/history?customer_id=${customerId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return data.notifications || [];
  } catch {
    return [];
  }
}
