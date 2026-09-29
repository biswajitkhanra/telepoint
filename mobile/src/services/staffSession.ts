import * as SecureStore from 'expo-secure-store';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/**
 * Real staff (retailer/admin) authentication for the mobile app, backed by the
 * existing TelePoint Supabase Auth. Replaces the previous insecure flow that
 * hard-coded the project key and let staff in with no verified password. The
 * access/refresh tokens live only in the OS keystore (SecureStore); the
 * service-role key is never present in the app.
 */

const ACCESS_KEY = 'telepoint_staff_access_token';
const REFRESH_KEY = 'telepoint_staff_refresh_token';

export interface StaffSignInResult {
  ok: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

function configured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

/** Sign in with email + password against Supabase Auth (grant_type=password). */
export async function signInStaff(email: string, password: string): Promise<StaffSignInResult> {
  if (!configured()) {
    return { ok: false, error: 'App is not configured with Supabase credentials.' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token || !data?.user) {
      return { ok: false, error: data?.error_description || data?.msg || 'Incorrect username or password.' };
    }
    await SecureStore.setItemAsync(ACCESS_KEY, data.access_token).catch(() => {});
    if (data.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token).catch(() => {});
    return { ok: true, userId: data.user.id, email: data.user.email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Best-effort access token for Bearer-authenticated API calls; refreshes if needed. */
export async function getStaffAccessToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(ACCESS_KEY);
    if (token) return token;
  } catch { /* fall through */ }
  return refreshStaffSession();
}

async function refreshStaffSession(): Promise<string | null> {
  if (!configured()) return null;
  let refresh: string | null = null;
  try { refresh = await SecureStore.getItemAsync(REFRESH_KEY); } catch { refresh = null; }
  if (!refresh) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.access_token) {
      await SecureStore.setItemAsync(ACCESS_KEY, data.access_token).catch(() => {});
      if (data.refresh_token) await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token).catch(() => {});
      return data.access_token;
    }
  } catch { /* ignore */ }
  return null;
}

export async function clearStaffSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}
